"""REST API handler for the Polly Voice MVP."""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import unquote

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

DEFAULT_FRONTEND_ORIGINS = (
    "http://localhost:5173,"
    "https://ductest.d3hm91wq3i4ey8.amplifyapp.com"
)
CORS_ALLOW_METHODS = "GET,POST,PUT,DELETE,OPTIONS"
CORS_ALLOW_HEADERS = "Content-Type,Authorization"
MAX_PREVIEW_TEXT_LENGTH = 500
DEFAULT_ENGINE = "neural"
DEFAULT_OUTPUT_FORMAT = "mp3"
ALLOWED_ENGINES = {"standard", "neural"}
ALLOWED_OUTPUT_FORMATS = {"mp3", "ogg_vorbis", "pcm"}
OUTPUT_EXTENSIONS = {"mp3": "mp3", "ogg_vorbis": "ogg", "pcm": "pcm"}
TTS_DOWNLOAD_FORMATS = {
    "mp3": ("mp3", "audio/mpeg"),
    "ogg_vorbis": ("ogg", "audio/ogg"),
    "pcm": ("pcm", "audio/pcm"),
}
POLLY_VALIDATION_ERROR_CODES = {
    "EngineNotSupportedException",
    "InvalidSampleRateException",
    "InvalidSsmlException",
    "InvalidVoiceId",
    "InvalidVoiceIdException",
    "LanguageNotSupportedException",
    "LexiconNotFoundException",
    "MarksNotSupportedForFormatException",
    "SsmlMarksNotSupportedForTextTypeException",
    "TextLengthExceededException",
    "ValidationException",
}
PROFILE_FIELDS = (
    "cognito_sub",
    "display_name",
    "preferred_language",
    "created_at",
    "updated_at",
)
PROFILE_REQUEST_FIELDS = {"display_name", "preferred_language"}
ALLOWED_PREFERRED_LANGUAGES = {"vi-VN", "en-US"}
MAX_JOB_TEXT_LENGTH = 3000
JOB_REQUEST_FIELDS = {"text", "voice", "engine", "output_format"}
JOB_RESPONSE_FIELDS = (
    "job_id",
    "type",
    "status",
    "voice",
    "engine",
    "output_format",
    "created_at",
    "updated_at",
    "completed_at",
    "error_code",
    "error_message",
    "output_key",
)
STT_REQUEST_FIELDS = {"media_format", "language_code"}
STT_CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "mp4": "audio/mp4",
    "wav": "audio/wav",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "amr": "audio/amr",
    "webm": "audio/webm",
    "m4a": "audio/mp4",
}
STT_LANGUAGES = {"vi-VN", "en-US"}
STT_RESPONSE_FIELDS = (
    "job_id",
    "type",
    "status",
    "media_format",
    "language_code",
    "input_key",
    "output_key",
    "transcript_key",
    "created_at",
    "updated_at",
    "completed_at",
    "error_code",
    "error_message",
)


class PreviewValidationError(ValueError):
    """An invalid client request for a TTS preview."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ProfileValidationError(ValueError):
    """An invalid client request for a user profile."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class JobValidationError(ValueError):
    """An invalid client request for an asynchronous TTS job."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class SttValidationError(ValueError):
    """An invalid client request for an asynchronous STT job."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _json_default(value: Any) -> int | float:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    raise TypeError(
        f"Object of type {type(value).__name__} is not JSON serializable"
    )


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Vary": "Origin",
        },
        "body": json.dumps(
            body,
            separators=(",", ":"),
            default=_json_default,
        ),
    }


def _request_origin(event: dict[str, Any]) -> str | None:
    headers = event.get("headers")
    if not isinstance(headers, dict):
        return None
    for name, value in headers.items():
        if (
            isinstance(name, str)
            and name.lower() == "origin"
            and isinstance(value, str)
        ):
            return value
    return None


def _allowed_frontend_origins() -> frozenset[str]:
    configured = os.environ.get(
        "FRONTEND_ORIGINS", DEFAULT_FRONTEND_ORIGINS
    )
    return frozenset(
        origin.strip() for origin in configured.split(",") if origin.strip()
    )


def _with_cors(
    response: dict[str, Any], event: dict[str, Any]
) -> dict[str, Any]:
    headers = response.setdefault("headers", {})
    if not isinstance(headers, dict):
        headers = {}
        response["headers"] = headers
    headers["Vary"] = "Origin"
    origin = _request_origin(event)
    if origin in _allowed_frontend_origins():
        headers["Access-Control-Allow-Origin"] = origin
    else:
        headers.pop("Access-Control-Allow-Origin", None)
    return response


def _preflight_response() -> dict[str, Any]:
    return {
        "statusCode": 204,
        "headers": {
            "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
            "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
            "Access-Control-Max-Age": "600",
            "Vary": "Origin",
        },
        "body": "",
    }


