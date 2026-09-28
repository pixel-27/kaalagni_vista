import logging
import time
from typing import Dict, Any, Optional
from app.models.tools import ToolResult, ToolPermissionLevel
from app.services.tools.registry import registry
from app.services.tools.base import ToolPolicyError, ToolExecutionError

logger = logging.getLogger(__name__)

class ToolExecutor:
    """Executes registered tools through policy validation and returns structured ToolResult."""

    @classmethod
    async def execute(
        cls,
        call_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        user_approved: bool = False,
        approval_token: Optional[str] = None,
    ) -> ToolResult:
        start_time = time.monotonic()
        tool = registry.get_tool(tool_name)

        if not tool:
            duration = round(time.monotonic() - start_time, 3)
            logger.warning("Rejected request for unknown tool: '%s' (call_id: %s)", tool_name, call_id)
            return ToolResult(
                call_id=call_id,
                tool=tool_name,
                status="error",
                error=f"Unknown or unregistered tool: '{tool_name}'. Available tools: read_file, search_code, analyze_error, run_test.",
                permission_level="read_only",
                duration_seconds=duration,
            )

        perm_level: ToolPermissionLevel = tool.definition.permission_level

        # Check explicit user confirmation for execution tools
        if perm_level == "execution" and not user_approved:
            duration = round(time.monotonic() - start_time, 3)
            logger.info("Tool execution denied by user: '%s' (call_id: %s)", tool_name, call_id)
            return ToolResult(
                call_id=call_id,
                tool=tool_name,
                status="denied",
                error="Execution denied by user.",
                permission_level=perm_level,
                duration_seconds=duration,
            )

        try:
            output = await tool.execute(
                arguments=arguments,
                user_approved=user_approved,
                call_id=call_id,
                approval_token=approval_token,
            )
            duration = round(time.monotonic() - start_time, 3)
            logger.info("Tool '%s' executed successfully in %.2fs (call_id: %s)", tool_name, duration, call_id)
            return ToolResult(
                call_id=call_id,
                tool=tool_name,
                status="success",
                output=output,
                permission_level=perm_level,
                duration_seconds=duration,
            )
        except ToolPolicyError as exc:
            duration = round(time.monotonic() - start_time, 3)
            logger.warning("Tool '%s' policy violation: %s (call_id: %s)", tool_name, exc, call_id)
            return ToolResult(
                call_id=call_id,
                tool=tool_name,
                status="error",
                error=f"Policy Violation: {str(exc)}",
                permission_level=perm_level,
                duration_seconds=duration,
            )
        except ToolExecutionError as exc:
            duration = round(time.monotonic() - start_time, 3)
            logger.error("Tool '%s' execution error: %s (call_id: %s)", tool_name, exc, call_id)
            return ToolResult(
                call_id=call_id,
                tool=tool_name,
                status="error",
                error=f"Execution Error: {str(exc)}",
                permission_level=perm_level,
                duration_seconds=duration,
            )
        except Exception as exc:
            duration = round(time.monotonic() - start_time, 3)
            logger.exception("Unexpected error executing tool '%s': %s (call_id: %s)", tool_name, exc, call_id)
            return ToolResult(
                call_id=call_id,
                tool=tool_name,
                status="error",
                error=f"Internal Error: An unexpected failure occurred while executing '{tool_name}'.",
                permission_level=perm_level,
                duration_seconds=duration,
            )
