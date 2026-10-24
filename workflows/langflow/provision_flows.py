#!/usr/bin/env python3
"""Create/update the two Earnings Desk Langflow flows from installed components.

Uses Langflow's documented GET /api/v1/all and POST/PATCH /api/v1/flows
endpoints. The component code itself is loaded from the mounted components
directory; this script never uploads or executes caller-provided Python.
"""

import copy
import json
import os
from pathlib import Path
import secrets
import string
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# Read only the two connection settings from the root .env; never execute shell content.
root_env = Path(__file__).resolve().parents[2] / ".env"
if root_env.is_file():
    for line in root_env.read_text().splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key in {"LANGFLOW_URL", "LANGFLOW_API_KEY"}:
            os.environ.setdefault(key, value.strip().strip("\"'"))

BASE = os.environ.get("LANGFLOW_URL", "http://localhost:7860").rstrip("/") + "/api/v1"
API_KEY = os.environ.get("LANGFLOW_API_KEY", "").strip()


def api(method: str, path: str, body: dict | None = None):
    if not API_KEY:
        raise RuntimeError("Set LANGFLOW_API_KEY to an API key created in Langflow Settings.")
    payload = json.dumps(body).encode() if body is not None else None
    request = Request(
        BASE + path,
        data=payload,
        headers={"x-api-key": API_KEY, "Accept": "application/json", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(32_000_001)
            if len(raw) > 32_000_000:
                raise RuntimeError("Langflow response exceeded 32 MB")
            return json.loads(raw) if raw else None
    except HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", "replace")
        raise RuntimeError(f"Langflow {method} {path} returned HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach Langflow at {BASE}: {exc.reason}") from exc


def component_registry_entry(registry, wanted: str):
    matches = []

    def visit(value, key_hint=""):
        if isinstance(value, dict):
            if value.get("display_name") == wanted:
                matches.append((key_hint or value.get("name") or wanted, value))
            for key, child in value.items():
                visit(child, key if isinstance(child, dict) else key_hint)
        elif isinstance(value, list):
            for child in value:
                visit(child, key_hint)

    visit(registry)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one installed component named {wanted!r}; found {len(matches)}. Check the custom-component mount and Langflow startup logs.")
    component_type, component = matches[0]
    if "node" in component and "template" not in component:
        component = component["node"]
    if not isinstance(component.get("template"), dict) or not isinstance(component.get("outputs"), list):
        raise RuntimeError(f"Langflow component {wanted!r} did not include a usable template and output schema")
    return str(component_type), component


def short_id() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(5))


def port_output(component: dict, name: str) -> dict:
    for output in component["outputs"]:
        if output.get("name") == name:
            return output
    raise RuntimeError(f"Output {name!r} is missing from {component.get('display_name')!r}")


def make_node(component_type: str, component: dict, node_id: str, x: int, y: int) -> dict:
    return {
        "id": node_id,
        "type": "genericNode",
        "position": {"x": x, "y": y},
        "data": {
            "id": node_id,
            "type": component_type,
            "selected_output": component["outputs"][0]["name"],
            "description": component.get("description", ""),
            "display_name": component.get("display_name", component_type),
            "node": copy.deepcopy(component),
        },
        "selected": False,
    }


def handle_text(handle: dict) -> str:
    return json.dumps(handle, ensure_ascii=False).replace('"', "œ")


def edge(source_id: str, source_type: str, output: dict, target_id: str, field_name: str, accepted: list[str]) -> dict:
    source_handle = {
        "dataType": source_type,
        "id": source_id,
        "name": output["name"],
        "output_types": output.get("types", [output.get("selected", "Message")]),
    }
    target_handle = {"fieldName": field_name, "id": target_id, "inputTypes": accepted, "type": "str"}
    source_serialized = handle_text(source_handle)
    target_serialized = handle_text(target_handle)
    compact_source = json.dumps(source_handle, ensure_ascii=False, separators=(",", ":")).replace('"', "œ")
    compact_target = json.dumps(target_handle, ensure_ascii=False, separators=(",", ":")).replace('"', "œ")
    return {
        "animated": False,
        "className": "",
        "data": {"sourceHandle": source_handle, "targetHandle": target_handle},
        "id": f"reactflow__edge-{source_id}{compact_source}-{target_id}{compact_target}",
        "selected": False,
        "source": source_id,
        "sourceHandle": source_serialized,
        "target": target_id,
        "targetHandle": target_serialized,
    }


def build_flow(name: str, description: str, chat_in, gateway, chat_out) -> dict:
    input_type, input_component = chat_in
    gateway_type, gateway_component = gateway
    output_type, output_component = chat_out
    input_id = f"{input_type}-{short_id()}"
    gateway_id = f"{gateway_type}-{short_id()}"
    output_id = f"{output_type}-{short_id()}"
    gateway_input = gateway_component["template"].get("input_value", {})
    chat_output_input = output_component["template"].get("input_value", {})
    gateway_accepted = gateway_input.get("input_types", ["Message"])
    output_accepted = chat_output_input.get("input_types", ["Data", "JSON", "DataFrame", "Table", "Message"])
    return {
        "name": name,
        "description": description,
        "data": {
            "nodes": [
                make_node(input_type, input_component, input_id, 80, 120),
                make_node(gateway_type, gateway_component, gateway_id, 390, 120),
                make_node(output_type, output_component, output_id, 700, 120),
            ],
            "edges": [
                edge(input_id, input_type, port_output(input_component, "message"), gateway_id, "input_value", gateway_accepted),
                edge(gateway_id, gateway_type, port_output(gateway_component, "gateway_result"), output_id, "input_value", output_accepted),
            ],
        },
        "is_component": False,
        "webhook": False,
        "tags": ["earnings-desk", "internal-model-gateway"],
    }


def upsert_flow(flow: dict, existing: list[dict]) -> dict:
    match = next((item for item in existing if item.get("name") == flow["name"]), None)
    if match and match.get("id"):
        return api("PATCH", f"/flows/{match['id']}", flow)
    return api("POST", "/flows/", flow)


def main() -> None:
    registry = api("GET", "/all")
    chat_input = component_registry_entry(registry, "Chat Input")
    gateway = component_registry_entry(registry, "Earnings Desk Model Gateway")
    chat_output = component_registry_entry(registry, "Chat Output")
    existing_response = api("GET", "/flows/")
    existing = existing_response if isinstance(existing_response, list) else existing_response.get("flows", [])
    definitions = [
        build_flow("Earnings Desk Section Extraction", "Run-scoped section extraction through the authenticated Earnings Desk model gateway.", chat_input, gateway, chat_output),
        build_flow("Earnings Desk Feedback Evaluation", "Run-scoped feedback evaluation through the authenticated Earnings Desk model gateway.", chat_input, gateway, chat_output),
    ]
    for definition in definitions:
        result = upsert_flow(definition, existing)
        flow_id = result.get("id") if isinstance(result, dict) else None
        if not flow_id:
            raise RuntimeError(f"Langflow did not return an ID for {definition['name']!r}")
        print(f"{definition['name']}: {flow_id}")
    print("Copy the IDs above into LANGFLOW_EXTRACTION_FLOW_ID and LANGFLOW_FEEDBACK_FLOW_ID, then restart the API/worker.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, TypeError, ValueError) as exc:
        print(f"Flow provisioning failed: {exc}", file=sys.stderr)
        sys.exit(1)
