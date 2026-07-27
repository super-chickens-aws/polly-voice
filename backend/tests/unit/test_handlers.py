"""Unit tests for the Lambda handlers."""

from __future__ import annotations

import importlib.util
import json
import sys
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

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
    def __init__(
        self,
        put_error: ClientError | None = None,
        presign_error: Exception | None = None,
    ) -> None:
        self.put_error = put_error
        self.presign_error = presign_error
        self.put_calls: list[dict[str, object]] = []
        self.presign_calls: list[dict[str, object]] = []

    def put_object(self, **kwargs: object) -> None:
        self.put_calls.append(kwargs)
        if self.put_error is not None:
            raise self.put_error

    def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
        self.presign_calls.append({"operation": operation, **kwargs})
        if self.presign_error is not None:
            raise self.presign_error
        return "https://example.test/presigned-audio"


class FakeUsersTable:
    def __init__(
        self,
        *,
        item: dict[str, object] | None = None,
        get_error: ClientError | None = None,
        update_error: ClientError | None = None,
    ) -> None:
        self.item = item
        self.get_error = get_error
        self.update_error = update_error
        self.get_calls: list[dict[str, object]] = []
        self.update_calls: list[dict[str, object]] = []

    def get_item(self, **kwargs: object) -> dict[str, object]:
        self.get_calls.append(kwargs)
        if self.get_error is not None:
            raise self.get_error
        return {} if self.item is None else {"Item": self.item}

    def update_item(self, **kwargs: Any) -> dict[str, object]:
        self.update_calls.append(kwargs)
        if self.update_error is not None:
            raise self.update_error
        values = kwargs["ExpressionAttributeValues"]
        return {
            "Attributes": {
                "cognito_sub": kwargs["Key"]["cognito_sub"],
                "display_name": values[":display_name"],
                "preferred_language": values[":preferred_language"],
                "created_at": values[":created_at"],
                "updated_at": values[":updated_at"],
            }
        }


class FakeJobsTable:
    def __init__(
        self,
        *,
        item: dict[str, object] | None = None,
        items: list[dict[str, object]] | None = None,
        put_error: ClientError | None = None,
        query_error: ClientError | None = None,
        get_error: ClientError | None = None,
        update_error: ClientError | None = None,
    ) -> None:
        self.item = item
        self.items = items or []
        self.put_error = put_error
        self.query_error = query_error
        self.get_error = get_error
        self.update_error = update_error
        self.put_calls: list[dict[str, object]] = []
        self.query_calls: list[dict[str, object]] = []
        self.get_calls: list[dict[str, object]] = []
        self.update_calls: list[dict[str, object]] = []

    def put_item(self, **kwargs: object) -> None:
        self.put_calls.append(kwargs)
        if self.put_error is not None:
            raise self.put_error

    def query(self, **kwargs: object) -> dict[str, object]:
        self.query_calls.append(kwargs)
        if self.query_error is not None:
            raise self.query_error
        return {"Items": self.items}

    def get_item(self, **kwargs: object) -> dict[str, object]:
        self.get_calls.append(kwargs)
        if self.get_error is not None:
            raise self.get_error
        return {} if self.item is None else {"Item": self.item}

    def update_item(self, **kwargs: object) -> None:
        self.update_calls.append(kwargs)
        if self.update_error is not None:
            raise self.update_error


class FakeSQS:
    def __init__(self, error: ClientError | None = None) -> None:
        self.error = error
        self.calls: list[dict[str, object]] = []

    def send_message(self, **kwargs: object) -> None:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error


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


def test_api_response_serializes_integral_decimal_as_integer() -> None:
    handler = _load_handler("api")

    response = handler._response(200, {"value": Decimal("123")})

    assert json.loads(response["body"]) == {"value": 123}
    assert isinstance(json.loads(response["body"])["value"], int)


def test_api_response_serializes_fractional_decimal_as_number() -> None:
    handler = _load_handler("api")

    response = handler._response(200, {"value": Decimal("12.5")})

    assert json.loads(response["body"]) == {"value": 12.5}
    assert isinstance(json.loads(response["body"])["value"], float)


def test_api_response_rejects_unsupported_json_values() -> None:
    handler = _load_handler("api")

    with pytest.raises(TypeError):
        handler._response(200, {"value": object()})


LOCAL_FRONTEND_ORIGIN = "http://localhost:5173"
AMPLIFY_FRONTEND_ORIGIN = (
    "https://ductest.d3hm91wq3i4ey8.amplifyapp.com"
)
CORS_ALLOWLIST = f"{LOCAL_FRONTEND_ORIGIN},{AMPLIFY_FRONTEND_ORIGIN}"


def _preview_event(
    payload: object, origin: str | None = None
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "httpMethod": "POST",
        "resource": "/tts/preview",
        "body": json.dumps(payload),
    }
    if origin is not None:
        event["headers"] = {"Origin": origin}
    return event


def _profile_event(method: str, payload: object | None = None) -> dict[str, Any]:
    event: dict[str, Any] = {
        "httpMethod": method,
        "resource": "/profile",
        "requestContext": {
            "authorizer": {
                "claims": {
                    "sub": "authenticated-user",
                }
            }
        },
    }
    if payload is not None:
        event["body"] = json.dumps(payload)
    return event


def _job_event(
    method: str,
    resource: str = "/tts/jobs",
    payload: object | None = None,
    *,
    job_id: str | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "httpMethod": method,
        "resource": resource,
        "requestContext": {
            "authorizer": {
                "claims": {
                    "sub": "authenticated-user",
                }
            }
        },
    }
    if payload is not None:
        event["body"] = json.dumps(payload)
    if resource in {
        "/tts/jobs/{job_id}",
        "/tts/jobs/{job_id}/download",
    }:
        event["pathParameters"] = {} if job_id is None else {"job_id": job_id}
    return event


def _valid_job_payload() -> dict[str, str]:
    return {
        "text": "Text to synthesize",
        "voice": "Joanna",
        "engine": "neural",
        "output_format": "mp3",
    }


def _configure_job_services(
    monkeypatch: Any, handler: ModuleType, table: FakeJobsTable, sqs: FakeSQS
) -> None:
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)
    monkeypatch.setattr(handler, "_create_sqs_client", lambda: sqs)
    monkeypatch.setenv("CONVERSION_JOBS_TABLE_NAME", "unit-test-jobs")
    monkeypatch.setenv("TTS_QUEUE_URL", "https://sqs.example.test/tts")
    monkeypatch.setenv("JOB_TTL_DAYS", "30")


def _create_job_response(
    monkeypatch: Any,
    payload: object,
    *,
    table: FakeJobsTable | None = None,
    sqs: FakeSQS | None = None,
) -> tuple[dict[str, Any], FakeJobsTable, FakeSQS]:
    handler = _load_handler("api")
    fake_table = table or FakeJobsTable()
    fake_sqs = sqs or FakeSQS()
    _configure_job_services(monkeypatch, handler, fake_table, fake_sqs)
    response = handler.lambda_handler(
        _job_event("POST", payload=payload), LambdaContext()
    )
    return response, fake_table, fake_sqs


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
    origin: str | None = None,
) -> tuple[dict[str, Any], FakePolly, FakeS3, FakeAudioStream]:
    handler = _load_handler("api")
    stream = FakeAudioStream()
    polly = FakePolly(stream, polly_error)
    s3 = FakeS3(s3_error)
    _configure_preview_clients(monkeypatch, handler, polly, s3)
    return (
        handler.lambda_handler(
            _preview_event(payload, origin), LambdaContext()
        ),
        polly,
        s3,
        stream,
    )


@pytest.mark.parametrize(
    "origin", [LOCAL_FRONTEND_ORIGIN, AMPLIFY_FRONTEND_ORIGIN]
)
def test_api_cors_allows_configured_frontend_origins(
    monkeypatch: Any, origin: str
) -> None:
    monkeypatch.setenv("FRONTEND_ORIGINS", CORS_ALLOWLIST)
    response, _, _, _ = _preview_response(
        monkeypatch,
        {
            "text": "Allowed origin test",
            "voice": "Joanna",
            "engine": "neural",
            "output_format": "mp3",
        },
        origin=origin,
    )

    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Origin"] == origin
    assert response["headers"]["Vary"] == "Origin"
    assert "Access-Control-Allow-Credentials" not in response["headers"]


def test_api_cors_does_not_reflect_unknown_origin(
    monkeypatch: Any,
) -> None:
    monkeypatch.setenv("FRONTEND_ORIGINS", CORS_ALLOWLIST)
    handler = _load_handler("api")

    response = handler.lambda_handler(
        {
            "httpMethod": "GET",
            "resource": "/unknown",
            "headers": {"origin": "https://unknown.example"},
        },
        LambdaContext(),
    )

    assert response["statusCode"] == 501
    assert "Access-Control-Allow-Origin" not in response["headers"]
    assert response["headers"]["Vary"] == "Origin"


@pytest.mark.parametrize(
    "status_code", [400, 401, 404, 409, 500, 502]
)
def test_api_error_responses_include_cors_for_allowed_origin(
    monkeypatch: Any, status_code: int
) -> None:
    monkeypatch.setenv("FRONTEND_ORIGINS", CORS_ALLOWLIST)
    handler = _load_handler("api")
    event = {"headers": {"Origin": AMPLIFY_FRONTEND_ORIGIN}}

    response = handler._with_cors(
        handler._error_response(
            status_code,
            "TEST_ERROR",
            "Safe test error.",
            "unit-test-request",
        ),
        event,
    )

    assert response["statusCode"] == status_code
    assert (
        response["headers"]["Access-Control-Allow-Origin"]
        == AMPLIFY_FRONTEND_ORIGIN
    )


def test_api_options_preflight_returns_allowlisted_cors_headers(
    monkeypatch: Any,
) -> None:
    monkeypatch.setenv("FRONTEND_ORIGINS", CORS_ALLOWLIST)
    handler = _load_handler("api")

    response = handler.lambda_handler(
        {
            "httpMethod": "OPTIONS",
            "resource": "/tts/jobs/{job_id}/download",
            "headers": {
                "origin": AMPLIFY_FRONTEND_ORIGIN,
                "access-control-request-method": "GET",
                "access-control-request-headers": (
                    "authorization,content-type"
                ),
            },
        },
        LambdaContext(),
    )

    assert response["statusCode"] == 204
    assert response["body"] == ""
    assert (
        response["headers"]["Access-Control-Allow-Origin"]
        == AMPLIFY_FRONTEND_ORIGIN
    )
    assert (
        response["headers"]["Access-Control-Allow-Headers"]
        == "Content-Type,Authorization"
    )
    assert (
        response["headers"]["Access-Control-Allow-Methods"]
        == "GET,POST,PUT,DELETE,OPTIONS"
    )
    assert response["headers"]["Access-Control-Max-Age"] == "600"
    assert "Access-Control-Allow-Credentials" not in response["headers"]


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


def test_get_profile_success(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    item = {
        "cognito_sub": "authenticated-user",
        "display_name": "Tri",
        "preferred_language": "vi-VN",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
    }
    table = FakeUsersTable(item=item)
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)

    response = handler.lambda_handler(_profile_event("GET"), LambdaContext())

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"profile": item}
    assert table.get_calls == [{"Key": {"cognito_sub": "authenticated-user"}}]


def test_get_profile_not_found(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeUsersTable()
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)

    response = handler.lambda_handler(_profile_event("GET"), LambdaContext())

    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"]["code"] == "PROFILE_NOT_FOUND"


def test_get_profile_missing_claims_returns_401() -> None:
    handler = _load_handler("api")
    event = {
        "httpMethod": "GET",
        "resource": "/profile",
        "requestContext": {"authorizer": {}},
    }

    response = handler.lambda_handler(event, LambdaContext())

    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"] == {
        "code": "UNAUTHORIZED",
        "message": "A valid authenticated user is required.",
        "request_id": "unit-test-request",
    }


