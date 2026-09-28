import re
from typing import Dict, Any, List, Optional
from app.models.tools import ToolDefinition
from app.services.tools.base import BaseTool

COMMON_CATEGORIES = {
    "keyerror": ("missing_key", "Dictionary indexing failed because the requested key does not exist. Use .get() or validate payload with Pydantic."),
    "attributeerror": ("type_or_attribute", "Object attribute or method does not exist or object is None. Verify object type and nullability."),
    "typeerror": ("type_or_attribute", "Mismatched data types or incorrect argument count provided to function or operator."),
    "modulenotfounderror": ("import_or_module", "Required dependency or module is not installed or incorrectly imported."),
    "importerror": ("import_or_module", "Module was found but specific symbol could not be imported. Check circular imports or naming."),
    "connectionrefusederror": ("network_or_port", "Target host or port rejected the connection. Check if service is running and listening on expected port."),
    "operationalerror": ("database_or_orm", "Database connection or SQL execution failed. Check DB server status and connection pool parameters."),
    "integrityerror": ("database_or_orm", "Database constraint violation (foreign key, unique constraint, or null check)."),
    "syntaxerror": ("syntax_or_compile", "Code contains invalid syntax or indentation errors preventing compilation/execution."),
    "validationerror": ("validation", "Pydantic or schema validation failed on incoming request payload."),
    "httpexception": ("http_error", "Application-level HTTP exception raised by endpoint handler."),
}

class AnalyzeErrorTool(BaseTool):
    """Deterministically parses error text and stack traces into structured telemetry without executing code."""

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="analyze_error",
            description="Deterministically parses an error traceback or log message. Extract error type, file, line, and category. Read-only text analysis.",
            permission_level="read_only",
            requires_confirmation=False,
            parameters={
                "type": "object",
                "properties": {
                    "error_text": {
                        "type": "string",
                        "description": "Raw traceback, error message, or log snippet to analyze",
                    },
                    "context": {
                        "type": "string",
                        "description": "Optional surrounding context (e.g. 'FastAPI startup', 'database query', 'frontend build')",
                        "default": None,
                    },
                },
                "required": ["error_text"],
            },
        )

    async def execute(
        self,
        arguments: Dict[str, Any],
        user_approved: bool = False,
        call_id: Optional[str] = None,
        approval_token: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        raw_error = arguments.get("error_text", "")
        context = arguments.get("context")

        if not raw_error or not raw_error.strip():
            return {
                "error_type": "Unknown",
                "error_message": "",
                "category": "unknown",
                "likely_file": None,
                "likely_line": None,
                "stack_frames": [],
                "summary": "No error text provided for analysis.",
                "suggested_action": "Please provide the complete traceback or console output.",
                "context": context,
            }

        text = raw_error.strip()

        # Parse Python traceback frames: File "path", line 123, in func_name
        py_frame_pattern = re.compile(r'File\s+["\']([^"\']+)["\'],\s+line\s+(\d+)(?:,\s+in\s+(\w+))?')
        # Parse JS/Node stack frames: at func (path:123:45) or at path:123:45
        js_frame_pattern = re.compile(r'at\s+(?:(\S+)\s+\()?([^:()\s]+):(\d+)(?::(\d+))?\)?')

        frames: List[Dict[str, Any]] = []

        for match in py_frame_pattern.finditer(text):
            frames.append({
                "file": match.group(1).replace("\\", "/"),
                "line": int(match.group(2)),
                "function": match.group(3) or "<module>",
            })

        if not frames:
            for match in js_frame_pattern.finditer(text):
                frames.append({
                    "file": match.group(2).replace("\\", "/"),
                    "line": int(match.group(3)),
                    "function": match.group(1) or "<anonymous>",
                })

        # Identify Exception / Error Type
        # Common line pattern: ErrorType: error message (e.g. KeyError: 'user_id')
        err_type_pattern = re.compile(r'(?:^|\n)([A-Z][a-zA-Z0-9_]*(?:Error|Exception|Warning|Fault))(?::\s*(.*))?')
        match_type = None
        for m in err_type_pattern.finditer(text):
            match_type = m  # take the last matched error type (usually root in tracebacks)

        if match_type:
            error_type = match_type.group(1)
            error_message = (match_type.group(2) or "").strip()
        else:
            # Fallback check for HTTP status codes
            http_match = re.search(r'\b(4\d\d|5\d\d)\s+([A-Za-z ]+)\b', text)
            if http_match:
                error_type = f"HTTP_{http_match.group(1)}"
                error_message = http_match.group(2)
            else:
                error_type = "UnspecifiedError"
                error_message = text.splitlines()[-1] if text.splitlines() else text[:80]

        # Determine category and recommendation
        norm_type = error_type.lower()
        category, default_suggestion = COMMON_CATEGORIES.get(
            norm_type,
            ("general_error", "Inspect the traceback stack frames to identify the source of the exception.")
        )

        # Determine likely root cause frame (prefer frames belonging to workspace, ignoring site-packages or node_modules)
        likely_file: Optional[str] = None
        likely_line: Optional[int] = None

        workspace_frames = [
            f for f in frames
            if "site-packages" not in f["file"] and "node_modules" not in f["file"] and "lib/" not in f["file"].lower()
        ]

        if workspace_frames:
            likely_file = workspace_frames[-1]["file"]
            likely_line = workspace_frames[-1]["line"]
        elif frames:
            likely_file = frames[-1]["file"]
            likely_line = frames[-1]["line"]

        summary = f"{error_type}: {error_message}" if error_message else error_type

        return {
            "error_type": error_type,
            "error_message": error_message,
            "category": category,
            "likely_file": likely_file,
            "likely_line": likely_line,
            "stack_frames": frames,
            "summary": summary,
            "suggested_action": default_suggestion,
            "context": context,
        }
