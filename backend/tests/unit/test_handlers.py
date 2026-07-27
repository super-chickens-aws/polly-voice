"""Unit tests for the Lambda handlers."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

try:
    from botocore.exceptions import ClientError
except ModuleNotFoundError:
    class ClientError(Exception):
        """Minimal botocore-compatible error used when dev dependencies are absent."""

        def __init__(self, response: dict[str, object], operation_name: str) -> None:
            super().__init__(operation_name)
            self.response = response

    def _unexpected_boto3_client(*args: object, **kwargs: object) -> None:
        raise AssertionError("AWS clients must be monkeypatched in unit tests.")

    fake_boto3 = ModuleType("boto3")
    fake_boto3.client = _unexpected_boto3_client  # type: ignore[attr-defined]
    fake_botocore = ModuleType("botocore")
    fake_exceptions = ModuleType("botocore.exceptions")
    fake_exceptions.ClientError = ClientError  # type: ignore[attr-defined]
    fake_botocore.exceptions = fake_exceptions  # type: ignore[attr-defined]
    sys.modules["boto3"] = fake_boto3
    sys.modules["botocore"] = fake_botocore
    sys.modules["botocore.exceptions"] = fake_exceptions

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class LambdaContext:
    """Small Lambda context test double."""

    aws_request_id = "unit-test-request"


class FakeAudioStream:
    def __init__(self, data: bytes = b"audio-bytes") -> None:
        self.data = data
        self.closed = False

    def read(self) -> bytes:
        return self.data

    def close(self) -> None:
        self.closed = True


class FakePolly:
    def __init__(self, stream: FakeAudioStream, error: ClientError | None = None) -> None:
        self.stream = stream
        self.error = error
        self.calls: list[dict[str, str]] = []

    def synthesize_speech(self, **kwargs: str) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"AudioStream": self.stream, "ContentType": "audio/mpeg"}


class FakeS3:
    def __init__(self, put_error: ClientError | None = None) -> None:
        self.put_error = put_error
        self.put_calls: list[dict[str, object]] = []
        self.presign_calls: list[dict[str, object]] = []

    def put_object(self, **kwargs: object) -> None:
        self.put_calls.append(kwargs)
        if self.put_error is not None:
            raise self.put_error

    def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
        self.presign_calls.append({"operation": operation, **kwargs})
        return "https://example.test/presigned-audio"


def _load_handler(name: str) -> ModuleType:
    module_path = BACKEND_ROOT / "src" / name / "app.py"
    spec = importlib.util.spec_from_file_location(f"{name}_app", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load handler module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "test error"}}, "test")


def _preview_event(payload: object) -> dict[str, str]:
    return {"httpMethod": "POST", "resource": "/tts/preview", "body": json.dumps(payload)}


def _configure_preview_clients(
    monkeypatch: Any, handler: ModuleType, polly: FakePolly, s3: FakeS3
) -> None:
    monkeypatch.setattr(handler, "_create_polly_client", lambda: polly)
    monkeypatch.setattr(handler, "_create_s3_client", lambda: s3)
    monkeypatch.setenv("MEDIA_BUCKET_NAME", "unit-test-media")
    monkeypatch.setenv("PRESIGNED_URL_TTL_SECONDS", "900")


def _preview_response(
    monkeypatch: Any,
    payload: object,
    *,
    polly_error: ClientError | None = None,
    s3_error: ClientError | None = None,
) -> tuple[dict[str, Any], FakePolly, FakeS3, FakeAudioStream]:
    handler = _load_handler("api")
    stream = FakeAudioStream()
    polly = FakePolly(stream, polly_error)
    s3 = FakeS3(s3_error)
    _configure_preview_clients(monkeypatch, handler, polly, s3)
    return handler.lambda_handler(_preview_event(payload), LambdaContext()), polly, s3, stream


def test_tts_preview_returns_presigned_mp3_url(monkeypatch: Any) -> None:
    response, polly, s3, _ = _preview_response(
        monkeypatch,
        {
            "text": "Hello from Polly Voice",
            "voice": "Joanna",
            "engine": "neural",
            "output_format": "mp3",
        },
    )

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {
        "audio_url": "https://example.test/presigned-audio",
        "expires_in": 900,
        "voice": "Joanna",
        "engine": "neural",
        "output_format": "mp3",
    }
    assert polly.calls == [
        {
            "Text": "Hello from Polly Voice",
            "VoiceId": "Joanna",
            "Engine": "neural",
            "OutputFormat": "mp3",
        }
    ]
    assert s3.put_calls[0]["Bucket"] == "unit-test-media"
    assert s3.put_calls[0]["Body"] == b"audio-bytes"
    assert s3.put_calls[0]["ContentType"] == "audio/mpeg"
    assert str(s3.put_calls[0]["Key"]).startswith("cache/tts/")
    assert str(s3.put_calls[0]["Key"]).endswith(".mp3")
    assert s3.presign_calls[0]["operation"] == "get_object"
    assert s3.presign_calls[0]["ExpiresIn"] == 900


def test_tts_preview_defaults_engine_and_output_format(monkeypatch: Any) -> None:
    response, polly, _, _ = _preview_response(
        monkeypatch, {"text": "Hello", "voice": "Joanna"}
    )

    assert response["statusCode"] == 200
    assert polly.calls[0]["Engine"] == "neural"
    assert polly.calls[0]["OutputFormat"] == "mp3"
    assert json.loads(response["body"])["engine"] == "neural"
    assert json.loads(response["body"])["output_format"] == "mp3"


def test_tts_preview_rejects_invalid_json() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {"httpMethod": "POST", "resource": "/tts/preview", "body": "{"}, LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JSON"


def test_tts_preview_rejects_missing_text() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(_preview_event({"voice": "Joanna"}), LambdaContext())

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "MISSING_TEXT"


def test_tts_preview_rejects_blank_text() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _preview_event({"text": "   ", "voice": "Joanna"}), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_TEXT"


def test_tts_preview_rejects_text_longer_than_500_characters() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _preview_event({"text": "a" * 501, "voice": "Joanna"}), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "TEXT_TOO_LONG"


def test_tts_preview_rejects_missing_voice() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(_preview_event({"text": "Hello"}), LambdaContext())

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "MISSING_VOICE"


def test_tts_preview_rejects_invalid_engine() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _preview_event({"text": "Hello", "voice": "Joanna", "engine": "generative"}),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_ENGINE"


def test_tts_preview_rejects_invalid_output_format() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _preview_event({"text": "Hello", "voice": "Joanna", "output_format": "wav"}),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_OUTPUT_FORMAT"


def test_tts_preview_returns_400_for_polly_validation_error(monkeypatch: Any) -> None:
    response, _, _, _ = _preview_response(
        monkeypatch,
        {"text": "Hello", "voice": "Joanna"},
        polly_error=_client_error("InvalidVoiceIdException"),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "POLLY_VALIDATION_ERROR"


def test_tts_preview_returns_502_for_polly_service_error(monkeypatch: Any) -> None:
    response, _, _, _ = _preview_response(
        monkeypatch,
        {"text": "Hello", "voice": "Joanna"},
        polly_error=_client_error("ServiceFailureException"),
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "POLLY_SERVICE_ERROR"


def test_tts_preview_returns_502_for_s3_put_error(monkeypatch: Any) -> None:
    response, _, _, _ = _preview_response(
        monkeypatch,
        {"text": "Hello", "voice": "Joanna"},
        s3_error=_client_error("InternalError"),
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "STORAGE_SERVICE_ERROR"


def test_tts_preview_closes_audio_stream(monkeypatch: Any) -> None:
    _, _, _, stream = _preview_response(monkeypatch, {"text": "Hello", "voice": "Joanna"})

    assert stream.closed is True


def test_other_api_routes_still_return_501() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {"httpMethod": "GET", "resource": "/profile"}, LambdaContext()
    )

    assert response["statusCode"] == 501
    assert json.loads(response["body"])["error"]["code"] == "NOT_IMPLEMENTED"


def test_tts_worker_acknowledges_sqs_batch() -> None:
    module = _load_handler("tts_worker")
    response = module.lambda_handler(
        {"Records": [{"messageId": "tts-message"}]},
        LambdaContext(),
    )

    assert response == {"batchItemFailures": []}


def test_stt_worker_acknowledges_sqs_batch() -> None:
    module = _load_handler("stt_worker")
    response = module.lambda_handler(
        {"Records": [{"messageId": "stt-message"}]},
        LambdaContext(),
    )

    assert response == {"batchItemFailures": []}


def test_completion_accepts_eventbridge_event() -> None:
    module = _load_handler("completion")
    response = module.lambda_handler(
        {"source": "aws.transcribe", "detail-type": "Transcribe Job State Change"},
        LambdaContext(),
    )

    assert response == {"processed": 1}