def test_get_profile_missing_sub_returns_401() -> None:
    handler = _load_handler("api")
    event = {
        "httpMethod": "GET",
        "resource": "/profile",
        "requestContext": {"authorizer": {"claims": {"email": "tri@example.test"}}},
    }

    response = handler.lambda_handler(event, LambdaContext())

    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"


def test_put_profile_success(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeUsersTable()
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)

    response = handler.lambda_handler(
        _profile_event(
            "PUT", {"display_name": "Tri", "preferred_language": "vi-VN"}
        ),
        LambdaContext(),
    )

    body = json.loads(response["body"])
    assert response["statusCode"] == 200
    assert body["profile"]["cognito_sub"] == "authenticated-user"
    assert body["profile"]["display_name"] == "Tri"
    assert body["profile"]["preferred_language"] == "vi-VN"
    assert body["profile"]["created_at"].endswith("Z")
    assert body["profile"]["updated_at"].endswith("Z")
    assert table.update_calls[0]["ReturnValues"] == "ALL_NEW"


def test_put_profile_uses_sub_from_authorizer_claims(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeUsersTable()
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)
    event = _profile_event(
        "PUT", {"display_name": "Tri", "preferred_language": "en-US"}
    )
    event["requestContext"]["authorizer"]["claims"]["sub"] = "claim-user-id"

    handler.lambda_handler(event, LambdaContext())

    assert table.update_calls[0]["Key"] == {"cognito_sub": "claim-user-id"}


def test_put_profile_uses_if_not_exists_for_created_at(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeUsersTable()
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)

    handler.lambda_handler(
        _profile_event(
            "PUT", {"display_name": "Tri", "preferred_language": "vi-VN"}
        ),
        LambdaContext(),
    )

    call = table.update_calls[0]
    assert "if_not_exists(#created_at, :created_at)" in call["UpdateExpression"]
    assert call["ExpressionAttributeNames"]["#created_at"] == "created_at"


def test_put_profile_trims_display_name(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeUsersTable()
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)

    response = handler.lambda_handler(
        _profile_event(
            "PUT", {"display_name": "  Tri  ", "preferred_language": "vi-VN"}
        ),
        LambdaContext(),
    )

    assert response["statusCode"] == 200
    assert (
        table.update_calls[0]["ExpressionAttributeValues"][":display_name"] == "Tri"
    )


def test_put_profile_rejects_invalid_json() -> None:
    handler = _load_handler("api")
    event = _profile_event("PUT")
    event["body"] = "{"

    response = handler.lambda_handler(event, LambdaContext())

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JSON"


def test_put_profile_rejects_missing_display_name() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event("PUT", {"preferred_language": "vi-VN"}), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "MISSING_DISPLAY_NAME"


def test_put_profile_rejects_blank_display_name() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event(
            "PUT", {"display_name": "   ", "preferred_language": "vi-VN"}
        ),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_DISPLAY_NAME"


def test_put_profile_rejects_display_name_longer_than_80_characters() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event(
            "PUT", {"display_name": "a" * 81, "preferred_language": "vi-VN"}
        ),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_DISPLAY_NAME"


def test_put_profile_rejects_missing_preferred_language() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event("PUT", {"display_name": "Tri"}), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert (
        json.loads(response["body"])["error"]["code"]
        == "MISSING_PREFERRED_LANGUAGE"
    )


def test_put_profile_rejects_invalid_preferred_language() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event(
            "PUT", {"display_name": "Tri", "preferred_language": "fr-FR"}
        ),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert (
        json.loads(response["body"])["error"]["code"]
        == "INVALID_PREFERRED_LANGUAGE"
    )


def test_put_profile_rejects_unknown_fields() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event(
            "PUT",
            {
                "display_name": "Tri",
                "preferred_language": "vi-VN",
                "theme": "dark",
            },
        ),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "UNKNOWN_FIELDS"


def test_put_profile_rejects_cognito_sub_from_request_body() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _profile_event(
            "PUT",
            {
                "display_name": "Tri",
                "preferred_language": "vi-VN",
                "cognito_sub": "attacker-controlled-id",
            },
        ),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "UNKNOWN_FIELDS"


