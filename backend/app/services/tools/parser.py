import json
import re
import uuid
from typing import Tuple, Optional, List
from app.models.tools import ToolCall
from app.services.tools.registry import registry

TOOL_REQUEST_REGEX = re.compile(
    r'(?:```(?:json)?\s*)?\{\s*"type"\s*:\s*"tool_request"\s*,\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}(?:\s*```)?',
    re.DOTALL
)

def extract_tool_calls(text: str) -> Tuple[str, Optional[List[ToolCall]], Optional[str]]:
    """
    Inspects LLM text output for structured tool request JSON blocks.
    Validates tool names against ToolRegistry.

    Returns:
        Tuple of (clean_text, tool_calls, finish_reason)
    """
    if not text:
        return text, None, "stop"

    tool_calls: List[ToolCall] = []
    clean_text = text

    matches = list(TOOL_REQUEST_REGEX.finditer(text))
    if not matches:
        # Check if entire text is a JSON object with type=tool_request
        trimmed = text.strip()
        if trimmed.startswith("{") and trimmed.endswith("}"):
            try:
                data = json.loads(trimmed)
                if data.get("type") == "tool_request" and "tool" in data:
                    tool_name = data["tool"]
                    args = data.get("arguments", {})
                    if registry.is_registered(tool_name):
                        call_id = f"call_{uuid.uuid4().hex[:8]}"
                        tool_calls.append(ToolCall(id=call_id, tool=tool_name, arguments=args))
                        return "", tool_calls, "tool_calls"
            except Exception:
                pass
        return text, None, "stop"

    for match in matches:
        tool_name = match.group(1)
        raw_args = match.group(2)
        try:
            args = json.loads(raw_args)
        except Exception:
            args = {}

        if registry.is_registered(tool_name):
            call_id = f"call_{uuid.uuid4().hex[:8]}"
            tool_calls.append(ToolCall(id=call_id, tool=tool_name, arguments=args))
            # Remove the tool JSON from clean text
            clean_text = clean_text.replace(match.group(0), "").strip()

    if tool_calls:
        return clean_text, tool_calls, "tool_calls"

    return text, None, "stop"
