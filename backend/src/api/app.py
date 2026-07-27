"""REST API handler for the Polly Voice MVP."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import UTC, datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
MAX_PREVIEW_TEXT_LENGTH = 500
DEFAULT_ENGINE = "neural"
DEFAULT_OUTPUT_FORMAT = "mp3"
ALLOWED_ENGINES = {"standard", "neural"}
ALLOWED_OUTPUT_FORMATS = {"mp3", "ogg_vorbis", "pcm"}
OUTPUT_EXTENSIONS = {"mp3": "mp3", "ogg_vorbis": "ogg", "pcm": "pcm"}
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


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
            "Content-Type": "application/json",
            "Vary": "Origin",
        },
        "body": json.dumps(body, separators=(",", ":")),
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


def _profile_body(item: dict[str, Any]) -> dict[str, Any]:
    return {"profile": {field: item.get(field) for field in PROFILE_FIELDS}}


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


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Dispatch API Gateway requests for the MVP."""
    method = event.get("httpMethod", "UNKNOWN")
    path = event.get("resource") or event.get("path", "UNKNOWN")
    request_id = getattr(context, "aws_request_id", None)

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