def test_profile_database_client_error_returns_502(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeUsersTable(get_error=_client_error("InternalServerError"))
    monkeypatch.setattr(handler, "_create_users_table", lambda: table)

    response = handler.lambda_handler(_profile_event("GET"), LambdaContext())

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "DATABASE_ERROR"


def test_post_tts_job_success(monkeypatch: Any) -> None:
    response, _, _ = _create_job_response(monkeypatch, _valid_job_payload())

    job = json.loads(response["body"])["job"]
    assert response["statusCode"] == 202
    assert job["type"] == "TTS"
    assert job["status"] == "QUEUED"
    assert job["voice"] == "Joanna"
    assert job["engine"] == "neural"
    assert job["output_format"] == "mp3"
    assert isinstance(job["created_at"], int)
    assert job["updated_at"] == job["created_at"]


def test_post_tts_job_stores_correct_dynamodb_item(monkeypatch: Any) -> None:
    _, table, _ = _create_job_response(
        monkeypatch,
        {
            "text": "  Text to synthesize  ",
            "voice": "Joanna",
            "engine": "standard",
            "output_format": "ogg_vorbis",
        },
    )

    item = table.put_calls[0]["Item"]
    assert item["owner_sub"] == "authenticated-user"
    assert item["type"] == "TTS"
    assert item["status"] == "QUEUED"
    assert item["text"] == "Text to synthesize"
    assert item["voice"] == "Joanna"
    assert item["engine"] == "standard"
    assert item["output_format"] == "ogg_vorbis"
    assert item["updated_at"] == item["created_at"]
    assert item["expires_at"] == item["created_at"] + 30 * 86400


def test_post_tts_job_sends_only_job_id_and_type_to_sqs(monkeypatch: Any) -> None:
    _, table, sqs = _create_job_response(monkeypatch, _valid_job_payload())

    message = json.loads(sqs.calls[0]["MessageBody"])
    assert message == {
        "job_id": table.put_calls[0]["Item"]["job_id"],
        "type": "TTS",
    }
    assert sqs.calls[0]["QueueUrl"] == "https://sqs.example.test/tts"


def test_post_tts_job_uses_owner_sub_from_claims(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable()
    sqs = FakeSQS()
    _configure_job_services(monkeypatch, handler, table, sqs)
    event = _job_event("POST", payload=_valid_job_payload())
    event["requestContext"]["authorizer"]["claims"]["sub"] = "claim-owner"

    handler.lambda_handler(event, LambdaContext())

    assert table.put_calls[0]["Item"]["owner_sub"] == "claim-owner"


def test_post_tts_job_does_not_return_text(monkeypatch: Any) -> None:
    response, _, _ = _create_job_response(monkeypatch, _valid_job_payload())

    assert "text" not in json.loads(response["body"])["job"]


def test_post_tts_job_missing_authentication_returns_401() -> None:
    handler = _load_handler("api")
    event = {
        "httpMethod": "POST",
        "resource": "/tts/jobs",
        "body": json.dumps(_valid_job_payload()),
    }

    response = handler.lambda_handler(event, LambdaContext())

    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"


def test_post_tts_job_rejects_invalid_json() -> None:
    handler = _load_handler("api")
    event = _job_event("POST")
    event["body"] = "{"

    response = handler.lambda_handler(event, LambdaContext())

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JSON"


def test_post_tts_job_rejects_missing_text() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _job_event("POST", payload={"voice": "Joanna"}), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "MISSING_TEXT"


def test_post_tts_job_rejects_blank_text() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _job_event("POST", payload={"text": "   ", "voice": "Joanna"}),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_TEXT"


def test_post_tts_job_rejects_text_longer_than_3000_characters() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _job_event("POST", payload={"text": "a" * 3001, "voice": "Joanna"}),
        LambdaContext(),
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "TEXT_TOO_LONG"


def test_post_tts_job_rejects_missing_voice() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _job_event("POST", payload={"text": "Hello"}), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "MISSING_VOICE"


def test_post_tts_job_rejects_invalid_engine() -> None:
    handler = _load_handler("api")
    payload = _valid_job_payload()
    payload["engine"] = "generative"

    response = handler.lambda_handler(
        _job_event("POST", payload=payload), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_ENGINE"


def test_post_tts_job_rejects_invalid_output_format() -> None:
    handler = _load_handler("api")
    payload = _valid_job_payload()
    payload["output_format"] = "wav"

    response = handler.lambda_handler(
        _job_event("POST", payload=payload), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_OUTPUT_FORMAT"


def test_post_tts_job_rejects_unknown_fields() -> None:
    handler = _load_handler("api")
    payload = _valid_job_payload()
    payload["priority"] = "high"

    response = handler.lambda_handler(
        _job_event("POST", payload=payload), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "UNKNOWN_FIELDS"


def test_post_tts_job_rejects_owner_sub_from_body() -> None:
    handler = _load_handler("api")
    payload = _valid_job_payload()
    payload["owner_sub"] = "attacker-controlled-owner"

    response = handler.lambda_handler(
        _job_event("POST", payload=payload), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "UNKNOWN_FIELDS"


def test_post_tts_job_database_put_failure_returns_502(monkeypatch: Any) -> None:
    table = FakeJobsTable(put_error=_client_error("InternalServerError"))
    response, _, sqs = _create_job_response(
        monkeypatch, _valid_job_payload(), table=table
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "DATABASE_ERROR"
    assert sqs.calls == []


def test_post_tts_job_sqs_failure_marks_job_failed(monkeypatch: Any) -> None:
    table = FakeJobsTable()
    sqs = FakeSQS(_client_error("ServiceUnavailable"))
    response, _, _ = _create_job_response(
        monkeypatch, _valid_job_payload(), table=table, sqs=sqs
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "QUEUE_ERROR"
    assert len(table.update_calls) == 1
    compensation = table.update_calls[0]
    assert compensation["Key"]["job_id"] == table.put_calls[0]["Item"]["job_id"]
    assert compensation["ExpressionAttributeValues"][":failed"] == "FAILED"


def test_get_tts_jobs_list_success(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable(
        items=[
            {
                "job_id": "job-1",
                "owner_sub": "authenticated-user",
                "type": "TTS",
                "status": "QUEUED",
                "voice": "Joanna",
                "engine": "neural",
                "output_format": "mp3",
                "created_at": Decimal("20"),
                "updated_at": Decimal("21"),
            },
            {
                "job_id": "other-job",
                "owner_sub": "another-user",
                "type": "TTS",
                "status": "QUEUED",
            },
        ]
    )
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(_job_event("GET"), LambdaContext())

    assert response["statusCode"] == 200
    jobs = json.loads(response["body"])["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["job_id"] == "job-1"
    assert jobs[0]["created_at"] == 20
    assert jobs[0]["updated_at"] == 21
    assert isinstance(jobs[0]["created_at"], int)
    assert isinstance(jobs[0]["updated_at"], int)


def test_get_tts_jobs_queries_owner_created_at_index(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable()
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    handler.lambda_handler(_job_event("GET"), LambdaContext())

    call = table.query_calls[0]
    assert call["IndexName"] == "ownerSub-createdAt-index"
    assert call["KeyConditionExpression"] == "#owner_sub = :owner_sub"
    assert call["ExpressionAttributeNames"] == {"#owner_sub": "owner_sub"}
    assert call["ExpressionAttributeValues"] == {
        ":owner_sub": "authenticated-user"
    }


def test_get_tts_jobs_uses_descending_order_and_limit_20(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable()
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    handler.lambda_handler(_job_event("GET"), LambdaContext())

    assert table.query_calls[0]["ScanIndexForward"] is False
    assert table.query_calls[0]["Limit"] == 20


def test_get_tts_jobs_list_does_not_return_text(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable(
        items=[
            {
                "job_id": "job-1",
                "owner_sub": "authenticated-user",
                "type": "TTS",
                "status": "QUEUED",
                "text": "secret full text",
            }
        ]
    )
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(_job_event("GET"), LambdaContext())

    assert "text" not in json.loads(response["body"])["jobs"][0]


def test_get_tts_jobs_missing_authentication_returns_401() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {"httpMethod": "GET", "resource": "/tts/jobs"}, LambdaContext()
    )

    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"


def test_get_tts_job_detail_success(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    item = {
        "job_id": "job-1",
        "owner_sub": "authenticated-user",
        "type": "TTS",
        "status": "COMPLETED",
        "voice": "Joanna",
        "engine": "neural",
        "output_format": "mp3",
        "created_at": Decimal("123"),
        "updated_at": Decimal("456"),
        "completed_at": Decimal("789"),
        "output_key": "outputs/job-1.mp3",
    }
    table = FakeJobsTable(item=item)
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(
        _job_event("GET", "/tts/jobs/{job_id}", job_id="job-1"),
        LambdaContext(),
    )

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {
        "job": {key: value for key, value in item.items() if key != "owner_sub"}
    }
    job = json.loads(response["body"])["job"]
    assert job["created_at"] == 123
    assert job["updated_at"] == 456
    assert job["completed_at"] == 789
    assert isinstance(job["created_at"], int)
    assert isinstance(job["updated_at"], int)
    assert isinstance(job["completed_at"], int)
    assert table.get_calls == [{"Key": {"job_id": "job-1"}}]


def test_get_tts_job_detail_missing_job_id_returns_400() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _job_event("GET", "/tts/jobs/{job_id}"), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JOB_ID"


def test_get_tts_job_detail_missing_job_returns_404(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable()
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(
        _job_event("GET", "/tts/jobs/{job_id}", job_id="missing-job"),
        LambdaContext(),
    )

    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"]["code"] == "JOB_NOT_FOUND"


def test_get_tts_job_detail_for_another_owner_returns_404(
    monkeypatch: Any,
) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable(
        item={
            "job_id": "private-job",
            "owner_sub": "another-user",
            "type": "TTS",
            "status": "QUEUED",
        }
    )
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(
        _job_event("GET", "/tts/jobs/{job_id}", job_id="private-job"),
        LambdaContext(),
    )

    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"]["code"] == "JOB_NOT_FOUND"


def test_get_tts_job_detail_does_not_return_text(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeJobsTable(
        item={
            "job_id": "job-1",
            "owner_sub": "authenticated-user",
            "type": "TTS",
            "status": "QUEUED",
            "text": "secret full text",
        }
    )
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(
        _job_event("GET", "/tts/jobs/{job_id}", job_id="job-1"),
        LambdaContext(),
    )

    assert "text" not in json.loads(response["body"])["job"]


class FakeSttTable:
    def __init__(
        self,
        *,
        item: dict[str, object] | None = None,
        pages: list[dict[str, object]] | None = None,
        put_error: ClientError | None = None,
    ) -> None:
        self.item = item
        self.pages = list(pages or [{"Items": []}])
        self.put_error = put_error
        self.put_calls: list[dict[str, object]] = []
        self.update_calls: list[dict[str, object]] = []
        self.query_calls: list[dict[str, object]] = []
        self.get_calls: list[dict[str, object]] = []

    def put_item(self, **kwargs: object) -> None:
        self.put_calls.append(kwargs)
        if self.put_error is not None:
            raise self.put_error

    def update_item(self, **kwargs: object) -> None:
        self.update_calls.append(kwargs)

    def query(self, **kwargs: object) -> dict[str, object]:
        self.query_calls.append(kwargs)
        return self.pages.pop(0)

    def get_item(self, **kwargs: object) -> dict[str, object]:
        self.get_calls.append(kwargs)
        return {} if self.item is None else {"Item": self.item}


class FakeSttS3:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[dict[str, object]] = []

    def generate_presigned_url(
        self, operation: str, **kwargs: object
    ) -> str:
        self.calls.append({"operation": operation, **kwargs})
        if self.error is not None:
            raise self.error
        return "https://example.test/stt-upload"


def _stt_event(
    method: str,
    resource: str = "/stt/jobs",
    payload: object | None = None,
    *,
    job_id: str | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "httpMethod": method,
        "resource": resource,
        "requestContext": {
            "authorizer": {"claims": {"sub": "authenticated-user"}}
        },
    }
    if payload is not None:
        event["body"] = json.dumps(payload)
    if resource in {
        "/stt/jobs/{job_id}",
        "/stt/jobs/{job_id}/download",
    }:
        event["pathParameters"] = {} if job_id is None else {"job_id": job_id}
    return event


def _configure_stt(
    monkeypatch: Any,
    handler: ModuleType,
    table: FakeSttTable,
    s3: FakeSttS3,
) -> None:
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)
    monkeypatch.setattr(handler, "_create_s3_client", lambda: s3)
    monkeypatch.setattr(
        handler,
        "_create_sqs_client",
        lambda: (_ for _ in ()).throw(
            AssertionError("STT API must not create an SQS client.")
        ),
    )
    monkeypatch.setenv("MEDIA_BUCKET_NAME", "unit-test-media")
    monkeypatch.setenv("JOB_TTL_DAYS", "30")
    monkeypatch.setenv("PRESIGNED_URL_TTL_SECONDS", "900")


def _create_stt_response(
    monkeypatch: Any,
    payload: object,
    *,
    table: FakeSttTable | None = None,
    s3: FakeSttS3 | None = None,
) -> tuple[dict[str, Any], FakeSttTable, FakeSttS3]:
    handler = _load_handler("api")
    fake_table = table or FakeSttTable()
    fake_s3 = s3 or FakeSttS3()
    _configure_stt(monkeypatch, handler, fake_table, fake_s3)
    response = handler.lambda_handler(
        _stt_event("POST", payload=payload), LambdaContext()
    )
    return response, fake_table, fake_s3


def _stt_item(**overrides: object) -> dict[str, object]:
    item: dict[str, object] = {
        "job_id": "stt-job-1",
        "owner_sub": "authenticated-user",
        "type": "STT",
        "status": "AWAITING_UPLOAD",
        "media_format": "mp3",
        "content_type": "audio/mpeg",
        "language_code": "vi-VN",
        "input_key": "input/stt/jobs/stt-job-1/source.mp3",
        "created_at": Decimal("123"),
        "updated_at": Decimal("456"),
        "expires_at": Decimal("999"),
    }
    item.update(overrides)
    return item


def test_post_stt_job_success_and_presigned_put(monkeypatch: Any) -> None:
    response, table, s3 = _create_stt_response(
        monkeypatch, {"media_format": "mp3", "language_code": "vi-VN"}
    )

    body = json.loads(response["body"])
    assert response["statusCode"] == 201
    assert body["job"]["status"] == "AWAITING_UPLOAD"
    assert body["job"]["type"] == "STT"
    assert body["upload"] == {
        "method": "PUT",
        "url": "https://example.test/stt-upload",
        "headers": {"Content-Type": "audio/mpeg"},
        "expires_in": 900,
    }
    item = table.put_calls[0]["Item"]
    assert item["owner_sub"] == "authenticated-user"
    assert item["status"] == "AWAITING_UPLOAD"
    assert item["input_key"] == (
        f"input/stt/jobs/{item['job_id']}/source.mp3"
    )
    assert item["expires_at"] == item["created_at"] + 30 * 86400
    presign = s3.calls[0]
    assert presign["operation"] == "put_object"
    assert presign["Params"] == {
        "Bucket": "unit-test-media",
        "Key": item["input_key"],
        "ContentType": "audio/mpeg",
    }
    assert presign["ExpiresIn"] == 900


def test_post_stt_job_uses_claim_owner_only(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    table = FakeSttTable()
    s3 = FakeSttS3()
    _configure_stt(monkeypatch, handler, table, s3)
    event = _stt_event(
        "POST", payload={"media_format": "wav", "language_code": "en-US"}
    )
    event["requestContext"]["authorizer"]["claims"]["sub"] = "claim-owner"

    handler.lambda_handler(event, LambdaContext())

    assert table.put_calls[0]["Item"]["owner_sub"] == "claim-owner"
    assert str(table.put_calls[0]["Item"]["input_key"]).endswith(".wav")


def test_post_stt_job_missing_authentication_returns_401() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {
            "httpMethod": "POST",
            "resource": "/stt/jobs",
            "body": json.dumps(
                {"media_format": "mp3", "language_code": "vi-VN"}
            ),
        },
        LambdaContext(),
    )

    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(
    ("payload", "expected_code"),
    [
        ({"language_code": "vi-VN"}, "MISSING_MEDIA_FORMAT"),
        (
            {"media_format": "avi", "language_code": "vi-VN"},
            "INVALID_MEDIA_FORMAT",
        ),
        ({"media_format": "mp3"}, "MISSING_LANGUAGE_CODE"),
        (
            {"media_format": "mp3", "language_code": "fr-FR"},
            "INVALID_LANGUAGE_CODE",
        ),
        (
            {
                "media_format": "mp3",
                "language_code": "vi-VN",
                "priority": "high",
            },
            "UNKNOWN_FIELDS",
        ),
        (
            {
                "media_format": "mp3",
                "language_code": "vi-VN",
                "owner_sub": "attacker",
            },
            "UNKNOWN_FIELDS",
        ),
    ],
)
def test_post_stt_job_rejects_invalid_payloads(
    payload: object, expected_code: str
) -> None:
    handler = _load_handler("api")

    response = handler.lambda_handler(
        _stt_event("POST", payload=payload), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == expected_code


def test_post_stt_job_rejects_invalid_json() -> None:
    handler = _load_handler("api")
    event = _stt_event("POST")
    event["body"] = "{"

    response = handler.lambda_handler(event, LambdaContext())

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JSON"


def test_post_stt_job_database_failure_returns_502(monkeypatch: Any) -> None:
    table = FakeSttTable(
        put_error=_client_error("InternalServerError")
    )
    response, _, s3 = _create_stt_response(
        monkeypatch,
        {"media_format": "mp3", "language_code": "vi-VN"},
        table=table,
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "DATABASE_ERROR"
    assert s3.calls == []


def test_post_stt_presign_failure_marks_job_failed(monkeypatch: Any) -> None:
    table = FakeSttTable()
    s3 = FakeSttS3(_client_error("InternalError"))
    response, _, _ = _create_stt_response(
        monkeypatch,
        {"media_format": "mp3", "language_code": "vi-VN"},
        table=table,
        s3=s3,
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "STORAGE_ERROR"
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":failed"] == "FAILED"
    assert values[":error_code"] == "UPLOAD_URL_ERROR"


def test_get_stt_jobs_filters_tts_and_serializes_decimals(
    monkeypatch: Any,
) -> None:
    handler = _load_handler("api")
    table = FakeSttTable(
        pages=[
            {
                "Items": [
                    _stt_item(),
                    {
                        "job_id": "tts-job",
                        "owner_sub": "authenticated-user",
                        "type": "TTS",
                    },
                ]
            }
        ]
    )
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(_stt_event("GET"), LambdaContext())

    jobs = json.loads(response["body"])["jobs"]
    assert response["statusCode"] == 200
    assert len(jobs) == 1
    assert jobs[0]["job_id"] == "stt-job-1"
    assert jobs[0]["created_at"] == 123
    assert isinstance(jobs[0]["created_at"], int)
    assert "owner_sub" not in jobs[0]
    assert "expires_at" not in jobs[0]


def test_get_stt_jobs_paginates_and_limits_to_20(monkeypatch: Any) -> None:
    handler = _load_handler("api")
    first_page = {
        "Items": [
            {
                "job_id": "tts-only",
                "owner_sub": "authenticated-user",
                "type": "TTS",
            }
        ],
        "LastEvaluatedKey": {"job_id": "cursor"},
    }
    second_page = {
        "Items": [
            _stt_item(
                job_id=f"stt-{index}",
                input_key=f"input/stt/jobs/stt-{index}/source.mp3",
            )
            for index in range(25)
        ]
    }
    table = FakeSttTable(pages=[first_page, second_page])
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(_stt_event("GET"), LambdaContext())

    jobs = json.loads(response["body"])["jobs"]
    assert len(jobs) == 20
    assert len(table.query_calls) == 2
    assert table.query_calls[0]["ScanIndexForward"] is False
    assert table.query_calls[0]["Limit"] == 20
    assert table.query_calls[1]["ExclusiveStartKey"] == {"job_id": "cursor"}


def test_get_stt_job_detail_success_with_decimal_timestamps(
    monkeypatch: Any,
) -> None:
    handler = _load_handler("api")
    table = FakeSttTable(
        item=_stt_item(completed_at=Decimal("789"), output_uri="internal")
    )
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(
        _stt_event("GET", "/stt/jobs/{job_id}", job_id="stt-job-1"),
        LambdaContext(),
    )

    job = json.loads(response["body"])["job"]
    assert response["statusCode"] == 200
    assert job["created_at"] == 123
    assert job["updated_at"] == 456
    assert job["completed_at"] == 789
    assert all(
        isinstance(job[field], int)
        for field in ("created_at", "updated_at", "completed_at")
    )
    assert "output_uri" not in job


def test_get_stt_job_detail_missing_job_id_returns_400() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        _stt_event("GET", "/stt/jobs/{job_id}"), LambdaContext()
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JOB_ID"


@pytest.mark.parametrize(
    "item",
    [
        None,
        _stt_item(owner_sub="another-user"),
        _stt_item(type="TTS"),
    ],
)
def test_get_stt_job_detail_inaccessible_records_return_404(
    monkeypatch: Any, item: dict[str, object] | None
) -> None:
    handler = _load_handler("api")
    table = FakeSttTable(item=item)
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)

    response = handler.lambda_handler(
        _stt_event("GET", "/stt/jobs/{job_id}", job_id="stt-job-1"),
        LambdaContext(),
    )

    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"]["code"] == "JOB_NOT_FOUND"


def _completed_download_job(job_type: str, job_id: str = "job-1") -> dict[str, object]:
    common: dict[str, object] = {
        "job_id": job_id,
        "owner_sub": "authenticated-user",
        "type": job_type,
        "status": "COMPLETED",
    }
    if job_type == "TTS":
        common.update(
            {
                "output_format": "mp3",
                "output_key": f"output/tts/jobs/{job_id}/audio.task.mp3",
            }
        )
    else:
        common["transcript_key"] = (
            f"output/stt/jobs/{job_id}/transcript.json"
        )
    return common


def _download_event(
    job_type: str,
    *,
    job_id: str | None = "job-1",
    authenticated: bool = True,
) -> dict[str, Any]:
    route = f"/{job_type.lower()}/jobs/{{job_id}}/download"
    event: dict[str, Any] = {
        "httpMethod": "GET",
        "resource": route,
        "pathParameters": {} if job_id is None else {"job_id": job_id},
    }
    if authenticated:
        event["requestContext"] = {
            "authorizer": {"claims": {"sub": "authenticated-user"}}
        }
    return event


def _download_response(
    monkeypatch: Any,
    job_type: str,
    *,
    item: dict[str, object] | None = None,
    job_id: str | None = "job-1",
    get_error: ClientError | None = None,
    presign_error: Exception | None = None,
) -> tuple[dict[str, Any], FakeJobsTable, FakeS3]:
    handler = _load_handler("api")
    table = FakeJobsTable(item=item, get_error=get_error)
    s3 = FakeS3(presign_error=presign_error)
    monkeypatch.setattr(handler, "_create_conversion_jobs_table", lambda: table)
    monkeypatch.setattr(handler, "_create_s3_client", lambda: s3)
    monkeypatch.setenv("MEDIA_BUCKET_NAME", "unit-test-media")
    monkeypatch.setenv("PRESIGNED_URL_TTL_SECONDS", "900")
    response = handler.lambda_handler(
        _download_event(job_type, job_id=job_id),
        LambdaContext(),
    )
    return response, table, s3


@pytest.mark.parametrize("job_type", ["TTS", "STT"])
def test_download_missing_authentication_returns_401(job_type: str) -> None:
    handler = _load_handler("api")

    response = handler.lambda_handler(
        _download_event(job_type, authenticated=False),
        LambdaContext(),
    )

    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("job_type", ["TTS", "STT"])
def test_download_missing_job_id_returns_400(
    monkeypatch: Any, job_type: str
) -> None:
    response, table, s3 = _download_response(
        monkeypatch, job_type, job_id=None
    )

    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["code"] == "INVALID_JOB_ID"
    assert table.get_calls == []
    assert s3.presign_calls == []


@pytest.mark.parametrize(
    ("job_type", "item"),
    [
        ("TTS", None),
        ("STT", None),
        ("TTS", {**_completed_download_job("TTS"), "owner_sub": "another-user"}),
        ("STT", {**_completed_download_job("STT"), "owner_sub": "another-user"}),
        ("TTS", _completed_download_job("STT")),
        ("STT", _completed_download_job("TTS")),
    ],
)
def test_download_inaccessible_job_returns_404(
    monkeypatch: Any,
    job_type: str,
    item: dict[str, object] | None,
) -> None:
    response, _, s3 = _download_response(
        monkeypatch, job_type, item=item
    )

    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"]["code"] == "JOB_NOT_FOUND"
    assert s3.presign_calls == []


@pytest.mark.parametrize("job_type", ["TTS", "STT"])
def test_download_database_error_returns_502(
    monkeypatch: Any, job_type: str
) -> None:
    response, _, s3 = _download_response(
        monkeypatch,
        job_type,
        get_error=_client_error("InternalServerError"),
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "DATABASE_ERROR"
    assert s3.presign_calls == []


@pytest.mark.parametrize("job_type", ["TTS", "STT"])
def test_download_presign_error_returns_502(
    monkeypatch: Any, job_type: str
) -> None:
    response, _, _ = _download_response(
        monkeypatch,
        job_type,
        item=_completed_download_job(job_type),
        presign_error=_client_error("InternalError"),
    )

    assert response["statusCode"] == 502
    assert json.loads(response["body"])["error"]["code"] == "STORAGE_ERROR"


@pytest.mark.parametrize(
    ("output_format", "extension", "content_type"),
    [
        ("mp3", "mp3", "audio/mpeg"),
        ("ogg_vorbis", "ogg", "audio/ogg"),
        ("pcm", "pcm", "audio/pcm"),
    ],
)
def test_download_completed_tts_returns_presigned_attachment(
    monkeypatch: Any,
    output_format: str,
    extension: str,
    content_type: str,
) -> None:
    item = _completed_download_job("TTS")
    item["output_format"] = output_format
    item["output_key"] = f"output/tts/jobs/job-1/audio.task.{extension}"

    response, table, s3 = _download_response(
        monkeypatch, "TTS", item=item
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "job": {
            "job_id": "job-1",
            "type": "TTS",
            "status": "COMPLETED",
        },
        "download": {
            "method": "GET",
            "url": "https://example.test/presigned-audio",
            "expires_in": 900,
            "content_type": content_type,
            "file_name": f"polly-voice-job-1.{extension}",
        },
    }
    assert table.get_calls == [{"Key": {"job_id": "job-1"}}]
    assert s3.presign_calls == [
        {
            "operation": "get_object",
            "Params": {
                "Bucket": "unit-test-media",
                "Key": item["output_key"],
                "ResponseContentType": content_type,
                "ResponseContentDisposition": (
                    f'attachment; filename="polly-voice-job-1.{extension}"'
                ),
            },
            "ExpiresIn": 900,
        }
    ]
    assert "owner_sub" not in body["job"]
    assert "unit-test-media" not in response["body"]


@pytest.mark.parametrize("status", ["QUEUED", "PROCESSING", "FAILED"])
def test_download_tts_non_completed_job_returns_409(
    monkeypatch: Any, status: str
) -> None:
    item = {**_completed_download_job("TTS"), "status": status}

    response, _, s3 = _download_response(
        monkeypatch, "TTS", item=item
    )

    assert response["statusCode"] == 409
    assert json.loads(response["body"])["error"]["code"] == "JOB_NOT_READY"
    assert s3.presign_calls == []


@pytest.mark.parametrize(
    "output_key",
    [
        None,
        "output/tts/other.mp3",
        "output/tts/jobs/other-job/audio.mp3",
        "https://example.test/audio.mp3",
        "output/tts/jobs/job-1/../audio.mp3",
        "output/tts/jobs/job-1/%2e%2e/audio.mp3",
    ],
)
def test_download_tts_rejects_unsafe_output_key(
    monkeypatch: Any, output_key: str | None
) -> None:
    item = _completed_download_job("TTS")
    if output_key is None:
        item.pop("output_key")
    else:
        item["output_key"] = output_key

    response, _, s3 = _download_response(
        monkeypatch, "TTS", item=item
    )

    assert response["statusCode"] == 409
    assert (
        json.loads(response["body"])["error"]["code"]
        == "DOWNLOAD_NOT_AVAILABLE"
    )
    assert s3.presign_calls == []


def test_download_completed_stt_returns_presigned_transcript(
    monkeypatch: Any,
) -> None:
    item = _completed_download_job("STT")

    response, table, s3 = _download_response(
        monkeypatch, "STT", item=item
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "job": {
            "job_id": "job-1",
            "type": "STT",
            "status": "COMPLETED",
        },
        "download": {
            "method": "GET",
            "url": "https://example.test/presigned-audio",
            "expires_in": 900,
            "content_type": "application/json",
            "file_name": "transcript-job-1.json",
        },
    }
    assert table.get_calls == [{"Key": {"job_id": "job-1"}}]
    assert s3.presign_calls == [
        {
            "operation": "get_object",
            "Params": {
                "Bucket": "unit-test-media",
                "Key": "output/stt/jobs/job-1/transcript.json",
                "ResponseContentType": "application/json",
                "ResponseContentDisposition": (
                    'attachment; filename="transcript-job-1.json"'
                ),
            },
            "ExpiresIn": 900,
        }
    ]
    assert "owner_sub" not in body["job"]
    assert "unit-test-media" not in response["body"]


def test_download_stt_falls_back_to_valid_output_key(
    monkeypatch: Any,
) -> None:
    item = _completed_download_job("STT")
    item["output_key"] = item.pop("transcript_key")

    response, _, _ = _download_response(
        monkeypatch, "STT", item=item
    )

    assert response["statusCode"] == 200


@pytest.mark.parametrize(
    "status", ["AWAITING_UPLOAD", "PROCESSING", "FAILED"]
)
def test_download_stt_non_completed_job_returns_409(
    monkeypatch: Any, status: str
) -> None:
    item = {**_completed_download_job("STT"), "status": status}

    response, _, s3 = _download_response(
        monkeypatch, "STT", item=item
    )

    assert response["statusCode"] == 409
    assert json.loads(response["body"])["error"]["code"] == "JOB_NOT_READY"
    assert s3.presign_calls == []


@pytest.mark.parametrize(
    "transcript_key",
    [
        None,
        "output/stt/other.json",
        "output/stt/jobs/other-job/transcript.json",
        "https://example.test/transcript.json",
        "output/stt/jobs/job-1/../transcript.json",
        "output/stt/jobs/job-1/%2e%2e/transcript.json",
        "output/stt/jobs/job-1/other.json",
    ],
)
def test_download_stt_rejects_unsafe_transcript_key(
    monkeypatch: Any, transcript_key: str | None
) -> None:
    item = _completed_download_job("STT")
    if transcript_key is None:
        item.pop("transcript_key")
    else:
        item["transcript_key"] = transcript_key

    response, _, s3 = _download_response(
        monkeypatch, "STT", item=item
    )

    assert response["statusCode"] == 409
    assert (
        json.loads(response["body"])["error"]["code"]
        == "DOWNLOAD_NOT_AVAILABLE"
    )
    assert s3.presign_calls == []


@pytest.mark.parametrize("job_type", ["TTS", "STT"])
def test_download_url_is_not_logged(
    monkeypatch: Any, caplog: pytest.LogCaptureFixture, job_type: str
) -> None:
    response, _, _ = _download_response(
        monkeypatch, job_type, item=_completed_download_job(job_type)
    )

    assert response["statusCode"] == 200
    assert all(
        "https://example.test/presigned-audio" not in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.parametrize("job_type", ["tts", "stt"])
def test_delete_job_routes_remain_501(job_type: str) -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {
            "httpMethod": "DELETE",
            "resource": f"/{job_type}/jobs/{{job_id}}",
            "pathParameters": {"job_id": "job-1"},
        },
        LambdaContext(),
    )

    assert response["statusCode"] == 501
    assert json.loads(response["body"])["error"]["code"] == "NOT_IMPLEMENTED"


def test_other_api_routes_still_return_501() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {"httpMethod": "DELETE", "resource": "/profile"}, LambdaContext()
    )

    assert response["statusCode"] == 501
    assert json.loads(response["body"])["error"]["code"] == "NOT_IMPLEMENTED"


class FakeWorkerTable:
    def __init__(
        self,
        jobs: dict[str, dict[str, object]] | None = None,
        *,
        get_error: ClientError | None = None,
        update_error: ClientError | None = None,
        mapping_error: ClientError | None = None,
    ) -> None:
        self.jobs = jobs or {}
        self.get_error = get_error
        self.update_error = update_error
        self.mapping_error = mapping_error
        self.get_calls: list[dict[str, object]] = []
        self.update_calls: list[dict[str, object]] = []

    def get_item(self, **kwargs: Any) -> dict[str, object]:
        self.get_calls.append(kwargs)
        if self.get_error is not None:
            raise self.get_error
        job_id = kwargs["Key"]["job_id"]
        item = self.jobs.get(job_id)
        return {} if item is None else {"Item": item}

    def update_item(self, **kwargs: object) -> None:
        self.update_calls.append(kwargs)
        key = kwargs["Key"]
        if (
            self.mapping_error is not None
            and str(key["job_id"]).startswith("POLLY_TASK#")
        ):
            raise self.mapping_error
        if self.update_error is not None:
            raise self.update_error


class FakeWorkerPolly:
    def __init__(
        self,
        *,
        response: dict[str, object] | None = None,
        error: ClientError | None = None,
    ) -> None:
        self.response = response or {
            "SynthesisTask": {
                "TaskId": "polly-task-1",
                "TaskStatus": "scheduled",
                "OutputUri": "s3://unit-test-media/output.mp3",
            }
        }
        self.error = error
        self.calls: list[dict[str, object]] = []

    def start_speech_synthesis_task(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.response


def _worker_job(**overrides: object) -> dict[str, object]:
    job: dict[str, object] = {
        "job_id": "job-1",
        "owner_sub": "authenticated-user",
        "type": "TTS",
        "status": "QUEUED",
        "text": "Text to synthesize",
        "voice": "Joanna",
        "engine": "neural",
        "output_format": "mp3",
        "created_at": 100,
        "updated_at": 100,
        "expires_at": 200,
    }
    job.update(overrides)
    return job


def _worker_record(
    message_id: str = "tts-message-1",
    message: object | None = None,
) -> dict[str, str]:
    payload = {"job_id": "job-1", "type": "TTS"} if message is None else message
    return {"messageId": message_id, "body": json.dumps(payload)}


def _configure_worker(
    monkeypatch: Any,
    module: ModuleType,
    table: FakeWorkerTable,
    polly: FakeWorkerPolly,
) -> None:
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(module, "_create_polly_client", lambda: polly)
    monkeypatch.setenv("CONVERSION_JOBS_TABLE_NAME", "unit-test-jobs")
    monkeypatch.setenv("MEDIA_BUCKET_NAME", "unit-test-media")
    monkeypatch.setenv(
        "POLLY_COMPLETION_TOPIC_ARN",
        "arn:aws:sns:us-east-1:123456789012:polly-completion",
    )


def _run_worker(
    monkeypatch: Any,
    *,
    job: dict[str, object] | None = None,
    table: FakeWorkerTable | None = None,
    polly: FakeWorkerPolly | None = None,
    record: dict[str, str] | None = None,
) -> tuple[dict[str, object], FakeWorkerTable, FakeWorkerPolly]:
    module = _load_handler("tts_worker")
    fake_table = table or FakeWorkerTable(
        {} if job is None else {str(job["job_id"]): job}
    )
    fake_polly = polly or FakeWorkerPolly()
    _configure_worker(monkeypatch, module, fake_table, fake_polly)
    response = module.lambda_handler(
        {"Records": [record or _worker_record()]}, LambdaContext()
    )
    return response, fake_table, fake_polly


def test_tts_worker_starts_polly_synthesis_task(monkeypatch: Any) -> None:
    response, _, polly = _run_worker(monkeypatch, job=_worker_job())

    assert response == {"batchItemFailures": []}
    assert len(polly.calls) == 1


def test_tts_worker_passes_job_synthesis_fields_to_polly(monkeypatch: Any) -> None:
    _, _, polly = _run_worker(monkeypatch, job=_worker_job())

    call = polly.calls[0]
    assert call["Text"] == "Text to synthesize"
    assert call["VoiceId"] == "Joanna"
    assert call["Engine"] == "neural"
    assert call["OutputFormat"] == "mp3"
    assert call["TextType"] == "text"


def test_tts_worker_passes_media_bucket_to_polly(monkeypatch: Any) -> None:
    _, _, polly = _run_worker(monkeypatch, job=_worker_job())

    assert polly.calls[0]["OutputS3BucketName"] == "unit-test-media"


def test_tts_worker_output_prefix_contains_job_id(monkeypatch: Any) -> None:
    _, _, polly = _run_worker(monkeypatch, job=_worker_job())

    assert (
        polly.calls[0]["OutputS3KeyPrefix"]
        == "output/tts/jobs/job-1/audio"
    )


def test_tts_worker_passes_completion_topic_to_polly(monkeypatch: Any) -> None:
    _, _, polly = _run_worker(monkeypatch, job=_worker_job())

    assert (
        polly.calls[0]["SnsTopicArn"]
        == "arn:aws:sns:us-east-1:123456789012:polly-completion"
    )


def test_tts_worker_updates_job_to_processing(monkeypatch: Any) -> None:
    _, table, _ = _run_worker(monkeypatch, job=_worker_job())

    update = table.update_calls[0]
    assert update["Key"] == {"job_id": "job-1"}
    assert update["ExpressionAttributeValues"][":processing"] == "PROCESSING"
    assert "REMOVE error_code, error_message" in update["UpdateExpression"]
    assert isinstance(update["ExpressionAttributeValues"][":updated_at"], int)


def test_tts_worker_saves_polly_task_id(monkeypatch: Any) -> None:
    _, table, _ = _run_worker(monkeypatch, job=_worker_job())

    assert (
        table.update_calls[0]["ExpressionAttributeValues"][":polly_task_id"]
        == "polly-task-1"
    )


def test_tts_worker_saves_polly_output_uri(monkeypatch: Any) -> None:
    _, table, _ = _run_worker(monkeypatch, job=_worker_job())

    assert (
        table.update_calls[0]["ExpressionAttributeValues"][":output_uri"]
        == "s3://unit-test-media/output.mp3"
    )


def test_tts_worker_stores_polly_task_mapping(monkeypatch: Any) -> None:
    _, table, _ = _run_worker(monkeypatch, job=_worker_job())

    mapping = table.update_calls[1]
    assert mapping["Key"] == {"job_id": "POLLY_TASK#polly-task-1"}
    assert "if_not_exists(created_at, :created_at)" in mapping["UpdateExpression"]
    assert (
        mapping["ExpressionAttributeValues"][":record_type"]
        == "POLLY_TASK_MAPPING"
    )


def test_tts_worker_mapping_contains_application_and_polly_task_ids(
    monkeypatch: Any,
) -> None:
    _, table, _ = _run_worker(monkeypatch, job=_worker_job())

    values = table.update_calls[1]["ExpressionAttributeValues"]
    assert values[":application_job_id"] == "job-1"
    assert values[":polly_task_id"] == "polly-task-1"


def test_tts_worker_mapping_reuses_application_job_expiration(
    monkeypatch: Any,
) -> None:
    _, table, _ = _run_worker(
        monkeypatch, job=_worker_job(expires_at=987654321)
    )

    assert (
        table.update_calls[1]["ExpressionAttributeValues"][":expires_at"]
        == 987654321
    )


def test_tts_worker_mapping_contains_no_text_or_owner_sub(
    monkeypatch: Any,
) -> None:
    _, table, _ = _run_worker(monkeypatch, job=_worker_job())

    mapping = table.update_calls[1]
    serialized_mapping = json.dumps(mapping)
    assert "owner_sub" not in serialized_mapping
    assert "Text to synthesize" not in serialized_mapping


def test_tts_worker_ignores_completed_job(monkeypatch: Any) -> None:
    response, table, polly = _run_worker(
        monkeypatch, job=_worker_job(status="COMPLETED")
    )

    assert response == {"batchItemFailures": []}
    assert polly.calls == []
    assert table.update_calls == []


def test_tts_worker_existing_task_id_repairs_mapping(monkeypatch: Any) -> None:
    response, table, polly = _run_worker(
        monkeypatch,
        job=_worker_job(
            status="PROCESSING",
            polly_task_id="existing-task",
            expires_at=555,
        ),
    )

    assert response == {"batchItemFailures": []}
    assert polly.calls == []
    mapping = table.update_calls[0]
    assert mapping["Key"] == {"job_id": "POLLY_TASK#existing-task"}
    assert (
        mapping["ExpressionAttributeValues"][":application_job_id"] == "job-1"
    )
    assert mapping["ExpressionAttributeValues"][":expires_at"] == 555


def test_tts_worker_mapping_failure_retries_without_duplicate_task(
    monkeypatch: Any,
) -> None:
    table = FakeWorkerTable(
        {"job-1": _worker_job()},
        mapping_error=_client_error("InternalServerError"),
    )
    response, _, polly = _run_worker(monkeypatch, table=table)

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "tts-message-1"}]
    }
    assert len(polly.calls) == 1
    assert table.update_calls[0]["Key"] == {"job_id": "job-1"}
    assert table.update_calls[1]["Key"] == {
        "job_id": "POLLY_TASK#polly-task-1"
    }


def test_tts_worker_existing_task_id_prevents_duplicate_polly_call(
    monkeypatch: Any,
) -> None:
    response, table, polly = _run_worker(
        monkeypatch, job=_worker_job(polly_task_id="existing-task")
    )

    assert response == {"batchItemFailures": []}
    assert polly.calls == []
    assert table.update_calls[0]["Key"] == {
        "job_id": "POLLY_TASK#existing-task"
    }


def test_tts_worker_missing_job_is_acknowledged(monkeypatch: Any) -> None:
    response, _, polly = _run_worker(monkeypatch)

    assert response == {"batchItemFailures": []}
    assert polly.calls == []


def test_tts_worker_wrong_job_type_is_acknowledged(monkeypatch: Any) -> None:
    response, _, polly = _run_worker(
        monkeypatch, job=_worker_job(type="STT")
    )

    assert response == {"batchItemFailures": []}
    assert polly.calls == []


def test_tts_worker_invalid_message_json_is_failed(monkeypatch: Any) -> None:
    record = {"messageId": "bad-json", "body": "{"}
    response, _, _ = _run_worker(monkeypatch, record=record)

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "bad-json"}]
    }


def test_tts_worker_missing_job_id_is_failed(monkeypatch: Any) -> None:
    response, _, _ = _run_worker(
        monkeypatch,
        record=_worker_record("missing-id", {"type": "TTS"}),
    )

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "missing-id"}]
    }


def test_tts_worker_polly_validation_error_marks_failed_without_retry(
    monkeypatch: Any,
) -> None:
    polly = FakeWorkerPolly(
        error=_client_error("EngineNotSupportedException")
    )
    response, table, _ = _run_worker(
        monkeypatch, job=_worker_job(), polly=polly
    )

    assert response == {"batchItemFailures": []}
    assert len(table.update_calls) == 1
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":failed"] == "FAILED"
    assert values[":error_code"] == "POLLY_VALIDATION_ERROR"
    assert "EngineNotSupportedException" not in values[":error_message"]


def test_tts_worker_transient_polly_error_retries_record(
    monkeypatch: Any,
) -> None:
    polly = FakeWorkerPolly(error=_client_error("ServiceFailureException"))
    response, table, _ = _run_worker(
        monkeypatch, job=_worker_job(), polly=polly
    )

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "tts-message-1"}]
    }
    assert table.update_calls[0]["ExpressionAttributeValues"][":failed"] == "FAILED"


def test_tts_worker_dynamodb_get_error_retries_record(monkeypatch: Any) -> None:
    table = FakeWorkerTable(get_error=_client_error("InternalServerError"))
    response, _, polly = _run_worker(monkeypatch, table=table)

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "tts-message-1"}]
    }
    assert polly.calls == []


