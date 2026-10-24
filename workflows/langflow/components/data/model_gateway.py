"""Authenticated, bounded adapter from Langflow to the NestJS model gateway."""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message


class EarningsDeskModelGateway(Component):
    display_name = "Earnings Desk Model Gateway"
    description = "Call the internal, run-scoped model gateway with a bounded task input."
    documentation = "https://docs.langflow.org/components-custom-components"
    icon = "Workflow"
    name = "EarningsDeskModelGateway"

    inputs = [MessageTextInput(name="input_value", display_name="Workflow Request JSON", info="JSON envelope from the Earnings Desk worker.", input_types=["Message"])]
    outputs = [Output(name="gateway_result", display_name="Gateway Result", method="call_gateway")]

    def call_gateway(self) -> Message:
        message = self.input_value
        raw = getattr(message, "text", message)
        if not isinstance(raw, str):
            raise ValueError("Workflow Request JSON must be text")
        if len(raw.encode("utf-8")) > 300_000:
            raise ValueError("Gateway input exceeds 300 KB")
        try:
            envelope = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("Workflow Request JSON must be valid JSON") from exc
        if not isinstance(envelope, dict):
            raise ValueError("Workflow request must be a JSON object")
        task = envelope.get("task")
        if task not in {"section_extractor", "feedback_evaluator"}:
            raise ValueError("Unsupported model gateway task")
        run_id = str(envelope.get("runId", "")).strip()
        if not run_id or len(run_id) > 128:
            raise ValueError("A valid run ID is required")
        bounded_input = envelope.get("input")

        token = os.environ.get("MODEL_GATEWAY_TOKEN", "")
        if not token:
            raise RuntimeError("MODEL_GATEWAY_TOKEN is not configured in Langflow")
        gateway = os.environ.get("MODEL_GATEWAY_URL", "http://api:4000/internal/model").rstrip("/")
        payload = json.dumps({"task": task, "runId": run_id, "input": bounded_input}).encode("utf-8")
        request = Request(
            gateway,
            data=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=130) as response:
                if response.status != 200:
                    raise RuntimeError(f"Model gateway returned HTTP {response.status}")
                response_body = response.read(1_000_001)
                if len(response_body) > 1_000_000:
                    raise RuntimeError("Model gateway response exceeded 1 MB")
                result = json.loads(response_body)
        except HTTPError as exc:
            raise RuntimeError(f"Model gateway rejected request (HTTP {exc.code})") from exc
        except (URLError, TimeoutError) as exc:
            raise RuntimeError("Model gateway is unavailable") from exc
        if not isinstance(result, dict) or "output" not in result:
            raise RuntimeError("Model gateway returned an invalid response")
        self.status = f"Completed {task} for run {run_id}"
        return Message(text=json.dumps(result, separators=(",", ":")))
