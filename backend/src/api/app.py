"""REST API handler for the Polly Voice MVP."""

from __future__ import annotations

import json
import logging
import os
import uuid
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


class PreviewValidationError(ValueError):
    """An invalid client request for a TTS preview."""

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