def test_tts_worker_mixed_batch_reports_only_failed_message_ids(
    monkeypatch: Any,
) -> None:
    module = _load_handler("tts_worker")
    table = FakeWorkerTable(
        {
            "job-1": _worker_job(),
            "job-2": _worker_job(job_id="job-2"),
        }
    )
    polly = FakeWorkerPolly()
    _configure_worker(monkeypatch, module, table, polly)
    records = [
        _worker_record("successful-1"),
        {"messageId": "invalid-json", "body": "{"},
        _worker_record("missing-job", {"job_id": "unknown", "type": "TTS"}),
        _worker_record("successful-2", {"job_id": "job-2", "type": "TTS"}),
    ]

    response = module.lambda_handler({"Records": records}, LambdaContext())

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "invalid-json"}]
    }
    assert len(polly.calls) == 2


class FakeSttWorkerTable:
    def __init__(
        self,
        jobs: dict[str, dict[str, object]] | None = None,
        *,
        get_error: ClientError | None = None,
        update_error: ClientError | None = None,
    ) -> None:
        self.jobs = jobs or {}
        self.get_error = get_error
        self.update_error = update_error
        self.get_calls: list[dict[str, object]] = []
        self.update_calls: list[dict[str, object]] = []

    def get_item(self, **kwargs: Any) -> dict[str, object]:
        self.get_calls.append(kwargs)
        if self.get_error is not None:
            raise self.get_error
        item = self.jobs.get(kwargs["Key"]["job_id"])
        return {} if item is None else {"Item": item}

    def update_item(self, **kwargs: object) -> None:
        self.update_calls.append(kwargs)
        if self.update_error is not None:
            raise self.update_error