def _error_response(
    status_code: int, code: str, message: str, request_id: str | None
) -> dict[str, Any]:
    return _response(
        status_code,
        {
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
            }
        },
    )


def _create_polly_client() -> Any:
    """Create Polly lazily so importing this module never contacts AWS."""
    return boto3.client("polly")


def _create_s3_client() -> Any:
    """Create S3 lazily so unit tests can replace this factory."""
    return boto3.client("s3")


def _create_users_table() -> Any:
    """Create the DynamoDB Table lazily so unit tests can replace this factory."""
    return boto3.resource("dynamodb").Table(os.environ["USERS_TABLE_NAME"])


def _create_conversion_jobs_table() -> Any:
    """Create the conversion jobs Table only when a request needs it."""
    return boto3.resource("dynamodb").Table(
        os.environ["CONVERSION_JOBS_TABLE_NAME"]
    )


def _create_sqs_client() -> Any:
    """Create SQS lazily so unit tests can replace this factory."""
    return boto3.client("sqs")


def _parse_preview_request(event: dict[str, Any]) -> dict[str, str]:
    body = event.get("body")
    if not isinstance(body, str):
        raise PreviewValidationError("INVALID_JSON", "Request body must be valid JSON.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise PreviewValidationError(
            "INVALID_JSON", "Request body must be valid JSON."
        ) from error

    if not isinstance(payload, dict):
        raise PreviewValidationError("INVALID_JSON", "Request body must be a JSON object.")

    if "text" not in payload:
        raise PreviewValidationError("MISSING_TEXT", "text is required.")
    text = payload["text"]
    if not isinstance(text, str) or not text.strip():
        raise PreviewValidationError("INVALID_TEXT", "text must be a non-empty string.")
    if len(text) > MAX_PREVIEW_TEXT_LENGTH:
        raise PreviewValidationError(
            "TEXT_TOO_LONG", "text must not exceed 500 characters."
        )

    if "voice" not in payload:
        raise PreviewValidationError("MISSING_VOICE", "voice is required.")
    voice = payload["voice"]
    if not isinstance(voice, str) or not voice.strip():
        raise PreviewValidationError("INVALID_VOICE", "voice must be a non-empty string.")

    engine = payload.get("engine", DEFAULT_ENGINE)
    if not isinstance(engine, str) or engine not in ALLOWED_ENGINES:
        raise PreviewValidationError(
            "INVALID_ENGINE", "engine must be either standard or neural."
        )

    output_format = payload.get("output_format", DEFAULT_OUTPUT_FORMAT)
    if not isinstance(output_format, str) or output_format not in ALLOWED_OUTPUT_FORMATS:
        raise PreviewValidationError(
            "INVALID_OUTPUT_FORMAT",
            "output_format must be one of mp3, ogg_vorbis, or pcm.",
        )

    return {
        "text": text,
        "voice": voice,
        "engine": engine,
        "output_format": output_format,
    }


def _client_error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", "ClientError"))


def _authenticated_sub(event: dict[str, Any]) -> str | None:
    request_context = event.get("requestContext")
    if not isinstance(request_context, dict):
        return None
    authorizer = request_context.get("authorizer")
    if not isinstance(authorizer, dict):
        return None
    claims = authorizer.get("claims")
    if not isinstance(claims, dict):
        return None
    cognito_sub = claims.get("sub")
    if not isinstance(cognito_sub, str) or not cognito_sub:
        return None
    return cognito_sub


def _parse_profile_request(event: dict[str, Any]) -> dict[str, str]:
    body = event.get("body")
    if not isinstance(body, str):
        raise ProfileValidationError("INVALID_JSON", "Request body must be valid JSON.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise ProfileValidationError(
            "INVALID_JSON", "Request body must be valid JSON."
        ) from error

    if not isinstance(payload, dict):
        raise ProfileValidationError(
            "INVALID_JSON", "Request body must be a JSON object."
        )

    unknown_fields = set(payload) - PROFILE_REQUEST_FIELDS
    if unknown_fields:
        raise ProfileValidationError(
            "UNKNOWN_FIELDS", "Request body contains unsupported fields."
        )

    if "display_name" not in payload:
        raise ProfileValidationError(
            "MISSING_DISPLAY_NAME", "display_name is required."
        )
    display_name = payload["display_name"]
    if not isinstance(display_name, str):
        raise ProfileValidationError(
            "INVALID_DISPLAY_NAME", "display_name must be a string."
        )
    display_name = display_name.strip()
    if not 1 <= len(display_name) <= 80:
        raise ProfileValidationError(
            "INVALID_DISPLAY_NAME",
            "display_name must contain between 1 and 80 characters.",
        )

    if "preferred_language" not in payload:
        raise ProfileValidationError(
            "MISSING_PREFERRED_LANGUAGE", "preferred_language is required."
        )
    preferred_language = payload["preferred_language"]
    if (
        not isinstance(preferred_language, str)
        or preferred_language not in ALLOWED_PREFERRED_LANGUAGES
    ):
        raise ProfileValidationError(
            "INVALID_PREFERRED_LANGUAGE",
            "preferred_language must be either vi-VN or en-US.",
        )

    return {
        "display_name": display_name,
        "preferred_language": preferred_language,
    }


