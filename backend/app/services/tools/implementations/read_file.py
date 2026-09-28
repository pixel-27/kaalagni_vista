from typing import Dict, Any, Optional
from app.models.tools import ToolDefinition
from app.services.tools.base import BaseTool, ToolPolicyError, ToolExecutionError
from app.services.tools.policy import ToolPolicy

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_LINE_WINDOW = 300
DEFAULT_LINE_WINDOW = 150

class ReadFileTool(BaseTool):
    """Safely inspects lines of a file within the workspace root."""

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="read_file",
            description="Safely inspect lines of source code or configuration within the workspace. Read-only.",
            permission_level="read_only",
            requires_confirmation=False,
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative file path within the project workspace (e.g. 'backend/app/main.py')",
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "Starting line number (1-indexed, inclusive). Defaults to 1.",
                        "default": 1,
                        "minimum": 1,
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "Ending line number (1-indexed, inclusive). Maximum line window is 300 lines.",
                        "minimum": 1,
                    },
                },
                "required": ["path"],
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
        path_str = arguments.get("path")
        if not path_str:
            raise ToolPolicyError("Missing required argument: 'path'.")

        target_file = ToolPolicy.validate_path(path_str, check_exists=True, allow_directory=False)

        # File size check
        file_size = target_file.stat().st_size
        if file_size > MAX_FILE_SIZE_BYTES:
            raise ToolPolicyError(
                f"File '{path_str}' ({file_size / (1024 * 1024):.1f}MB) exceeds the maximum allowed limit of 5MB."
            )

        start_line = int(arguments.get("start_line", 1) or 1)
        if start_line < 1:
            raise ToolPolicyError(f"Invalid start_line ({start_line}); must be >= 1.")

        end_line_arg = arguments.get("end_line")
        end_line: Optional[int] = int(end_line_arg) if end_line_arg is not None else None

        if end_line is not None and end_line < start_line:
            raise ToolPolicyError(f"Invalid line range: end_line ({end_line}) cannot be less than start_line ({start_line}).")

        if end_line is not None and (end_line - start_line + 1) > MAX_LINE_WINDOW:
            raise ToolPolicyError(
                f"Requested line range ({end_line - start_line + 1} lines) exceeds the maximum window of {MAX_LINE_WINDOW} lines."
            )

        try:
            with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
        except Exception as exc:
            raise ToolExecutionError(f"Failed to read file '{path_str}': {str(exc)}")

        total_lines = len(all_lines)
        if total_lines == 0:
            return {
                "path": str(target_file.relative_to(ToolPolicy.get_workspace_root())),
                "total_lines": 0,
                "start_line": 1,
                "end_line": 0,
                "content": "",
            }

        effective_start = min(start_line, total_lines)
        if end_line is not None:
            effective_end = min(end_line, total_lines)
        else:
            effective_end = min(total_lines, effective_start + DEFAULT_LINE_WINDOW - 1)

        selected_lines = all_lines[effective_start - 1 : effective_end]
        raw_content = "".join(selected_lines)
        sanitized_content = ToolPolicy.redact_secrets(raw_content)

        return {
            "path": str(target_file.relative_to(ToolPolicy.get_workspace_root())).replace("\\", "/"),
            "total_lines": total_lines,
            "start_line": effective_start,
            "end_line": effective_end,
            "content": sanitized_content,
        }