class FakeTranscribe:
    def __init__(
        self,
        *,
        error: ClientError | None = None,
        status: str = "IN_PROGRESS",
    ) -> None:
        self.error = error
        self.status = status
        self.calls: list[dict[str, object]] = []

    def start_transcription_job(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return {
            "TranscriptionJob": {
                "TranscriptionJobName": kwargs["TranscriptionJobName"],
                "TranscriptionJobStatus": self.status,
            }
        }


def _stt_worker_job(**overrides: object) -> dict[str, object]:
    job: dict[str, object] = {
        "job_id": "stt-job-1",
        "owner_sub": "authenticated-user",
        "type": "STT",
        "status": "AWAITING_UPLOAD",
        "media_format": "mp3",
        "language_code": "vi-VN",
        "input_key": "input/stt/jobs/stt-job-1/source.mp3",
    }
    job.update(overrides)
    return job


def _stt_worker_record(
    message_id: str = "stt-message-1",
    *,
    bucket: str = "unit-test-media",
    key: str = "input/stt/jobs/stt-job-1/source.mp3",
) -> dict[str, str]:
    event = {
        "version": "0",
        "source": "aws.s3",
        "detail-type": "Object Created",
        "detail": {
            "bucket": {"name": bucket},
            "object": {"key": key, "size": 12345},
        },
    }
    return {"messageId": message_id, "body": json.dumps(event)}


def _configure_stt_worker(
    monkeypatch: Any,
    module: ModuleType,
    table: FakeSttWorkerTable,
    transcribe: FakeTranscribe,
) -> None:
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(module, "_create_transcribe_client", lambda: transcribe)
    monkeypatch.setenv("CONVERSION_JOBS_TABLE_NAME", "unit-test-jobs")
    monkeypatch.setenv("MEDIA_BUCKET_NAME", "unit-test-media")


def _run_stt_worker(
    monkeypatch: Any,
    *,
    job: dict[str, object] | None = None,
    table: FakeSttWorkerTable | None = None,
    transcribe: FakeTranscribe | None = None,
    record: dict[str, str] | None = None,
) -> tuple[dict[str, object], FakeSttWorkerTable, FakeTranscribe]:
    module = _load_handler("stt_worker")
    fake_table = table or FakeSttWorkerTable(
        {} if job is None else {str(job["job_id"]): job}
    )
    fake_transcribe = transcribe or FakeTranscribe()
    _configure_stt_worker(monkeypatch, module, fake_table, fake_transcribe)
    response = module.lambda_handler(
        {"Records": [record or _stt_worker_record()]}, LambdaContext()
    )
    return response, fake_table, fake_transcribe


def test_stt_worker_starts_transcribe_with_expected_parameters(
    monkeypatch: Any,
) -> None:
    encoded_record = _stt_worker_record(
        key="input%2Fstt%2Fjobs%2Fstt-job-1%2Fsource.mp3"
    )
    response, table, transcribe = _run_stt_worker(
        monkeypatch, job=_stt_worker_job(), record=encoded_record
    )

    assert response == {"batchItemFailures": []}
    assert len(transcribe.calls) == 1
    assert transcribe.calls[0] == {
        "TranscriptionJobName": "stt-job-1",
        "LanguageCode": "vi-VN",
        "MediaFormat": "mp3",
        "Media": {
            "MediaFileUri": (
                "s3://unit-test-media/input/stt/jobs/stt-job-1/source.mp3"
            )
        },
        "OutputBucketName": "unit-test-media",
        "OutputKey": "output/stt/jobs/stt-job-1/transcript.json",
    }
    update = table.update_calls[0]
    values = update["ExpressionAttributeValues"]
    assert values[":processing"] == "PROCESSING"
    assert values[":transcribe_job_name"] == "stt-job-1"
    assert values[":transcribe_job_status"] == "IN_PROGRESS"
    assert values[":output_key"] == "output/stt/jobs/stt-job-1/transcript.json"
    assert "REMOVE error_code, error_message" in update["UpdateExpression"]
    assert ":completed_at" not in values


@pytest.mark.parametrize(
    "job",
    [
        _stt_worker_job(status="COMPLETED"),
        _stt_worker_job(transcribe_job_name="stt-job-1"),
    ],
)
def test_stt_worker_idempotent_jobs_do_not_start_again(
    monkeypatch: Any, job: dict[str, object]
) -> None:
    response, table, transcribe = _run_stt_worker(monkeypatch, job=job)

    assert response == {"batchItemFailures": []}
    assert transcribe.calls == []
    assert table.update_calls == []


def test_stt_worker_missing_job_is_acknowledged(monkeypatch: Any) -> None:
    response, _, transcribe = _run_stt_worker(monkeypatch)

    assert response == {"batchItemFailures": []}
    assert transcribe.calls == []


def test_stt_worker_wrong_job_type_is_acknowledged(monkeypatch: Any) -> None:
    response, table, transcribe = _run_stt_worker(
        monkeypatch, job=_stt_worker_job(type="TTS")
    )

    assert response == {"batchItemFailures": []}
    assert transcribe.calls == []
    assert table.update_calls == []


@pytest.mark.parametrize(
    "job",
    [
        _stt_worker_job(input_key="input/stt/jobs/other/source.mp3"),
        _stt_worker_job(media_format="wav"),
    ],
)
def test_stt_worker_stored_input_mismatch_is_acknowledged(
    monkeypatch: Any, job: dict[str, object]
) -> None:
    response, table, transcribe = _run_stt_worker(monkeypatch, job=job)

    assert response == {"batchItemFailures": []}
    assert transcribe.calls == []
    assert table.update_calls == []


@pytest.mark.parametrize(
    "record",
    [
        _stt_worker_record(bucket="another-bucket"),
        _stt_worker_record(key="uploads/random.mp3"),
    ],
)
def test_stt_worker_irrelevant_s3_objects_are_ignored(
    monkeypatch: Any, record: dict[str, str]
) -> None:
    response, table, transcribe = _run_stt_worker(
        monkeypatch, job=_stt_worker_job(), record=record
    )

    assert response == {"batchItemFailures": []}
    assert table.get_calls == []
    assert transcribe.calls == []


@pytest.mark.parametrize(
    ("record", "message_id"),
    [
        ({"messageId": "bad-json", "body": "{"}, "bad-json"),
        (
            {
                "messageId": "missing-detail",
                "body": json.dumps(
                    {
                        "source": "aws.s3",
                        "detail-type": "Object Created",
                    }
                ),
            },
            "missing-detail",
        ),
    ],
)
def test_stt_worker_malformed_messages_are_failed(
    monkeypatch: Any, record: dict[str, str], message_id: str
) -> None:
    response, _, transcribe = _run_stt_worker(
        monkeypatch, record=record
    )

    assert response == {
        "batchItemFailures": [{"itemIdentifier": message_id}]
    }
    assert transcribe.calls == []


def test_stt_worker_bad_request_marks_failed_without_retry(
    monkeypatch: Any,
) -> None:
    transcribe = FakeTranscribe(error=_client_error("BadRequestException"))
    response, table, _ = _run_stt_worker(
        monkeypatch, job=_stt_worker_job(), transcribe=transcribe
    )

    assert response == {"batchItemFailures": []}
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":failed"] == "FAILED"
    assert values[":error_code"] == "TRANSCRIBE_VALIDATION_ERROR"
    assert values[":error_message"] == (
        "Amazon Transcribe could not accept the submitted audio job."
    )


