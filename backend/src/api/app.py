"""REST API placeholder handler for the Polly Voice MVP."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")


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


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Return an explicit placeholder response for every configured API route."""
    method = event.get("httpMethod", "UNKNOWN")
    path = event.get("resource") or event.get("path", "UNKNOWN")
    request_id = getattr(context, "aws_request_id", None)

    LOGGER.info(
        "api_route_not_implemented",
        extra={"request_id": request_id, "http_method": method, "resource_path": path},
    )

    return _response(
        501,
        {
            "error": {
                "code": "NOT_IMPLEMENTED",
                "message": f"{method} {path} is not implemented.",
                "request_id": request_id,
            }
        },
    )
