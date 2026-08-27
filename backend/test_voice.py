import json
from unittest.mock import Mock, patch

import pytest

import main


def _response(payload: dict) -> Mock:
    response = Mock()
    response.read.return_value = json.dumps(payload).encode()
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    return response


def test_quickml_transcription_forwards_audio_and_language():
    with (
        patch.object(main, "_quickml_connection_headers", return_value={
            "Authorization": "Zoho-oauthtoken test",
            "CATALYST-ORG": "123",
        }),
        patch.object(main.urllib.request, "urlopen", return_value=_response({
            "status": "success",
            "language": "kn",
            "text": "ಪರೀಕ್ಷೆ",
            "processing_time_ms": 120,
        })) as urlopen,
    ):
        result = main._quickml_transcribe_sync(
            b"RIFF-audio", "voice recording.wav", "audio/wav", "kn", Mock()
        )

    request = urlopen.call_args.args[0]
    body = request.data
    assert b'name="file"; filename="voice_recording.wav"' in body
    assert b"Content-Type: audio/wav" in body
    assert b"RIFF-audio" in body
    assert b'name="language"' in body
    assert b"\r\nkn\r\n" in body
    assert request.headers["Environment"] == "Development"
    assert result == {
        "text": "ಪರೀಕ್ಷೆ",
        "language": "kn",
        "processing_time_ms": 120,
        "source": "quickml_stt",
    }


def test_quickml_transcription_rejects_empty_text():
    with (
        patch.object(main, "_quickml_connection_headers", return_value={
            "Authorization": "Zoho-oauthtoken test",
            "CATALYST-ORG": "123",
        }),
        patch.object(main.urllib.request, "urlopen", return_value=_response({"status": "success"})),
        pytest.raises(RuntimeError, match="returned no text"),
    ):
        main._quickml_transcribe_sync(b"audio", "voice.wav", "audio/wav", "en", Mock())


def test_quickml_synthesis_uses_kannada_voice_and_returns_wav():
    response = Mock()
    response.read.return_value = b"RIFF-kannada-audio"
    response.headers = {"X-Audio-Info": '{"language":"kn","speaker":"Anu"}'}
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    with (
        patch.object(main, "_quickml_connection_headers", return_value={
            "Authorization": "Zoho-oauthtoken test",
            "CATALYST-ORG": "123",
        }),
        patch.object(main.urllib.request, "urlopen", return_value=response) as urlopen,
    ):
        audio, audio_info = main._quickml_synthesize_sync("ನಮಸ್ಕಾರ", "kn", Mock())

    request = urlopen.call_args.args[0]
    payload = json.loads(request.data.decode())
    assert payload == {
        "text": "ನಮಸ್ಕಾರ",
        "language": "kn",
        "speaker": "Anu",
        "pitch": "moderate",
        "speed": "moderate",
        "emotion": "neutral",
    }
    assert audio.startswith(b"RIFF")
    assert audio_info == '{"language":"kn","speaker":"Anu"}'