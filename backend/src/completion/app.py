"""Completion event placeholder for Polly SNS and Transcribe EventBridge events."""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, int]:
    """Accept completion notifications and emit structured operational logs."""
    records = event.get("Records")
    event_count = len(records) if isinstance(records, list) else 1
    request_id = getattr(context, "aws_request_id", None)
    event_source = event.get("source", "aws:sns" if records else "unknown")

    LOGGER.info(
        "completion_event_received",
        extra={
            "request_id": request_id,
            "event_source": event_source,
            "event_count": event_count,
        },
    )

    return {"processed": event_count}
