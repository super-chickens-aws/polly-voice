"""Tests that prove every Lambda placeholder imports and returns a valid response."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class LambdaContext:
    """Small Lambda context test double."""

    aws_request_id = "unit-test-request"


def _load_handler(name: str) -> ModuleType:
    module_path = BACKEND_ROOT / "src" / name / "app.py"
    spec = importlib.util.spec_from_file_location(f"{name}_app", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load handler module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_api_placeholder_returns_501() -> None:
    module = _load_handler("api")
    response = module.lambda_handler(
        {"httpMethod": "POST", "resource": "/tts/preview"},
        LambdaContext(),
    )

    assert response["statusCode"] == 501
    assert json.loads(response["body"])["error"]["code"] == "NOT_IMPLEMENTED"


def test_tts_worker_acknowledges_sqs_batch() -> None:
    module = _load_handler("tts_worker")
    response = module.lambda_handler(
        {"Records": [{"messageId": "tts-message"}]},
        LambdaContext(),
    )

    assert response == {"batchItemFailures": []}


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
