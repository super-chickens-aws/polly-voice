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


def _preview_event(payload: object) -> dict[str, str]:
    return {"httpMethod": "POST", "resource": "/tts/preview", "body": json.dumps(payload)}


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
    if resource == "/tts/jobs/{job_id}":
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
                "created_at": 20,
                "updated_at": 20,
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
        "created_at": 10,
        "updated_at": 20,
        "completed_at": 20,
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


def test_other_api_routes_still_return_501() -> None:
    handler = _load_handler("api")
    response = handler.lambda_handler(
        {"httpMethod": "DELETE", "resource": "/profile"}, LambdaContext()
    )

    assert response["statusCode"] == 501
    assert json.loads(response["body"])["error"]["code"] == "NOT_IMPLEMENTED"


def test_download_and_delete_tts_job_routes_still_return_501() -> None:
    handler = _load_handler("api")
    download = handler.lambda_handler(
        {
            "httpMethod": "GET",
            "resource": "/tts/jobs/{job_id}/download",
            "pathParameters": {"job_id": "job-1"},
        },
        LambdaContext(),
    )
    delete = handler.lambda_handler(
        {
            "httpMethod": "DELETE",
            "resource": "/tts/jobs/{job_id}",
            "pathParameters": {"job_id": "job-1"},
        },
        LambdaContext(),
    )

    assert download["statusCode"] == 501
    assert delete["statusCode"] == 501


class FakeWorkerTable:
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
        job_id = kwargs["Key"]["job_id"]
        item = self.jobs.get(job_id)
        return {} if item is None else {"Item": item}

    def update_item(self, **kwargs: object) -> None:
        self.update_calls.append(kwargs)
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


def test_tts_worker_ignores_completed_job(monkeypatch: Any) -> None:
    response, table, polly = _run_worker(
        monkeypatch, job=_worker_job(status="COMPLETED")
    )

    assert response == {"batchItemFailures": []}
    assert polly.calls == []
    assert table.update_calls == []


def test_tts_worker_existing_task_id_prevents_duplicate_polly_call(
    monkeypatch: Any,
) -> None:
    response, table, polly = _run_worker(
        monkeypatch, job=_worker_job(polly_task_id="existing-task")
    )

    assert response == {"batchItemFailures": []}
    assert polly.calls == []
    assert table.update_calls == []


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
