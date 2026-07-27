"""Completion handler for Amazon Polly SNS and future Transcribe events."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any
from urllib.parse import unquote, urlparse

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

POLLY_TASK_MAPPING_PREFIX = "POLLY_TASK#"
GENERIC_POLLY_FAILURE_MESSAGE = (
    "Amazon Polly could not complete the speech synthesis task."
)


class PermanentNotificationError(ValueError):
    """A malformed SNS notification that must not be retried."""


class RetryableCompletionError(RuntimeError):
    """A completion inconsistency that may resolve on a later SNS retry."""


def _create_jobs_table() -> Any:
    """Create the DynamoDB Table lazily for runtime use and test injection."""
    return boto3.resource("dynamodb").Table(
        os.environ["CONVERSION_JOBS_TABLE_NAME"]
    )


def _create_polly_client() -> Any:
    """Create the Polly client lazily for runtime use and test injection."""
    return boto3.client("polly")


def _create_transcribe_client() -> Any:
    """Create the Transcribe client lazily for runtime use and test injection."""
    return boto3.client("transcribe")


def _unix_timestamp() -> int:
    return int(datetime.now(UTC).timestamp())


def _client_error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", "ClientError"))


def _parse_sns_message(record: dict[str, Any]) -> dict[str, Any]:
    sns = record.get("Sns")
    if not isinstance(sns, dict):
        raise PermanentNotificationError("SNS envelope is missing.")
    raw_message = sns.get("Message")
    if not isinstance(raw_message, str):
        raise PermanentNotificationError("SNS message must be valid JSON.")

    try:
        message = json.loads(raw_message)
    except json.JSONDecodeError as error:
        raise PermanentNotificationError(
            "SNS message must be valid JSON."
        ) from error

    if not isinstance(message, dict):
        raise PermanentNotificationError("SNS message must be a JSON object.")
    task_id = message.get("taskId")
    if not isinstance(task_id, str) or not task_id.strip():
        raise PermanentNotificationError("A non-empty taskId is required.")
    return {
        "task_id": task_id.strip(),
        "notification_status": message.get("taskStatus"),
    }


def _output_key_from_uri(output_uri: str, application_job_id: str) -> str | None:
    parsed = urlparse(output_uri)
    path = unquote(parsed.path).lstrip("/")
    bucket_name = os.environ["MEDIA_BUCKET_NAME"]
    bucket_prefix = f"{bucket_name}/"
    if path.startswith(bucket_prefix):
        path = path[len(bucket_prefix) :]

    expected_prefix = f"output/tts/jobs/{application_job_id}/"
    if not path.startswith(expected_prefix):
        return None
    if ".." in path.split("/"):
        return None
    return path


def _load_application_job(
    table: Any,
    task_id: str,
    request_id: str | None,
    message_id: str,
) -> tuple[dict[str, Any] | None, str | None]:
    mapping_result = table.get_item(
        Key={"job_id": f"{POLLY_TASK_MAPPING_PREFIX}{task_id}"}
    )
    mapping = mapping_result.get("Item")
    if not isinstance(mapping, dict):
        raise RetryableCompletionError("Polly task mapping is not available yet.")

    application_job_id = mapping.get("application_job_id")
    if not isinstance(application_job_id, str) or not application_job_id:
        raise RetryableCompletionError("Polly task mapping is incomplete.")

    job_result = table.get_item(Key={"job_id": application_job_id})
    job = job_result.get("Item")
    if not isinstance(job, dict):
        LOGGER.warning(
            "completion_application_job_not_found",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "task_id": task_id,
                "job_id": application_job_id,
            },
        )
        return None, application_job_id

    if job.get("type") != "TTS":
        LOGGER.warning(
            "completion_job_type_mismatch",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "task_id": task_id,
                "job_id": application_job_id,
            },
        )
        return None, application_job_id

    if job.get("polly_task_id") != task_id:
        LOGGER.error(
            "completion_task_id_mismatch",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "task_id": task_id,
                "job_id": application_job_id,
            },
        )
        return None, application_job_id

    return job, application_job_id


def _update_completed_job(
    table: Any,
    job_id: str,
    task: dict[str, Any],
    output_uri: str,
    output_key: str,
) -> None:
    timestamp = _unix_timestamp()
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=(
            "SET #status = :completed, polly_task_status = :polly_task_status, "
            "completed_at = :completed_at, updated_at = :updated_at, "
            "output_uri = :output_uri, output_key = :output_key "
            "REMOVE error_code, error_message"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":completed": "COMPLETED",
            ":polly_task_status": task["TaskStatus"],
            ":completed_at": timestamp,
            ":updated_at": timestamp,
            ":output_uri": output_uri,
            ":output_key": output_key,
        },
    )


def _update_failed_job(table: Any, job_id: str, task: dict[str, Any]) -> None:
    timestamp = _unix_timestamp()
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=(
            "SET #status = :failed, polly_task_status = :polly_task_status, "
            "completed_at = :completed_at, updated_at = :updated_at, "
            "error_code = :error_code, error_message = :error_message"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":failed": "FAILED",
            ":polly_task_status": task["TaskStatus"],
            ":completed_at": timestamp,
            ":updated_at": timestamp,
            ":error_code": "POLLY_TASK_FAILED",
            ":error_message": GENERIC_POLLY_FAILURE_MESSAGE,
        },
    )


def _update_processing_job(
    table: Any, job_id: str, task: dict[str, Any]
) -> None:
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=(
            "SET #status = :processing, "
            "polly_task_status = :polly_task_status, updated_at = :updated_at"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":processing": "PROCESSING",
            ":polly_task_status": task["TaskStatus"],
            ":updated_at": _unix_timestamp(),
        },
    )


def _process_sns_record(
    record: dict[str, Any], request_id: str | None
) -> str:
    sns = record.get("Sns")
    message_id = str(sns.get("MessageId", "")) if isinstance(sns, dict) else ""
    try:
        notification = _parse_sns_message(record)
    except PermanentNotificationError:
        LOGGER.warning(
            "completion_notification_ignored",
            extra={"request_id": request_id, "message_id": message_id},
        )
        return "ignored"

    task_id = notification["task_id"]
    LOGGER.info(
        "polly_completion_notification_received",
        extra={
            "request_id": request_id,
            "message_id": message_id,
            "task_id": task_id,
            "notification_status": notification["notification_status"],
        },
    )

    try:
        task_result = _create_polly_client().get_speech_synthesis_task(
            TaskId=task_id
        )
        table = _create_jobs_table()
        job, application_job_id = _load_application_job(
            table, task_id, request_id, message_id
        )
    except ClientError as error:
        LOGGER.exception(
            "completion_aws_error",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "task_id": task_id,
                "error_code": _client_error_code(error),
            },
        )
        raise

    task = task_result.get("SynthesisTask")
    if not isinstance(task, dict):
        raise RetryableCompletionError("Polly task details are unavailable.")
    returned_task_id = task.get("TaskId")
    if returned_task_id != task_id:
        raise RetryableCompletionError("Polly returned an inconsistent task ID.")

    if job is None or application_job_id is None:
        return "ignored"

    task_status = task.get("TaskStatus")
    if task_status not in {"completed", "failed", "scheduled", "inProgress"}:
        raise RetryableCompletionError("Polly returned an unsupported task status.")

    if job.get("status") == "COMPLETED":
        if task_status != "completed":
            LOGGER.warning(
                "completion_status_regression_ignored",
                extra={
                    "request_id": request_id,
                    "message_id": message_id,
                    "task_id": task_id,
                    "job_id": application_job_id,
                },
            )
            return "ignored"
        output_uri = task.get("OutputUri")
        if not isinstance(output_uri, str) or not output_uri:
            raise RetryableCompletionError("Completed Polly task has no output URI.")
        output_key = _output_key_from_uri(output_uri, application_job_id)
        if output_key is None:
            raise RetryableCompletionError("Completed Polly task has invalid output.")
        if job.get("output_key") == output_key:
            return "ignored"
        LOGGER.error(
            "completion_output_key_mismatch",
            extra={
                "request_id": request_id,
                "message_id": message_id,
                "task_id": task_id,
                "job_id": application_job_id,
            },
        )
        raise RetryableCompletionError("Completed job output does not match Polly.")

    if (
        job.get("status") == "FAILED"
        and task_status == "failed"
        and job.get("error_code") == "POLLY_TASK_FAILED"
    ):
        return "ignored"

    if task_status == "completed":
        output_uri = task.get("OutputUri")
        if not isinstance(output_uri, str) or not output_uri:
            raise RetryableCompletionError("Completed Polly task has no output URI.")
        output_key = _output_key_from_uri(output_uri, application_job_id)
        if output_key is None:
            raise RetryableCompletionError("Completed Polly task has invalid output.")
        _update_completed_job(
            table, application_job_id, task, output_uri, output_key
        )
        return "completed"

    if task_status == "failed":
        _update_failed_job(table, application_job_id, task)
        return "failed"

    _update_processing_job(table, application_job_id, task)
    return "processing"


def _transcribe_event_job_name(event: dict[str, Any]) -> str | None:
    detail = event.get("detail")
    if not isinstance(detail, dict):
        return None
    job_name = detail.get("TranscriptionJobName")
    event_status = detail.get("TranscriptionJobStatus")
    if not isinstance(job_name, str) or not job_name.strip():
        return None
    if event_status not in {"COMPLETED", "FAILED"}:
        return None
    return job_name.strip()


def _update_transcribe_completed(
    table: Any, job_id: str, expected_output_key: str
) -> None:
    timestamp = _unix_timestamp()
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=(
            "SET #status = :completed, "
            "transcribe_job_status = :transcribe_job_status, "
            "output_key = :output_key, transcript_key = :transcript_key, "
            "completed_at = :completed_at, updated_at = :updated_at "
            "REMOVE error_code, error_message"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":completed": "COMPLETED",
            ":transcribe_job_status": "COMPLETED",
            ":output_key": expected_output_key,
            ":transcript_key": expected_output_key,
            ":completed_at": timestamp,
            ":updated_at": timestamp,
        },
    )


def _update_transcribe_failed(table: Any, job_id: str) -> None:
    timestamp = _unix_timestamp()
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=(
            "SET #status = :failed, "
            "transcribe_job_status = :transcribe_job_status, "
            "error_code = :error_code, error_message = :error_message, "
            "completed_at = :completed_at, updated_at = :updated_at"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":failed": "FAILED",
            ":transcribe_job_status": "FAILED",
            ":error_code": "TRANSCRIBE_JOB_FAILED",
            ":error_message": (
                "Amazon Transcribe could not complete the transcription job."
            ),
            ":completed_at": timestamp,
            ":updated_at": timestamp,
        },
    )


def _update_transcribe_processing(
    table: Any, job_id: str, authoritative_status: str
) -> None:
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=(
            "SET #status = :processing, "
            "transcribe_job_status = :transcribe_job_status, "
            "updated_at = :updated_at"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":processing": "PROCESSING",
            ":transcribe_job_status": authoritative_status,
            ":updated_at": _unix_timestamp(),
        },
    )


def _process_transcribe_event(
    event: dict[str, Any], request_id: str | None
) -> str:
    job_id = _transcribe_event_job_name(event)
    if job_id is None:
        LOGGER.warning(
            "transcribe_completion_event_ignored",
            extra={"request_id": request_id},
        )
        return "ignored"

    table = _create_jobs_table()
    result = table.get_item(Key={"job_id": job_id}, ConsistentRead=True)
    job = result.get("Item")
    if not isinstance(job, dict):
        raise RetryableCompletionError(
            "The STT application job is not available yet."
        )
    if job.get("type") != "STT":
        LOGGER.warning(
            "transcribe_completion_job_type_mismatch",
            extra={"request_id": request_id, "job_id": job_id},
        )
        return "ignored"

    stored_job_name = job.get("transcribe_job_name")
    if not isinstance(stored_job_name, str) or not stored_job_name:
        raise RetryableCompletionError(
            "The Transcribe job mapping is not available yet."
        )
    if stored_job_name != job_id:
        LOGGER.error(
            "transcribe_completion_job_name_mismatch",
            extra={"request_id": request_id, "job_id": job_id},
        )
        return "ignored"

    response = _create_transcribe_client().get_transcription_job(
        TranscriptionJobName=job_id
    )
    transcription_job = response.get("TranscriptionJob")
    if not isinstance(transcription_job, dict):
        raise RetryableCompletionError(
            "Transcribe job details are unavailable."
        )
    if transcription_job.get("TranscriptionJobName") != job_id:
        raise RetryableCompletionError(
            "Transcribe returned an inconsistent job name."
        )
    authoritative_status = transcription_job.get("TranscriptionJobStatus")
    if authoritative_status not in {
        "COMPLETED",
        "FAILED",
        "QUEUED",
        "IN_PROGRESS",
    }:
        raise RetryableCompletionError(
            "Transcribe returned an unsupported job status."
        )

    expected_output_key = f"output/stt/jobs/{job_id}/transcript.json"
    if job.get("status") == "COMPLETED":
        if (
            job.get("transcribe_job_name") == job_id
            and job.get("transcript_key") == expected_output_key
        ):
            return "ignored"
        raise RetryableCompletionError(
            "Completed STT job output is inconsistent."
        )
    if (
        job.get("status") == "FAILED"
        and authoritative_status == "FAILED"
        and job.get("error_code") == "TRANSCRIBE_JOB_FAILED"
    ):
        return "ignored"

    if authoritative_status == "COMPLETED":
        if job.get("output_key") != expected_output_key:
            raise RetryableCompletionError(
                "Stored STT output key is inconsistent."
            )
        transcript = transcription_job.get("Transcript")
        transcript_uri = (
            transcript.get("TranscriptFileUri")
            if isinstance(transcript, dict)
            else None
        )
        if not isinstance(transcript_uri, str) or not transcript_uri:
            raise RetryableCompletionError(
                "Completed Transcribe job has no transcript URI."
            )
        _update_transcribe_completed(table, job_id, expected_output_key)
        return "completed"

    if authoritative_status == "FAILED":
        _update_transcribe_failed(table, job_id)
        return "failed"

    _update_transcribe_processing(table, job_id, authoritative_status)
    return "processing"


def _summary(outcome: str) -> dict[str, int]:
    result = {
        "processed": 1,
        "completed": 0,
        "failed": 0,
        "processing": 0,
        "ignored": 0,
    }
    result[outcome] += 1
    return result


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, int]:
    """Handle Polly SNS records and Transcribe EventBridge events."""
    records = event.get("Records")
    request_id = getattr(context, "aws_request_id", None)
    if not isinstance(records, list):
        if (
            event.get("source") == "aws.transcribe"
            and event.get("detail-type") == "Transcribe Job State Change"
        ):
            try:
                return _summary(_process_transcribe_event(event, request_id))
            except ClientError as error:
                LOGGER.exception(
                    "transcribe_completion_aws_error",
                    extra={
                        "request_id": request_id,
                        "error_code": _client_error_code(error),
                    },
                )
                raise
            except Exception:
                LOGGER.exception(
                    "transcribe_completion_retryable_error",
                    extra={"request_id": request_id},
                )
                raise
        LOGGER.info(
            "completion_event_ignored",
            extra={"request_id": request_id},
        )
        return _summary("ignored")

    counters = {
        "processed": len(records),
        "completed": 0,
        "failed": 0,
        "processing": 0,
        "ignored": 0,
    }
    retryable_error: Exception | None = None
    for record in records:
        if not isinstance(record, dict):
            counters["ignored"] += 1
            continue
        try:
            outcome = _process_sns_record(record, request_id)
        except ClientError as error:
            LOGGER.exception(
                "completion_record_aws_error",
                extra={
                    "request_id": request_id,
                    "error_code": _client_error_code(error),
                },
            )
            if retryable_error is None:
                retryable_error = error
            continue
        except Exception as error:
            LOGGER.exception(
                "completion_record_retryable_error",
                extra={"request_id": request_id},
            )
            if retryable_error is None:
                retryable_error = error
            continue
        counters[outcome] += 1

    if retryable_error is not None:
        raise retryable_error
    return counters