def _parse_job_request(event: dict[str, Any]) -> dict[str, str]:
    body = event.get("body")
    if not isinstance(body, str):
        raise JobValidationError("INVALID_JSON", "Request body must be valid JSON.")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise JobValidationError(
            "INVALID_JSON", "Request body must be valid JSON."
        ) from error

    if not isinstance(payload, dict):
        raise JobValidationError(
            "INVALID_JSON", "Request body must be a JSON object."
        )

    if set(payload) - JOB_REQUEST_FIELDS:
        raise JobValidationError(
            "UNKNOWN_FIELDS", "Request body contains unsupported fields."
        )

    if "text" not in payload:
        raise JobValidationError("MISSING_TEXT", "text is required.")
    text = payload["text"]
    if not isinstance(text, str):
        raise JobValidationError("INVALID_TEXT", "text must be a string.")
    text = text.strip()
    if not text:
        raise JobValidationError("INVALID_TEXT", "text must be a non-empty string.")
    if len(text) > MAX_JOB_TEXT_LENGTH:
        raise JobValidationError(
            "TEXT_TOO_LONG", "text must not exceed 3000 characters."
        )

    if "voice" not in payload:
        raise JobValidationError("MISSING_VOICE", "voice is required.")
    voice = payload["voice"]
    if not isinstance(voice, str) or not voice.strip():
        raise JobValidationError(
            "INVALID_VOICE", "voice must be a non-empty string."
        )

    engine = payload.get("engine", DEFAULT_ENGINE)
    if not isinstance(engine, str) or engine not in ALLOWED_ENGINES:
        raise JobValidationError(
            "INVALID_ENGINE", "engine must be either standard or neural."
        )

    output_format = payload.get("output_format", DEFAULT_OUTPUT_FORMAT)
    if (
        not isinstance(output_format, str)
        or output_format not in ALLOWED_OUTPUT_FORMATS
    ):
        raise JobValidationError(
            "INVALID_OUTPUT_FORMAT",
            "output_format must be one of mp3, ogg_vorbis, or pcm.",
        )

    return {
        "text": text,
        "voice": voice,
        "engine": engine,
        "output_format": output_format,
    }


def _parse_stt_request(event: dict[str, Any]) -> dict[str, str]:
    body = event.get("body")
    if not isinstance(body, str):
        raise SttValidationError("INVALID_JSON", "Request body must be valid JSON.")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise SttValidationError(
            "INVALID_JSON", "Request body must be valid JSON."
        ) from error
    if not isinstance(payload, dict):
        raise SttValidationError(
            "INVALID_JSON", "Request body must be a JSON object."
        )
    if set(payload) - STT_REQUEST_FIELDS:
        raise SttValidationError(
            "UNKNOWN_FIELDS", "Request body contains unsupported fields."
        )

    if "media_format" not in payload:
        raise SttValidationError("MISSING_MEDIA_FORMAT", "media_format is required.")
    media_format = payload["media_format"]
    if not isinstance(media_format, str) or media_format not in STT_CONTENT_TYPES:
        raise SttValidationError(
            "INVALID_MEDIA_FORMAT", "media_format is not supported."
        )

    if "language_code" not in payload:
        raise SttValidationError(
            "MISSING_LANGUAGE_CODE", "language_code is required."
        )
    language_code = payload["language_code"]
    if not isinstance(language_code, str) or language_code not in STT_LANGUAGES:
        raise SttValidationError(
            "INVALID_LANGUAGE_CODE",
            "language_code must be either vi-VN or en-US.",
        )
    return {"media_format": media_format, "language_code": language_code}


def _profile_body(item: dict[str, Any]) -> dict[str, Any]:
    return {"profile": {field: item.get(field) for field in PROFILE_FIELDS}}


def _public_job(item: dict[str, Any]) -> dict[str, Any]:
    return {field: item[field] for field in JOB_RESPONSE_FIELDS if field in item}


def _public_stt_job(item: dict[str, Any]) -> dict[str, Any]:
    return {field: item[field] for field in STT_RESPONSE_FIELDS if field in item}