def test_stt_worker_conflict_repairs_processing_state(monkeypatch: Any) -> None:
    transcribe = FakeTranscribe(error=_client_error("ConflictException"))
    response, table, _ = _run_stt_worker(
        monkeypatch, job=_stt_worker_job(), transcribe=transcribe
    )

    assert response == {"batchItemFailures": []}
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":processing"] == "PROCESSING"
    assert values[":transcribe_job_name"] == "stt-job-1"
    assert values[":output_key"] == "output/stt/jobs/stt-job-1/transcript.json"
    assert ":failed" not in values


def test_stt_worker_transient_transcribe_error_retries(
    monkeypatch: Any,
) -> None:
    transcribe = FakeTranscribe(error=_client_error("InternalFailureException"))
    response, table, _ = _run_stt_worker(
        monkeypatch, job=_stt_worker_job(), transcribe=transcribe
    )

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "stt-message-1"}]
    }
    assert table.update_calls[0]["ExpressionAttributeValues"][":failed"] == "FAILED"


def test_stt_worker_dynamodb_get_error_retries(monkeypatch: Any) -> None:
    table = FakeSttWorkerTable(
        get_error=_client_error("InternalServerError")
    )
    response, _, transcribe = _run_stt_worker(monkeypatch, table=table)

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "stt-message-1"}]
    }
    assert transcribe.calls == []


