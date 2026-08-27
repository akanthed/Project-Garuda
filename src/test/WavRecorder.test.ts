import { describe, expect, it } from "vitest";
import { encodeWav } from "@/lib/wav-recorder";
import { speechChunks } from "@/components/dashboard/TopBar";

describe("WAV recorder", () => {
  it("encodes mono 16-bit PCM with a valid RIFF header", async () => {
    const wav = encodeWav([new Float32Array([-1, 0, 1])], 48_000);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(wav);
    });
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer);
    const ascii = (start: number, length: number) =>
      String.fromCharCode(...bytes.slice(start, start + length));

    expect(wav.type).toBe("audio/wav");
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(bytes.byteLength).toBe(50);
  });

  it("keeps TTS chunks within the QuickML text limit", () => {
    const chunks = speechChunks("Garuda can search cases, compare districts, summarize trends, forecast stations, and explain risk evidence for supervisors.");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.join(" ")).toContain("forecast stations");
    expect(speechChunks("crime, area; high-risk").join(" ")).toBe("crime area high risk");
  });
});