def _download_job_item(
    event: dict[str, Any],
    owner_sub: str,
    expected_type: str,
    request_id: str | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    path_parameters = event.get("pathParameters")
    job_id = (
        path_parameters.get("job_id") if isinstance(path_parameters, dict) else None
    )
    if not isinstance(job_id, str) or not job_id.strip():
        return None, _error_response(
            400, "INVALID_JOB_ID", "A non-empty job_id is required.", request_id
        )
    job_id = job_id.strip()

    try:
        result = _create_conversion_jobs_table().get_item(Key={"job_id": job_id})
    except ClientError as error:
        LOGGER.exception(
            "job_download_database_error",
            extra={
                "request_id": request_id,
                "job_type": expected_type,
                "error_code": _client_error_code(error),
            },
        )
        return None, _error_response(
            502, "DATABASE_ERROR", "Unable to access the requested job.", request_id
        )
    except Exception:
        LOGGER.exception(
            "job_download_unexpected_error",
            extra={"request_id": request_id, "job_type": expected_type},
        )
        return None, _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    item = result.get("Item")
    if (
        not isinstance(item, dict)
        or item.get("job_id") != job_id
        or item.get("owner_sub") != owner_sub
        or item.get("type") != expected_type
    ):
        return None, _error_response(
            404, "JOB_NOT_FOUND", f"The {expected_type} job does not exist.", request_id
        )
    if item.get("status") != "COMPLETED":
        return None, _error_response(
            409,
            "JOB_NOT_READY",
            "The requested job is not ready for download.",
            request_id,
        )
    return item, None


def _is_safe_object_key(key: object, expected_prefix: str) -> bool:
    if not isinstance(key, str) or not key:
        return False
    decoded_key = unquote(key)
    if (
        "\\" in key
        or "\\" in decoded_key
        or "://" in key
        or "://" in decoded_key
        or not key.startswith(expected_prefix)
        or not decoded_key.startswith(expected_prefix)
        or key == expected_prefix
        or decoded_key == expected_prefix
    ):
        return False
    return all(
        part not in {"", ".", ".."}
        for candidate in (key, decoded_key)
        for part in candidate.split("/")
    )


def _safe_download_job_id(job_id: str) -> str:
    safe_value = re.sub(r"[^A-Za-z0-9_-]", "-", job_id).strip("-")
    return safe_value or "job"


def _presign_download(
    *,
    job_id: str,
    job_type: str,
    object_key: str,
    content_type: str,
    file_name: str,
    request_id: str | None,
) -> dict[str, Any]:
    try:
        bucket_name = os.environ["MEDIA_BUCKET_NAME"]
        expires_in = int(os.environ.get("PRESIGNED_URL_TTL_SECONDS", "900"))
    except Exception:
        LOGGER.exception(
            "job_download_configuration_error",
            extra={"request_id": request_id, "job_type": job_type, "job_id": job_id},
        )
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    try:
        download_url = _create_s3_client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket_name,
                "Key": object_key,
                "ResponseContentType": content_type,
                "ResponseContentDisposition": f'attachment; filename="{file_name}"',
            },
            ExpiresIn=expires_in,
        )
    except ClientError as error:
        LOGGER.exception(
            "job_download_storage_error",
            extra={
                "request_id": request_id,
                "job_type": job_type,
                "job_id": job_id,
                "error_code": _client_error_code(error),
            },
        )
        return _error_response(
            502, "STORAGE_ERROR", "Unable to prepare the download.", request_id
        )
    except Exception:
        LOGGER.exception(
            "job_download_storage_error",
            extra={"request_id": request_id, "job_type": job_type, "job_id": job_id},
        )
        return _error_response(
            502, "STORAGE_ERROR", "Unable to prepare the download.", request_id
        )

    return _response(
        200,
        {
            "job": {
                "job_id": job_id,
                "type": job_type,
                "status": "COMPLETED",
            },
            "download": {
                "method": "GET",
                "url": download_url,
                "expires_in": expires_in,
                "content_type": content_type,
                "file_name": file_name,
            },
        },
    )