def test_stt_worker_dynamodb_update_error_retries(monkeypatch: Any) -> None:
    table = FakeSttWorkerTable(
        {"stt-job-1": _stt_worker_job()},
        update_error=_client_error("InternalServerError"),
    )
    response, _, transcribe = _run_stt_worker(
        monkeypatch, table=table
    )

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "stt-message-1"}]
    }
    assert len(transcribe.calls) == 1


def test_stt_worker_mixed_batch_reports_only_failed_ids(
    monkeypatch: Any,
) -> None:
    module = _load_handler("stt_worker")
    table = FakeSttWorkerTable(
        {
            "stt-job-1": _stt_worker_job(),
            "stt-job-2": _stt_worker_job(
                job_id="stt-job-2",
                input_key="input/stt/jobs/stt-job-2/source.mp3",
            ),
        }
    )
    transcribe = FakeTranscribe()
    _configure_stt_worker(monkeypatch, module, table, transcribe)
    records = [
        _stt_worker_record("success-1"),
        {"messageId": "bad-json", "body": "{"},
        _stt_worker_record("ignored", bucket="another-bucket"),
        _stt_worker_record(
            "success-2", key="input/stt/jobs/stt-job-2/source.mp3"
        ),
    ]

    response = module.lambda_handler({"Records": records}, LambdaContext())

    assert response == {
        "batchItemFailures": [{"itemIdentifier": "bad-json"}]
    }
    assert len(transcribe.calls) == 2


class FakeCompletionTable:
    def __init__(
        self,
        items: dict[str, dict[str, object]] | None = None,
        *,
        get_error: ClientError | None = None,
        update_error: ClientError | None = None,
    ) -> None:
        self.items = items or {}
        self.get_error = get_error
        self.update_error = update_error
        self.get_calls: list[dict[str, object]] = []
        self.update_calls: list[dict[str, object]] = []

    def get_item(self, **kwargs: Any) -> dict[str, object]:
        self.get_calls.append(kwargs)
        if self.get_error is not None:
            raise self.get_error
        item = self.items.get(kwargs["Key"]["job_id"])
        return {} if item is None else {"Item": item}

    def update_item(self, **kwargs: object) -> None:
        self.update_calls.append(kwargs)
        if self.update_error is not None:
            raise self.update_error


class FakeCompletionPolly:
    def __init__(
        self,
        *,
        task: dict[str, object] | None = None,
        error: ClientError | None = None,
    ) -> None:
        self.task = task or {
            "TaskId": "polly-task-1",
            "TaskStatus": "completed",
            "OutputUri": (
                "https://s3.us-east-1.amazonaws.com/unit-test-media/"
                "output/tts/jobs/job-1/audio.task.mp3"
            ),
            "OutputFormat": "mp3",
        }
        self.error = error
        self.calls: list[dict[str, object]] = []

    def get_speech_synthesis_task(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"SynthesisTask": self.task}


def _completion_job(**overrides: object) -> dict[str, object]:
    job: dict[str, object] = {
        "job_id": "job-1",
        "owner_sub": "authenticated-user",
        "type": "TTS",
        "status": "PROCESSING",
        "polly_task_id": "polly-task-1",
        "voice": "Joanna",
        "engine": "neural",
        "output_format": "mp3",
        "created_at": 100,
        "updated_at": 100,
        "expires_at": 200,
    }
    job.update(overrides)
    return job


def _completion_mapping(**overrides: object) -> dict[str, object]:
    mapping: dict[str, object] = {
        "job_id": "POLLY_TASK#polly-task-1",
        "record_type": "POLLY_TASK_MAPPING",
        "application_job_id": "job-1",
        "polly_task_id": "polly-task-1",
        "created_at": 100,
        "updated_at": 100,
        "expires_at": 200,
    }
    mapping.update(overrides)
    return mapping


def _sns_record(
    message: object | None = None,
    *,
    raw_message: str | None = None,
) -> dict[str, object]:
    payload = (
        {"taskId": "polly-task-1", "taskStatus": "completed"}
        if message is None
        else message
    )
    return {
        "EventSource": "aws:sns",
        "Sns": {
            "MessageId": "sns-message-1",
            "Message": json.dumps(payload) if raw_message is None else raw_message,
        },
    }


def _configure_completion(
    monkeypatch: Any,
    module: ModuleType,
    table: FakeCompletionTable,
    polly: FakeCompletionPolly,
) -> None:
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(module, "_create_polly_client", lambda: polly)
    monkeypatch.setenv("CONVERSION_JOBS_TABLE_NAME", "unit-test-jobs")
    monkeypatch.setenv("MEDIA_BUCKET_NAME", "unit-test-media")


def _run_completion(
    monkeypatch: Any,
    *,
    job: dict[str, object] | None = None,
    mapping: dict[str, object] | None = None,
    table: FakeCompletionTable | None = None,
    polly: FakeCompletionPolly | None = None,
    record: dict[str, object] | None = None,
) -> tuple[dict[str, int], FakeCompletionTable, FakeCompletionPolly]:
    module = _load_handler("completion")
    items: dict[str, dict[str, object]] = {}
    if mapping is not None:
        items[str(mapping["job_id"])] = mapping
    if job is not None:
        items[str(job["job_id"])] = job
    fake_table = table or FakeCompletionTable(items)
    fake_polly = polly or FakeCompletionPolly()
    _configure_completion(monkeypatch, module, fake_table, fake_polly)
    response = module.lambda_handler(
        {"Records": [record or _sns_record()]}, LambdaContext()
    )
    return response, fake_table, fake_polly


def test_completion_completed_task_updates_job_to_completed(
    monkeypatch: Any,
) -> None:
    response, table, _ = _run_completion(
        monkeypatch, job=_completion_job(), mapping=_completion_mapping()
    )

    assert response["completed"] == 1
    assert (
        table.update_calls[0]["ExpressionAttributeValues"][":completed"]
        == "COMPLETED"
    )


def test_completion_calls_polly_with_notification_task_id(
    monkeypatch: Any,
) -> None:
    _, _, polly = _run_completion(
        monkeypatch, job=_completion_job(), mapping=_completion_mapping()
    )

    assert polly.calls == [{"TaskId": "polly-task-1"}]


def test_completion_retrieves_mapping_item_first(monkeypatch: Any) -> None:
    _, table, _ = _run_completion(
        monkeypatch, job=_completion_job(), mapping=_completion_mapping()
    )

    assert table.get_calls[0] == {
        "Key": {"job_id": "POLLY_TASK#polly-task-1"}
    }


def test_completion_retrieves_application_job_from_mapping(
    monkeypatch: Any,
) -> None:
    _, table, _ = _run_completion(
        monkeypatch, job=_completion_job(), mapping=_completion_mapping()
    )

    assert table.get_calls[1] == {"Key": {"job_id": "job-1"}}


def test_completion_saves_output_uri_and_decoded_output_key(
    monkeypatch: Any,
) -> None:
    polly = FakeCompletionPolly(
        task={
            "TaskId": "polly-task-1",
            "TaskStatus": "completed",
            "OutputUri": (
                "https://s3.us-east-1.amazonaws.com/unit-test-media/"
                "output/tts/jobs/job-1/audio%20file.mp3"
            ),
            "OutputFormat": "mp3",
        }
    )
    _, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(),
        mapping=_completion_mapping(),
        polly=polly,
    )

    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":output_uri"].endswith("audio%20file.mp3")
    assert values[":output_key"] == "output/tts/jobs/job-1/audio file.mp3"


def test_completion_sets_completed_and_updated_timestamps(
    monkeypatch: Any,
) -> None:
    _, table, _ = _run_completion(
        monkeypatch, job=_completion_job(), mapping=_completion_mapping()
    )

    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert isinstance(values[":completed_at"], int)
    assert values[":updated_at"] == values[":completed_at"]


def test_completion_removes_old_error_fields(monkeypatch: Any) -> None:
    _, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(
            error_code="OLD_ERROR", error_message="old safe message"
        ),
        mapping=_completion_mapping(),
    )

    assert (
        "REMOVE error_code, error_message"
        in table.update_calls[0]["UpdateExpression"]
    )


def test_completion_failed_task_updates_job_to_failed(monkeypatch: Any) -> None:
    polly = FakeCompletionPolly(
        task={
            "TaskId": "polly-task-1",
            "TaskStatus": "failed",
            "TaskStatusReason": "raw service reason",
        }
    )
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(),
        mapping=_completion_mapping(),
        polly=polly,
    )

    assert response["failed"] == 1
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":failed"] == "FAILED"
    assert values[":error_code"] == "POLLY_TASK_FAILED"


def test_completion_failed_task_stores_only_generic_error(
    monkeypatch: Any,
) -> None:
    raw_reason = "raw reason containing internal details"
    polly = FakeCompletionPolly(
        task={
            "TaskId": "polly-task-1",
            "TaskStatus": "failed",
            "TaskStatusReason": raw_reason,
        }
    )
    _, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(),
        mapping=_completion_mapping(),
        polly=polly,
    )

    message = table.update_calls[0]["ExpressionAttributeValues"][":error_message"]
    assert message == "Amazon Polly could not complete the speech synthesis task."
    assert raw_reason not in message


def test_completion_scheduled_task_remains_processing(monkeypatch: Any) -> None:
    polly = FakeCompletionPolly(
        task={"TaskId": "polly-task-1", "TaskStatus": "scheduled"}
    )
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(),
        mapping=_completion_mapping(),
        polly=polly,
    )

    assert response["processing"] == 1
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":processing"] == "PROCESSING"
    assert ":completed_at" not in values


def test_completion_in_progress_task_remains_processing(
    monkeypatch: Any,
) -> None:
    polly = FakeCompletionPolly(
        task={"TaskId": "polly-task-1", "TaskStatus": "inProgress"}
    )
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(),
        mapping=_completion_mapping(),
        polly=polly,
    )

    assert response["processing"] == 1
    assert (
        table.update_calls[0]["ExpressionAttributeValues"][":polly_task_status"]
        == "inProgress"
    )


def test_completion_already_completed_job_is_idempotently_ignored(
    monkeypatch: Any,
) -> None:
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(
            status="COMPLETED",
            output_key="output/tts/jobs/job-1/audio.task.mp3",
            completed_at=150,
        ),
        mapping=_completion_mapping(),
    )

    assert response["ignored"] == 1
    assert table.update_calls == []


def test_completion_already_failed_job_is_idempotently_ignored(
    monkeypatch: Any,
) -> None:
    polly = FakeCompletionPolly(
        task={"TaskId": "polly-task-1", "TaskStatus": "failed"}
    )
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(
            status="FAILED",
            error_code="POLLY_TASK_FAILED",
            completed_at=150,
        ),
        mapping=_completion_mapping(),
        polly=polly,
    )

    assert response["ignored"] == 1
    assert table.update_calls == []


def test_completion_malformed_sns_json_is_ignored(monkeypatch: Any) -> None:
    response, table, polly = _run_completion(
        monkeypatch, record=_sns_record(raw_message="{")
    )

    assert response == {
        "processed": 1,
        "completed": 0,
        "failed": 0,
        "processing": 0,
        "ignored": 1,
    }
    assert table.get_calls == []
    assert polly.calls == []


def test_completion_missing_task_id_is_ignored(monkeypatch: Any) -> None:
    response, _, polly = _run_completion(
        monkeypatch, record=_sns_record({"taskStatus": "completed"})
    )

    assert response["ignored"] == 1
    assert polly.calls == []


def test_completion_missing_mapping_raises_for_retry(monkeypatch: Any) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable()
    polly = FakeCompletionPolly()
    _configure_completion(monkeypatch, module, table, polly)

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler(
            {"Records": [_sns_record()]}, LambdaContext()
        )


