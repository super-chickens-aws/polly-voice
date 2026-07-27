"""SQS-driven Amazon Transcribe STT worker."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import unquote

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

INPUT_KEY_PATTERN = re.compile(
    r"^input/stt/jobs/([^/]+)/source\.(mp3|mp4|wav|flac|ogg|amr|webm|m4a)$"
)
RETRYABLE_STATUSES = {"AWAITING_UPLOAD", "FAILED"}
TRANSCRIBE_VALIDATION_MESSAGE = (
    "Amazon Transcribe could not accept the submitted audio job."
)


class MessageValidationError(ValueError):
    """An invalid EventBridge event inside an SQS record."""


def _create_jobs_table() -> Any:
    """Create the DynamoDB Table lazily for runtime use and test injection."""
    return boto3.resource("dynamodb").Table(
        os.environ["CONVERSION_JOBS_TABLE_NAME"]
    )


def _create_transcribe_client() -> Any:
    """Create the Transcribe client lazily for runtime use and test injection."""
    return boto3.client("transcribe")


def _timestamp() -> int:
    return int(datetime.now(UTC).timestamp())


def _client_error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", "ClientError"))


def _parse_record(record: dict[str, Any]) -> tuple[str, str]:
    body = record.get("body")
    if not isinstance(body, str):
        raise MessageValidationError("SQS body must be valid JSON.")
    try:
        event = json.loads(body)
    except json.JSONDecodeError as error:
        raise MessageValidationError("SQS body must be valid JSON.") from error
    if not isinstance(event, dict):
        raise MessageValidationError("SQS body must contain an event object.")
    if event.get("source") != "aws.s3":
        raise MessageValidationError("Event source must be aws.s3.")
    if event.get("detail-type") != "Object Created":
        raise MessageValidationError("Event type must be Object Created.")
    detail = event.get("detail")
    if not isinstance(detail, dict):
        raise MessageValidationError("Event detail is required.")
    bucket = detail.get("bucket")
    object_detail = detail.get("object")
    if not isinstance(bucket, dict) or not isinstance(object_detail, dict):
        raise MessageValidationError("Bucket and object details are required.")
    bucket_name = bucket.get("name")
    object_key = object_detail.get("key")
    if not isinstance(bucket_name, str) or not bucket_name:
        raise MessageValidationError("Bucket name is required.")
    if not isinstance(object_key, str) or not object_key:
        raise MessageValidationError("Object key is required.")
    return bucket_name, unquote(object_key)


def _mark_failed(
    table: Any,
    job_id: str,
    error_code: str,
    error_message: str,
    request_id: str | None,
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
                ":error_code": error_code,
                ":error_message": error_message,
                ":updated_at": _timestamp(),
            },
        )
    except Exception:
        LOGGER.exception(
            "stt_failed_status_update_error",
            extra={"request_id": request_id, "job_id": job_id},
        )


def _save_processing(
    table: Any,
    job_id: str,
    output_key: str,
    *,
    transcribe_status: str | None = None,
) -> None:
    expression = (
        "SET #status = :processing, "
        "transcribe_job_name = :transcribe_job_name, "
        "output_key = :output_key, updated_at = :updated_at"
    )
    values: dict[str, Any] = {
        ":processing": "PROCESSING",
        ":transcribe_job_name": job_id,
        ":output_key": output_key,
        ":updated_at": _timestamp(),
    }
    if transcribe_status is not None:
        expression += ", transcribe_job_status = :transcribe_job_status"
        values[":transcribe_job_status"] = transcribe_status
    expression += " REMOVE error_code, error_message"
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=expression,
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues=values,
    )


def _process_record(record: dict[str, Any], request_id: str | None) -> bool:
    message_id = str(record.get("messageId", ""))
    try:
        bucket_name, object_key = _parse_record(record)
    except MessageValidationError:
        LOGGER.warning(
            "stt_message_invalid",
            extra={"request_id": request_id, "message_id": message_id},
        )
        return False

    if bucket_name != os.environ["MEDIA_BUCKET_NAME"]:
        LOGGER.info(
            "stt_object_bucket_ignored",
            extra={"request_id": request_id, "message_id": message_id},
        )
        return True
    key_match = INPUT_KEY_PATTERN.fullmatch(object_key)
    if key_match is None:
        LOGGER.info(
            "stt_object_key_ignored",
            extra={"request_id": request_id, "message_id": message_id},
        )
        return True
    job_id, extension = key_match.groups()
    if not job_id:
        return True

    table: Any | None = None
    try:
        table = _create_jobs_table()
        result = table.get_item(Key={"job_id": job_id})
    except ClientError as error:
        LOGGER.exception(
            "stt_database_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "error_code": _client_error_code(error),
            },
        )
        if table is not None:
            _mark_failed(
                table,
                job_id,
                "DATABASE_ERROR",
                "A temporary database error occurred.",
                request_id,
            )
        return False

    item = result.get("Item")
    if not isinstance(item, dict):
        LOGGER.warning(
            "job_not_found",
            extra={"request_id": request_id, "message_id": message_id, "job_id": job_id},
        )
        return True
    if item.get("type") != "STT":
        LOGGER.warning(
            "job_type_mismatch",
            extra={"request_id": request_id, "message_id": message_id, "job_id": job_id},
        )
        return True
    if item.get("input_key") != object_key or item.get("media_format") != extension:
        LOGGER.error(
            "stt_job_input_mismatch",
            extra={"request_id": request_id, "message_id": message_id, "job_id": job_id},
        )
        return True

    language_code = item.get("language_code")
    if not isinstance(language_code, str) or not language_code:
        LOGGER.error(
            "stt_job_language_invalid",
            extra={"request_id": request_id, "message_id": message_id, "job_id": job_id},
        )
        _mark_failed(
            table,
            job_id,
            "INVALID_JOB_DATA",
            "The stored STT job is incomplete or invalid.",
            request_id,
        )
        return True

    if item.get("status") == "COMPLETED" or item.get("transcribe_job_name"):
        return True
    if item.get("status") not in RETRYABLE_STATUSES:
        return True

    output_key = f"output/stt/jobs/{job_id}/transcript.json"
    try:
        response = _create_transcribe_client().start_transcription_job(
            TranscriptionJobName=job_id,
            LanguageCode=language_code,
            MediaFormat=extension,
            Media={"MediaFileUri": f"s3://{bucket_name}/{object_key}"},
            OutputBucketName=bucket_name,
            OutputKey=output_key,
        )
    except ClientError as error:
        error_code = _client_error_code(error)
        if error_code == "ConflictException":
            try:
                _save_processing(table, job_id, output_key)
            except ClientError as update_error:
                LOGGER.exception(
                    "stt_conflict_recovery_database_error",
                    extra={
                        "request_id": request_id,
                        "message_id": message_id,
                        "job_id": job_id,
                        "error_code": _client_error_code(update_error),
                    },
                )
                return False
            return True
        if error_code == "BadRequestException":
            _mark_failed(
                table,
                job_id,
                "TRANSCRIBE_VALIDATION_ERROR",
                TRANSCRIBE_VALIDATION_MESSAGE,
                request_id,
            )
            return True
        LOGGER.exception(
            "stt_transcribe_transient_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "error_code": error_code,
            },
        )
        _mark_failed(
            table,
            job_id,
            "TRANSCRIBE_SERVICE_ERROR",
            "A temporary transcription service error occurred.",
            request_id,
        )
        return False

    transcription_job = response.get("TranscriptionJob")
    if (
        not isinstance(transcription_job, dict)
        or transcription_job.get("TranscriptionJobName") != job_id
        or not isinstance(transcription_job.get("TranscriptionJobStatus"), str)
    ):
        LOGGER.error(
            "stt_transcribe_response_invalid",
            extra={"request_id": request_id, "message_id": message_id, "job_id": job_id},
        )
        return False
    try:
        _save_processing(
            table,
            job_id,
            output_key,
            transcribe_status=transcription_job["TranscriptionJobStatus"],
        )
    except ClientError as error:
        LOGGER.exception(
            "stt_database_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "error_code": _client_error_code(error),
            },
        )
        return False
    return True


def lambda_handler(
    event: dict[str, Any], context: Any
) -> dict[str, list[dict[str, str]]]:
    """Process each SQS record independently using partial batch failures."""
    records = event.get("Records", [])
    request_id = getattr(context, "aws_request_id", None)
    failures: list[dict[str, str]] = []
    if not isinstance(records, list):
        return {"batchItemFailures": failures}

    for record in records:
        message_id = (
            str(record.get("messageId", "")) if isinstance(record, dict) else ""
        )
        try:
            succeeded = isinstance(record, dict) and _process_record(record, request_id)
        except Exception:
            LOGGER.exception(
                "stt_record_unexpected_error",
                extra={"request_id": request_id, "message_id": message_id},
            )
            succeeded = False
        if not succeeded:
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}