def _handle_download_tts_job(
    event: dict[str, Any], owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    item, error_response = _download_job_item(
        event, owner_sub, "TTS", request_id
    )
    if error_response is not None:
        return error_response
    if item is None:
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    job_id = str(item["job_id"])
    output_key = item.get("output_key")
    expected_prefix = f"output/tts/jobs/{job_id}/"
    output_format = item.get("output_format")
    format_details = (
        TTS_DOWNLOAD_FORMATS.get(output_format)
        if isinstance(output_format, str)
        else None
    )
    if format_details is None and isinstance(output_key, str):
        extension_to_format = {
            ".mp3": TTS_DOWNLOAD_FORMATS["mp3"],
            ".ogg": TTS_DOWNLOAD_FORMATS["ogg_vorbis"],
            ".pcm": TTS_DOWNLOAD_FORMATS["pcm"],
        }
        format_details = next(
            (
                details
                for suffix, details in extension_to_format.items()
                if output_key.lower().endswith(suffix)
            ),
            None,
        )
    if (
        not _is_safe_object_key(output_key, expected_prefix)
        or format_details is None
        or not isinstance(output_key, str)
        or not output_key.lower().endswith(f".{format_details[0]}")
    ):
        return _error_response(
            409,
            "DOWNLOAD_NOT_AVAILABLE",
            "The completed job does not have a valid download object.",
            request_id,
        )

    extension, content_type = format_details
    file_name = f"polly-voice-{_safe_download_job_id(job_id)}.{extension}"
    return _presign_download(
        job_id=job_id,
        job_type="TTS",
        object_key=output_key,
        content_type=content_type,
        file_name=file_name,
        request_id=request_id,
    )


def _handle_download_stt_job(
    event: dict[str, Any], owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    item, error_response = _download_job_item(
        event, owner_sub, "STT", request_id
    )
    if error_response is not None:
        return error_response
    if item is None:
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    job_id = str(item["job_id"])
    transcript_key = item.get("transcript_key") or item.get("output_key")
    expected_key = f"output/stt/jobs/{job_id}/transcript.json"
    if (
        not _is_safe_object_key(
            transcript_key, f"output/stt/jobs/{job_id}/"
        )
        or transcript_key != expected_key
    ):
        return _error_response(
            409,
            "DOWNLOAD_NOT_AVAILABLE",
            "The completed job does not have a valid download object.",
            request_id,
        )

    file_name = f"transcript-{_safe_download_job_id(job_id)}.json"
    return _presign_download(
        job_id=job_id,
        job_type="STT",
        object_key=expected_key,
        content_type="application/json",
        file_name=file_name,
        request_id=request_id,
    )


def _handle_get_profile(cognito_sub: str, request_id: str | None) -> dict[str, Any]:
    try:
        result = _create_users_table().get_item(
            Key={"cognito_sub": cognito_sub},
        )
    except ClientError as error:
        LOGGER.exception(
            "profile_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to access the user profile.", request_id
        )
    except Exception:
        LOGGER.exception("profile_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    item = result.get("Item")
    if not isinstance(item, dict):
        return _error_response(
            404,
            "PROFILE_NOT_FOUND",
            "The user profile does not exist.",
            request_id,
        )
    return _response(200, _profile_body(item))


def _handle_put_profile(
    event: dict[str, Any], cognito_sub: str, request_id: str | None
) -> dict[str, Any]:
    try:
        profile = _parse_profile_request(event)
    except ProfileValidationError as error:
        return _error_response(400, error.code, error.message, request_id)

    timestamp = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    try:
        result = _create_users_table().update_item(
            Key={"cognito_sub": cognito_sub},
            UpdateExpression=(
                "SET #display_name = :display_name, "
                "#preferred_language = :preferred_language, "
                "#updated_at = :updated_at, "
                "#created_at = if_not_exists(#created_at, :created_at)"
            ),
            ExpressionAttributeNames={
                "#display_name": "display_name",
                "#preferred_language": "preferred_language",
                "#updated_at": "updated_at",
                "#created_at": "created_at",
            },
            ExpressionAttributeValues={
                ":display_name": profile["display_name"],
                ":preferred_language": profile["preferred_language"],
                ":updated_at": timestamp,
                ":created_at": timestamp,
            },
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        LOGGER.exception(
            "profile_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to update the user profile.", request_id
        )
    except Exception:
        LOGGER.exception("profile_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    attributes = result.get("Attributes")
    if not isinstance(attributes, dict):
        LOGGER.error(
            "profile_update_missing_attributes", extra={"request_id": request_id}
        )
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )
    return _response(200, _profile_body(attributes))


def _mark_job_failed(
    table: Any, job_id: str, updated_at: int, request_id: str | None
) -> None:
    try:
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #status = :failed, updated_at = :updated_at",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":failed": "FAILED",
                ":updated_at": updated_at,
            },
        )
    except Exception:
        LOGGER.exception(
            "tts_job_queue_compensation_error",
            extra={"request_id": request_id, "job_id": job_id},
        )


def _handle_create_tts_job(
    event: dict[str, Any], owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    try:
        request = _parse_job_request(event)
    except JobValidationError as error:
        return _error_response(400, error.code, error.message, request_id)

    now = int(datetime.now(UTC).timestamp())
    try:
        ttl_days = int(os.environ.get("JOB_TTL_DAYS", "30"))
        item: dict[str, Any] = {
            "job_id": str(uuid.uuid4()),
            "owner_sub": owner_sub,
            "type": "TTS",
            "status": "QUEUED",
            "text": request["text"],
            "voice": request["voice"],
            "engine": request["engine"],
            "output_format": request["output_format"],
            "created_at": now,
            "updated_at": now,
            "expires_at": now + ttl_days * 86400,
        }
        table = _create_conversion_jobs_table()
        table.put_item(Item=item)
    except ClientError as error:
        LOGGER.exception(
            "tts_job_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to create the TTS job.", request_id
        )
    except Exception:
        LOGGER.exception("tts_job_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    try:
        _create_sqs_client().send_message(
            QueueUrl=os.environ["TTS_QUEUE_URL"],
            MessageBody=json.dumps(
                {"job_id": item["job_id"], "type": "TTS"},
                separators=(",", ":"),
            ),
        )
    except ClientError as error:
        LOGGER.exception(
            "tts_job_queue_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        _mark_job_failed(table, item["job_id"], int(datetime.now(UTC).timestamp()), request_id)
        return _error_response(
            502, "QUEUE_ERROR", "Unable to queue the TTS job.", request_id
        )
    except Exception:
        LOGGER.exception("tts_job_unexpected_error", extra={"request_id": request_id})
        _mark_job_failed(table, item["job_id"], int(datetime.now(UTC).timestamp()), request_id)
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    return _response(202, {"job": _public_job(item)})


def _handle_list_tts_jobs(
    owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    try:
        result = _create_conversion_jobs_table().query(
            IndexName="ownerSub-createdAt-index",
            KeyConditionExpression="#owner_sub = :owner_sub",
            ExpressionAttributeNames={"#owner_sub": "owner_sub"},
            ExpressionAttributeValues={":owner_sub": owner_sub},
            ScanIndexForward=False,
            Limit=20,
        )
    except ClientError as error:
        LOGGER.exception(
            "tts_job_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to list TTS jobs.", request_id
        )
    except Exception:
        LOGGER.exception("tts_job_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    items = result.get("Items", [])
    if not isinstance(items, list):
        LOGGER.error(
            "tts_job_query_invalid_items", extra={"request_id": request_id}
        )
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )
    jobs = [
        _public_job(item)
        for item in items
        if isinstance(item, dict) and item.get("owner_sub") == owner_sub
    ]
    return _response(200, {"jobs": jobs})


def _handle_get_tts_job(
    event: dict[str, Any], owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    path_parameters = event.get("pathParameters")
    job_id = (
        path_parameters.get("job_id") if isinstance(path_parameters, dict) else None
    )
    if not isinstance(job_id, str) or not job_id.strip():
        return _error_response(
            400, "INVALID_JOB_ID", "A non-empty job_id is required.", request_id
        )
    job_id = job_id.strip()

    try:
        result = _create_conversion_jobs_table().get_item(Key={"job_id": job_id})
    except ClientError as error:
        LOGGER.exception(
            "tts_job_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to access the TTS job.", request_id
        )
    except Exception:
        LOGGER.exception("tts_job_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    item = result.get("Item")
    if not isinstance(item, dict) or item.get("owner_sub") != owner_sub:
        return _error_response(
            404, "JOB_NOT_FOUND", "The TTS job does not exist.", request_id
        )
    return _response(200, {"job": _public_job(item)})


def _mark_stt_upload_failed(
    table: Any, job_id: str, request_id: str | None
) -> None:
    try:
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression=(
                "SET #status = :failed, error_code = :error_code, "
                "error_message = :error_message, updated_at = :updated_at"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":failed": "FAILED",
                ":error_code": "UPLOAD_URL_ERROR",
                ":error_message": "Unable to prepare the media upload.",
                ":updated_at": int(datetime.now(UTC).timestamp()),
            },
        )
    except Exception:
        LOGGER.exception(
            "stt_upload_compensation_error",
            extra={"request_id": request_id, "job_id": job_id},
        )


def _handle_create_stt_job(
    event: dict[str, Any], owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    try:
        request = _parse_stt_request(event)
    except SttValidationError as error:
        return _error_response(400, error.code, error.message, request_id)

    now = int(datetime.now(UTC).timestamp())
    try:
        ttl_days = int(os.environ.get("JOB_TTL_DAYS", "30"))
        job_id = str(uuid.uuid4())
        input_key = (
            f"input/stt/jobs/{job_id}/source.{request['media_format']}"
        )
        item: dict[str, Any] = {
            "job_id": job_id,
            "owner_sub": owner_sub,
            "type": "STT",
            "status": "AWAITING_UPLOAD",
            "media_format": request["media_format"],
            "content_type": STT_CONTENT_TYPES[request["media_format"]],
            "language_code": request["language_code"],
            "input_key": input_key,
            "created_at": now,
            "updated_at": now,
            "expires_at": now + ttl_days * 86400,
        }
        table = _create_conversion_jobs_table()
        table.put_item(Item=item)
    except ClientError as error:
        LOGGER.exception(
            "stt_job_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to create the STT job.", request_id
        )
    except Exception:
        LOGGER.exception("stt_job_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )

    try:
        expires_in = int(os.environ.get("PRESIGNED_URL_TTL_SECONDS", "900"))
        upload_url = _create_s3_client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": os.environ["MEDIA_BUCKET_NAME"],
                "Key": input_key,
                "ContentType": item["content_type"],
            },
            ExpiresIn=expires_in,
        )
    except Exception:
        LOGGER.exception(
            "stt_upload_url_error",
            extra={"request_id": request_id, "job_id": job_id},
        )
        _mark_stt_upload_failed(table, job_id, request_id)
        return _error_response(
            502, "STORAGE_ERROR", "Unable to prepare the media upload.", request_id
        )

    return _response(
        201,
        {
            "job": _public_stt_job(item),
            "upload": {
                "method": "PUT",
                "url": upload_url,
                "headers": {"Content-Type": item["content_type"]},
                "expires_in": expires_in,
            },
        },
    )


def _handle_list_stt_jobs(
    owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    jobs: list[dict[str, Any]] = []
    last_evaluated_key: dict[str, Any] | None = None
    try:
        table = _create_conversion_jobs_table()
        while len(jobs) < 20:
            query: dict[str, Any] = {
                "IndexName": "ownerSub-createdAt-index",
                "KeyConditionExpression": "#owner_sub = :owner_sub",
                "ExpressionAttributeNames": {"#owner_sub": "owner_sub"},
                "ExpressionAttributeValues": {":owner_sub": owner_sub},
                "ScanIndexForward": False,
                "Limit": 20,
            }
            if last_evaluated_key is not None:
                query["ExclusiveStartKey"] = last_evaluated_key
            result = table.query(**query)
            items = result.get("Items", [])
            if not isinstance(items, list):
                raise TypeError("DynamoDB query returned invalid Items.")
            for item in items:
                if (
                    isinstance(item, dict)
                    and item.get("owner_sub") == owner_sub
                    and item.get("type") == "STT"
                ):
                    jobs.append(_public_stt_job(item))
                    if len(jobs) == 20:
                        break
            next_key = result.get("LastEvaluatedKey")
            if not isinstance(next_key, dict) or not next_key:
                break
            last_evaluated_key = next_key
    except ClientError as error:
        LOGGER.exception(
            "stt_job_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to list STT jobs.", request_id
        )
    except Exception:
        LOGGER.exception("stt_job_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )
    return _response(200, {"jobs": jobs})


def _handle_get_stt_job(
    event: dict[str, Any], owner_sub: str, request_id: str | None
) -> dict[str, Any]:
    path_parameters = event.get("pathParameters")
    job_id = (
        path_parameters.get("job_id") if isinstance(path_parameters, dict) else None
    )
    if not isinstance(job_id, str) or not job_id.strip():
        return _error_response(
            400, "INVALID_JOB_ID", "A non-empty job_id is required.", request_id
        )
    job_id = job_id.strip()
    try:
        result = _create_conversion_jobs_table().get_item(Key={"job_id": job_id})
    except ClientError as error:
        LOGGER.exception(
            "stt_job_database_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(
            502, "DATABASE_ERROR", "Unable to access the STT job.", request_id
        )
    except Exception:
        LOGGER.exception("stt_job_unexpected_error", extra={"request_id": request_id})
        return _error_response(
            500, "INTERNAL_ERROR", "An internal error occurred.", request_id
        )
    item = result.get("Item")
    if (
        not isinstance(item, dict)
        or item.get("owner_sub") != owner_sub
        or item.get("type") != "STT"
    ):
        return _error_response(
            404, "JOB_NOT_FOUND", "The STT job does not exist.", request_id
        )
    return _response(200, {"job": _public_stt_job(item)})


def _handle_preview(event: dict[str, Any], request_id: str | None) -> dict[str, Any]:
    try:
        request = _parse_preview_request(event)
    except PreviewValidationError as error:
        return _error_response(400, error.code, error.message, request_id)

    try:
        polly = _create_polly_client()
        synthesis = polly.synthesize_speech(
            Text=request["text"],
            VoiceId=request["voice"],
            Engine=request["engine"],
            OutputFormat=request["output_format"],
        )
    except ClientError as error:
        error_code = _client_error_code(error)
        if error_code in POLLY_VALIDATION_ERROR_CODES:
            LOGGER.warning(
                "polly_preview_validation_error",
                extra={"request_id": request_id, "error_code": error_code},
            )
            return _error_response(
                400, "POLLY_VALIDATION_ERROR", "Invalid Polly request.", request_id
            )

        LOGGER.exception(
            "polly_preview_service_error",
            extra={"request_id": request_id, "error_code": error_code},
        )
        return _error_response(
            502, "POLLY_SERVICE_ERROR", "Unable to synthesize preview.", request_id
        )
    except Exception:
        LOGGER.exception("polly_preview_unexpected_error", extra={"request_id": request_id})
        return _error_response(500, "INTERNAL_ERROR", "An internal error occurred.", request_id)

    try:
        audio_stream = synthesis["AudioStream"]
        try:
            audio = audio_stream.read()
        finally:
            audio_stream.close()

        bucket_name = os.environ["MEDIA_BUCKET_NAME"]
        expires_in = int(os.environ["PRESIGNED_URL_TTL_SECONDS"])
        object_key = (
            f"cache/tts/{uuid.uuid4()}.{OUTPUT_EXTENSIONS[request['output_format']]}"
        )
        s3 = _create_s3_client()
        s3.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=audio,
            ContentType=synthesis["ContentType"],
        )
        audio_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket_name, "Key": object_key},
            ExpiresIn=expires_in,
        )
    except ClientError as error:
        LOGGER.exception(
            "polly_preview_storage_error",
            extra={"request_id": request_id, "error_code": _client_error_code(error)},
        )
        return _error_response(502, "STORAGE_SERVICE_ERROR", "Unable to store preview.", request_id)
    except Exception:
        LOGGER.exception("polly_preview_unexpected_error", extra={"request_id": request_id})
        return _error_response(500, "INTERNAL_ERROR", "An internal error occurred.", request_id)

    return _response(
        200,
        {
            "audio_url": audio_url,
            "expires_in": expires_in,
            "voice": request["voice"],
            "engine": request["engine"],
            "output_format": request["output_format"],
        },
    )


def _dispatch_request(
    event: dict[str, Any], context: Any
) -> dict[str, Any]:
    """Dispatch API Gateway requests for the MVP."""
    method = event.get("httpMethod", "UNKNOWN")
    path = event.get("resource") or event.get("path", "UNKNOWN")
    request_id = getattr(context, "aws_request_id", None)

    if method == "OPTIONS":
        return _preflight_response()

    if method == "POST" and path == "/tts/preview":
        return _handle_preview(event, request_id)

    if path == "/profile" and method in {"GET", "PUT"}:
        cognito_sub = _authenticated_sub(event)
        if cognito_sub is None:
            return _error_response(
                401,
                "UNAUTHORIZED",
                "A valid authenticated user is required.",
                request_id,
            )
        if method == "GET":
            return _handle_get_profile(cognito_sub, request_id)
        return _handle_put_profile(event, cognito_sub, request_id)

    download_routes = {
        "/tts/jobs/{job_id}/download": _handle_download_tts_job,
        "/stt/jobs/{job_id}/download": _handle_download_stt_job,
    }
    if method == "GET" and path in download_routes:
        owner_sub = _authenticated_sub(event)
        if owner_sub is None:
            return _error_response(
                401,
                "UNAUTHORIZED",
                "A valid authenticated user is required.",
                request_id,
            )
        return download_routes[path](event, owner_sub, request_id)

    tts_job_route = (
        (method == "POST" and path == "/tts/jobs")
        or (method == "GET" and path == "/tts/jobs")
        or (method == "GET" and path == "/tts/jobs/{job_id}")
    )
    if tts_job_route:
        owner_sub = _authenticated_sub(event)
        if owner_sub is None:
            return _error_response(
                401,
                "UNAUTHORIZED",
                "A valid authenticated user is required.",
                request_id,
            )
        if method == "POST":
            return _handle_create_tts_job(event, owner_sub, request_id)
        if path == "/tts/jobs":
            return _handle_list_tts_jobs(owner_sub, request_id)
        return _handle_get_tts_job(event, owner_sub, request_id)

    stt_job_route = (
        (method == "POST" and path == "/stt/jobs")
        or (method == "GET" and path == "/stt/jobs")
        or (method == "GET" and path == "/stt/jobs/{job_id}")
    )
    if stt_job_route:
        owner_sub = _authenticated_sub(event)
        if owner_sub is None:
            return _error_response(
                401,
                "UNAUTHORIZED",
                "A valid authenticated user is required.",
                request_id,
            )
        if method == "POST":
            return _handle_create_stt_job(event, owner_sub, request_id)
        if path == "/stt/jobs":
            return _handle_list_stt_jobs(owner_sub, request_id)
        return _handle_get_stt_job(event, owner_sub, request_id)

    LOGGER.info(
        "api_route_not_implemented",
        extra={
            "request_id": request_id,
            "http_method": method,
            "resource_path": path,
        },
    )
    return _error_response(
        501,
        "NOT_IMPLEMENTED",
        f"{method} {path} is not implemented.",
        request_id,
    )


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Dispatch a request and attach allowlisted CORS response headers."""
    return _with_cors(_dispatch_request(event, context), event)