def test_completion_missing_application_job_is_ignored(
    monkeypatch: Any,
) -> None:
    response, table, _ = _run_completion(
        monkeypatch, mapping=_completion_mapping()
    )

    assert response["ignored"] == 1
    assert table.update_calls == []


def test_completion_wrong_application_job_type_is_ignored(
    monkeypatch: Any,
) -> None:
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(type="STT"),
        mapping=_completion_mapping(),
    )

    assert response["ignored"] == 1
    assert table.update_calls == []


def test_completion_polly_task_id_mismatch_does_not_modify_job(
    monkeypatch: Any,
) -> None:
    response, table, _ = _run_completion(
        monkeypatch,
        job=_completion_job(polly_task_id="different-task"),
        mapping=_completion_mapping(),
    )

    assert response["ignored"] == 1
    assert table.update_calls == []


def test_completion_completed_task_without_output_uri_retries(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        {
            "POLLY_TASK#polly-task-1": _completion_mapping(),
            "job-1": _completion_job(),
        }
    )
    polly = FakeCompletionPolly(
        task={"TaskId": "polly-task-1", "TaskStatus": "completed"}
    )
    _configure_completion(monkeypatch, module, table, polly)

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler({"Records": [_sns_record()]}, LambdaContext())
    assert table.update_calls == []


def test_completion_rejects_output_uri_outside_job_prefix(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        {
            "POLLY_TASK#polly-task-1": _completion_mapping(),
            "job-1": _completion_job(),
        }
    )
    polly = FakeCompletionPolly(
        task={
            "TaskId": "polly-task-1",
            "TaskStatus": "completed",
            "OutputUri": (
                "https://s3.us-east-1.amazonaws.com/unit-test-media/"
                "output/tts/jobs/another-job/audio.mp3"
            ),
        }
    )
    _configure_completion(monkeypatch, module, table, polly)

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler({"Records": [_sns_record()]}, LambdaContext())
    assert table.update_calls == []


def test_completion_polly_client_error_is_raised_for_retry(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable()
    polly = FakeCompletionPolly(
        error=_client_error("SynthesisTaskNotFoundException")
    )
    _configure_completion(monkeypatch, module, table, polly)

    with pytest.raises(ClientError):
        module.lambda_handler({"Records": [_sns_record()]}, LambdaContext())


def test_completion_dynamodb_client_error_is_raised_for_retry(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        get_error=_client_error("InternalServerError")
    )
    polly = FakeCompletionPolly()
    _configure_completion(monkeypatch, module, table, polly)

    with pytest.raises(ClientError):
        module.lambda_handler({"Records": [_sns_record()]}, LambdaContext())


class FakeCompletionTranscribe:
    def __init__(
        self,
        *,
        job: dict[str, object] | None = None,
        error: ClientError | None = None,
    ) -> None:
        self.job = job or {
            "TranscriptionJobName": "stt-job-1",
            "TranscriptionJobStatus": "COMPLETED",
            "Transcript": {
                "TranscriptFileUri": (
                    "https://unit-test-media.s3.amazonaws.com/"
                    "output/stt/jobs/stt-job-1/transcript.json"
                )
            },
        }
        self.error = error
        self.calls: list[dict[str, object]] = []

    def get_transcription_job(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"TranscriptionJob": self.job}


def _transcribe_completion_job(**overrides: object) -> dict[str, object]:
    job: dict[str, object] = {
        "job_id": "stt-job-1",
        "owner_sub": "authenticated-user",
        "type": "STT",
        "status": "PROCESSING",
        "transcribe_job_name": "stt-job-1",
        "transcribe_job_status": "IN_PROGRESS",
        "output_key": "output/stt/jobs/stt-job-1/transcript.json",
        "created_at": 100,
        "updated_at": 100,
    }
    job.update(overrides)
    return job


def _transcribe_event(
    *,
    job_name: object = "stt-job-1",
    status: object = "COMPLETED",
    detail: object | None = None,
) -> dict[str, object]:
    return {
        "version": "0",
        "source": "aws.transcribe",
        "detail-type": "Transcribe Job State Change",
        "detail": (
            {
                "TranscriptionJobName": job_name,
                "TranscriptionJobStatus": status,
            }
            if detail is None
            else detail
        ),
    }


def _run_transcribe_completion(
    monkeypatch: Any,
    *,
    application_job: dict[str, object] | None = None,
    table: FakeCompletionTable | None = None,
    transcribe: FakeCompletionTranscribe | None = None,
    event: dict[str, object] | None = None,
) -> tuple[dict[str, int], FakeCompletionTable, FakeCompletionTranscribe]:
    module = _load_handler("completion")
    fake_table = table or FakeCompletionTable(
        {}
        if application_job is None
        else {str(application_job["job_id"]): application_job}
    )
    fake_transcribe = transcribe or FakeCompletionTranscribe()
    monkeypatch.setattr(module, "_create_jobs_table", lambda: fake_table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: fake_transcribe
    )
    response = module.lambda_handler(
        event or _transcribe_event(), LambdaContext()
    )
    return response, fake_table, fake_transcribe


def test_transcribe_completed_event_updates_job(monkeypatch: Any) -> None:
    response, table, transcribe = _run_transcribe_completion(
        monkeypatch, application_job=_transcribe_completion_job()
    )

    assert response == {
        "processed": 1,
        "completed": 1,
        "failed": 0,
        "processing": 0,
        "ignored": 0,
    }
    assert transcribe.calls == [{"TranscriptionJobName": "stt-job-1"}]
    assert table.get_calls == [
        {"Key": {"job_id": "stt-job-1"}, "ConsistentRead": True}
    ]
    update = table.update_calls[0]
    values = update["ExpressionAttributeValues"]
    expected_key = "output/stt/jobs/stt-job-1/transcript.json"
    assert values[":completed"] == "COMPLETED"
    assert values[":transcribe_job_status"] == "COMPLETED"
    assert values[":transcript_key"] == expected_key
    assert values[":output_key"] == expected_key
    assert isinstance(values[":completed_at"], int)
    assert values[":updated_at"] == values[":completed_at"]
    assert "REMOVE error_code, error_message" in update["UpdateExpression"]
    serialized_update = json.dumps(update)
    assert "TranscriptFileUri" not in serialized_update
    assert "https://" not in serialized_update


def test_transcribe_failed_event_stores_safe_failure(monkeypatch: Any) -> None:
    raw_reason = "raw AWS failure with internal details"
    transcribe = FakeCompletionTranscribe(
        job={
            "TranscriptionJobName": "stt-job-1",
            "TranscriptionJobStatus": "FAILED",
            "FailureReason": raw_reason,
        }
    )
    response, table, _ = _run_transcribe_completion(
        monkeypatch,
        application_job=_transcribe_completion_job(),
        transcribe=transcribe,
        event=_transcribe_event(status="FAILED"),
    )

    assert response["failed"] == 1
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":failed"] == "FAILED"
    assert values[":error_code"] == "TRANSCRIBE_JOB_FAILED"
    assert values[":error_message"] == (
        "Amazon Transcribe could not complete the transcription job."
    )
    assert raw_reason not in json.dumps(table.update_calls[0])


@pytest.mark.parametrize("status", ["QUEUED", "IN_PROGRESS"])
def test_transcribe_nonterminal_status_remains_processing(
    monkeypatch: Any, status: str
) -> None:
    transcribe = FakeCompletionTranscribe(
        job={
            "TranscriptionJobName": "stt-job-1",
            "TranscriptionJobStatus": status,
        }
    )
    response, table, _ = _run_transcribe_completion(
        monkeypatch,
        application_job=_transcribe_completion_job(),
        transcribe=transcribe,
    )

    assert response["processing"] == 1
    values = table.update_calls[0]["ExpressionAttributeValues"]
    assert values[":processing"] == "PROCESSING"
    assert values[":transcribe_job_status"] == status
    assert ":completed_at" not in values


def test_transcribe_already_completed_job_is_idempotent(
    monkeypatch: Any,
) -> None:
    response, table, _ = _run_transcribe_completion(
        monkeypatch,
        application_job=_transcribe_completion_job(
            status="COMPLETED",
            transcript_key="output/stt/jobs/stt-job-1/transcript.json",
            completed_at=123456,
        ),
    )

    assert response["ignored"] == 1
    assert table.update_calls == []
    assert table.items["stt-job-1"]["completed_at"] == 123456


@pytest.mark.parametrize(
    "event",
    [
        _transcribe_event(detail="not-an-object"),
        _transcribe_event(job_name=""),
        _transcribe_event(status="STARTED"),
    ],
)
def test_transcribe_malformed_events_are_ignored(
    monkeypatch: Any, event: dict[str, object]
) -> None:
    response, table, transcribe = _run_transcribe_completion(
        monkeypatch, event=event
    )

    assert response["ignored"] == 1
    assert table.get_calls == []
    assert transcribe.calls == []


def test_transcribe_missing_application_job_retries(monkeypatch: Any) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable()
    transcribe = FakeCompletionTranscribe()
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: transcribe
    )

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler(_transcribe_event(), LambdaContext())
    assert transcribe.calls == []


def test_transcribe_wrong_application_job_type_is_ignored(
    monkeypatch: Any,
) -> None:
    response, table, transcribe = _run_transcribe_completion(
        monkeypatch,
        application_job=_transcribe_completion_job(type="TTS"),
    )

    assert response["ignored"] == 1
    assert table.update_calls == []
    assert transcribe.calls == []


def test_transcribe_missing_stored_job_name_retries(monkeypatch: Any) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        {"stt-job-1": _transcribe_completion_job(transcribe_job_name=None)}
    )
    transcribe = FakeCompletionTranscribe()
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: transcribe
    )

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler(_transcribe_event(), LambdaContext())
    assert transcribe.calls == []


def test_transcribe_mismatched_stored_job_name_is_ignored(
    monkeypatch: Any,
) -> None:
    response, table, transcribe = _run_transcribe_completion(
        monkeypatch,
        application_job=_transcribe_completion_job(
            transcribe_job_name="different-job"
        ),
    )

    assert response["ignored"] == 1
    assert table.update_calls == []
    assert transcribe.calls == []


def test_transcribe_completed_without_transcript_uri_retries(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        {"stt-job-1": _transcribe_completion_job()}
    )
    transcribe = FakeCompletionTranscribe(
        job={
            "TranscriptionJobName": "stt-job-1",
            "TranscriptionJobStatus": "COMPLETED",
        }
    )
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: transcribe
    )

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler(_transcribe_event(), LambdaContext())
    assert table.update_calls == []


def test_transcribe_unexpected_stored_output_key_retries(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        {
            "stt-job-1": _transcribe_completion_job(
                output_key="output/stt/jobs/other/transcript.json"
            )
        }
    )
    transcribe = FakeCompletionTranscribe()
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: transcribe
    )

    with pytest.raises(module.RetryableCompletionError):
        module.lambda_handler(_transcribe_event(), LambdaContext())
    assert table.update_calls == []


def test_transcribe_client_error_is_raised_for_retry(monkeypatch: Any) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        {"stt-job-1": _transcribe_completion_job()}
    )
    transcribe = FakeCompletionTranscribe(
        error=_client_error("TranscriptionJobNotFoundException")
    )
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: transcribe
    )

    with pytest.raises(ClientError):
        module.lambda_handler(_transcribe_event(), LambdaContext())


def test_transcribe_dynamodb_error_is_raised_for_retry(
    monkeypatch: Any,
) -> None:
    module = _load_handler("completion")
    table = FakeCompletionTable(
        get_error=_client_error("InternalServerError")
    )
    transcribe = FakeCompletionTranscribe()
    monkeypatch.setattr(module, "_create_jobs_table", lambda: table)
    monkeypatch.setattr(
        module, "_create_transcribe_client", lambda: transcribe
    )

    with pytest.raises(ClientError):
        module.lambda_handler(_transcribe_event(), LambdaContext())
    assert transcribe.calls == []
