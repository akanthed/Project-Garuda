export interface WavRecording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

interface WavRecordingOptions {
  onSilence?: () => void;
  silenceMs?: number;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const value of chunk) {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function startWavRecording(options: WavRecordingOptions = {}): Promise<WavRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentOutput = context.createGain();
  const chunks: Float32Array[] = [];
  let active = true;
  let speechDetected = false;
  let lastSpeechAt = 0;
  let silenceReported = false;
  const silenceMs = options.silenceMs ?? 1_200;

  silentOutput.gain.value = 0;
  processor.onaudioprocess = (event) => {
    const samples = new Float32Array(event.inputBuffer.getChannelData(0));
    chunks.push(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const now = performance.now();
    if (rms >= 0.015) {
      speechDetected = true;
      lastSpeechAt = now;
    } else if (speechDetected && !silenceReported && now - lastSpeechAt >= silenceMs) {
      silenceReported = true;
      queueMicrotask(() => options.onSilence?.());
    }
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);

  const close = async () => {
    if (!active) return;
    active = false;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    silentOutput.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
  };

  return {
    stop: async () => {
      await close();
      return encodeWav(chunks, context.sampleRate);
    },
    cancel: () => {
      void close();
    },
  };
}