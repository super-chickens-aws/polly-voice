"""SQS-driven STT worker placeholder."""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, list[dict[str, str]]]:
    """Acknowledge well-formed SQS records until STT processing is implemented."""
    records = event.get("Records", [])
    request_id = getattr(context, "aws_request_id", None)

    for record in records:
        LOGGER.info(
            "stt_message_received",
            extra={"request_id": request_id, "message_id": record.get("messageId")},
        )

    return {"batchItemFailures": []}
