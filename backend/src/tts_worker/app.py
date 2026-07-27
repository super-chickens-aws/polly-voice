"""SQS-driven asynchronous Amazon Polly TTS worker."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

POLLY_VALIDATION_ERROR_CODES = {
    "EngineNotSupportedException",
    "InvalidS3BucketException",
    "InvalidS3KeyException",
    "InvalidSnsTopicArnException",
    "InvalidSsmlException",
    "LanguageNotSupportedException",
    "MarksNotSupportedForFormatException",
    "TextLengthExceededException",
}
RETRYABLE_JOB_STATUSES = {"QUEUED", "FAILED"}
SAFE_POLLY_VALIDATION_MESSAGE = "The TTS job contains unsupported synthesis settings."
SAFE_JOB_DATA_MESSAGE = "The stored TTS job is incomplete or invalid."


class MessageValidationError(ValueError):
    """An invalid TTS SQS message."""


def _create_jobs_table() -> Any:
    """Create the DynamoDB Table lazily for runtime use and test injection."""
    return boto3.resource("dynamodb").Table(
        os.environ["CONVERSION_JOBS_TABLE_NAME"]
    )


def _create_polly_client() -> Any:
    """Create the Polly client lazily for runtime use and test injection."""
    return boto3.client("polly")


def _client_error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", "ClientError"))


def _unix_timestamp() -> int:
    return int(datetime.now(UTC).timestamp())


def _parse_message(record: dict[str, Any]) -> dict[str, str]:
    body = record.get("body")
    if not isinstance(body, str):
        raise MessageValidationError("Message body must be valid JSON.")

    try:
        message = json.loads(body)
    except json.JSONDecodeError as error:
        raise MessageValidationError("Message body must be valid JSON.") from error

    if not isinstance(message, dict):
        raise MessageValidationError("Message body must be a JSON object.")

    job_id = message.get("job_id")
    if not isinstance(job_id, str) or not job_id.strip():
        raise MessageValidationError("A non-empty job_id is required.")
    if message.get("type") != "TTS":
        raise MessageValidationError("Message type must be TTS.")

    return {"job_id": job_id.strip(), "type": "TTS"}


def _valid_job_input(item: dict[str, Any]) -> bool:
    return all(
        isinstance(item.get(field), str) and bool(item[field].strip())
        for field in ("text", "voice", "engine", "output_format")
    )


def _mark_job_failed(
    table: Any,
    job_id: str,
    error_code: str,
    error_message: str,
    request_id: str | None,
    *,
    polly_task_id: str | None = None,
) -> None:
    expression = (
        "SET #status = :failed, error_code = :error_code, "
        "error_message = :error_message, updated_at = :updated_at"
    )
    values: dict[str, Any] = {
        ":failed": "FAILED",
        ":error_code": error_code,
        ":error_message": error_message,
        ":updated_at": _unix_timestamp(),
    }
    if polly_task_id is not None:
        expression += ", polly_task_id = :polly_task_id"
        values[":polly_task_id"] = polly_task_id

    try:
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression=expression,
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues=values,
        )
    except Exception:
        LOGGER.exception(
            "tts_job_failed_status_update_error",
            extra={"request_id": request_id, "job_id": job_id},
        )


def _save_processing_job(
    table: Any,
    job_id: str,
    task: dict[str, Any],
    output_prefix: str,
) -> None:
    expression = (
        "SET #status = :processing, polly_task_id = :polly_task_id, "
        "polly_task_status = :polly_task_status, "
        "output_prefix = :output_prefix, updated_at = :updated_at"
    )
    values: dict[str, Any] = {
        ":processing": "PROCESSING",
        ":polly_task_id": task["TaskId"],
        ":polly_task_status": task["TaskStatus"],
        ":output_prefix": output_prefix,
        ":updated_at": _unix_timestamp(),
    }
    output_uri = task.get("OutputUri")
    if isinstance(output_uri, str) and output_uri:
        expression += ", output_uri = :output_uri"
        values[":output_uri"] = output_uri

    expression += " REMOVE error_code, error_message"
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=expression,
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues=values,
    )


def _process_record(
    record: dict[str, Any], request_id: str | None
) -> bool:
    message_id = str(record.get("messageId", ""))
    try:
        message = _parse_message(record)
    except MessageValidationError:
        LOGGER.warning(
            "tts_message_invalid",
            extra={"request_id": request_id, "message_id": message_id},
        )
        return False

    job_id = message["job_id"]
    table: Any | None = None
    try:
        table = _create_jobs_table()
        result = table.get_item(Key={"job_id": job_id})
    except ClientError as error:
        error_code = _client_error_code(error)
        LOGGER.exception(
            "tts_job_database_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "error_code": error_code,
            },
        )
        if table is not None:
            _mark_job_failed(
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
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
            },
        )
        return True

    if item.get("type") != "TTS":
        LOGGER.warning(
            "job_type_mismatch",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
            },
        )
        return True

    if item.get("status") == "COMPLETED" or item.get("polly_task_id"):
        LOGGER.info(
            "tts_job_already_started",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
            },
        )
        return True

    if item.get("status") not in RETRYABLE_JOB_STATUSES:
        LOGGER.info(
            "tts_job_status_skipped",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "status": item.get("status"),
            },
        )
        return True

    if not _valid_job_input(item):
        LOGGER.warning(
            "tts_job_invalid_data",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
            },
        )
        _mark_job_failed(
            table,
            job_id,
            "INVALID_JOB_DATA",
            SAFE_JOB_DATA_MESSAGE,
            request_id,
        )
        return True

    output_prefix = f"output/tts/jobs/{job_id}/audio"
    try:
        response = _create_polly_client().start_speech_synthesis_task(
            Text=item["text"],
            VoiceId=item["voice"],
            Engine=item["engine"],
            OutputFormat=item["output_format"],
            TextType="text",
            OutputS3BucketName=os.environ["MEDIA_BUCKET_NAME"],
            OutputS3KeyPrefix=output_prefix,
            SnsTopicArn=os.environ["POLLY_COMPLETION_TOPIC_ARN"],
        )
    except ClientError as error:
        error_code = _client_error_code(error)
        if error_code in POLLY_VALIDATION_ERROR_CODES:
            LOGGER.warning(
                "tts_job_polly_validation_error",
                extra={
                    "request_id": request_id,
                    "message_id": message_id,
                    "job_id": job_id,
                    "error_code": error_code,
                },
            )
            _mark_job_failed(
                table,
                job_id,
                "POLLY_VALIDATION_ERROR",
                SAFE_POLLY_VALIDATION_MESSAGE,
                request_id,
            )
            return True

        LOGGER.exception(
            "tts_job_polly_transient_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "error_code": error_code,
            },
        )
        _mark_job_failed(
            table,
            job_id,
            "POLLY_SERVICE_ERROR",
            "A temporary synthesis service error occurred.",
            request_id,
        )
        return False

    task = response.get("SynthesisTask")
    if (
        not isinstance(task, dict)
        or not isinstance(task.get("TaskId"), str)
        or not task["TaskId"]
        or not isinstance(task.get("TaskStatus"), str)
        or not task["TaskStatus"]
    ):
        LOGGER.error(
            "tts_job_invalid_polly_response",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
            },
        )
        _mark_job_failed(
            table,
            job_id,
            "POLLY_SERVICE_ERROR",
            "The synthesis service returned an invalid response.",
            request_id,
        )
        return False

    try:
        _save_processing_job(table, job_id, task, output_prefix)
    except ClientError as error:
        LOGGER.exception(
            "tts_job_database_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "job_id": job_id,
                "error_code": _client_error_code(error),
            },
        )
        _mark_job_failed(
            table,
            job_id,
            "DATABASE_ERROR",
            "A temporary database error occurred.",
            request_id,
            polly_task_id=task["TaskId"],
        )
        return False

    return True


def lambda_handler(
    event: dict[str, Any], context: Any
) -> dict[str, list[dict[str, str]]]:
    """Process each SQS record independently using Lambda partial batch failures."""
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
                "tts_record_unexpected_error",
                extra={"request_id": request_id, "message_id": message_id},
            )
            succeeded = False
        if not succeeded:
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}
