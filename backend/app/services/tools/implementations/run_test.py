import asyncio
import os
import sys
import time
from typing import Dict, Any, List, Optional
from app.models.tools import ToolDefinition
from app.services.tools.base import BaseTool, ToolPolicyError, ToolExecutionError
from app.services.tools.policy import ToolPolicy
from app.core.config import ROOT_DIR

MAX_OUTPUT_CHARS = 4000

def get_allowed_targets() -> Dict[str, Dict[str, Any]]:
    is_win = sys.platform == "win32"
    npm_exec = "npm.cmd" if is_win else "npm"

    return {
        "backend_tests": {
            "name": "Backend Unit & Integration Tests",
            "cmd": [sys.executable, "-m", "pytest", "-k", "not test_run_test", "-v"],
            "cwd": ROOT_DIR / "backend",
            "timeout_seconds": 45.0,
            "description": "Runs backend pytest test suite",
        },
        "frontend_tests": {
            "name": "Frontend Unit Tests",
            "cmd": [npm_exec, "test"],
            "cwd": ROOT_DIR / "frontend",
            "timeout_seconds": 45.0,
            "description": "Runs frontend node:test unit test suite",
        },
        "frontend_build": {
            "name": "Frontend Production Build",
            "cmd": [npm_exec, "run", "build"],
            "cwd": ROOT_DIR / "frontend",
            "timeout_seconds": 60.0,
            "description": "Runs tsc -b and vite build to verify compilation",
        },
    }

class RunTestTool(BaseTool):
    """Safely executes an allowlisted diagnostic project test suite with explicit user confirmation."""

    @property
    def definition(self) -> ToolDefinition:
        allowed = get_allowed_targets()
        return ToolDefinition(
            name="run_test",
            description="Run an allowlisted diagnostic test target (backend_tests, frontend_tests, frontend_build). Requires explicit user confirmation.",
            permission_level="execution",
            requires_confirmation=True,
            parameters={
                "type": "object",
                "properties": {
                    "test_target": {
                        "type": "string",
                        "enum": list(allowed.keys()),
                        "description": "Allowlisted project test target identifier: 'backend_tests', 'frontend_tests', or 'frontend_build'",
                    },
                },
                "required": ["test_target"],
            },
        )

    async def execute(
        self,
        arguments: Dict[str, Any],
        user_approved: bool = False,
        call_id: Optional[str] = None,
        approval_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        ToolPolicy.check_execution_permission(
            call_id=call_id or "",
            tool_name="run_test",
            arguments=arguments,
            permission_level="execution",
            user_approved=user_approved,
            approval_token=approval_token,
        )

        test_target = arguments.get("test_target")
        if not test_target:
            raise ToolPolicyError("Missing required argument: 'test_target'.")

        allowed_targets = get_allowed_targets()
        if test_target not in allowed_targets:
            valid_targets = ", ".join(allowed_targets.keys())
            raise ToolPolicyError(
                f"Unknown or unapproved test target: '{test_target}'. Permitted targets are: {valid_targets}."
            )

        target_cfg = allowed_targets[test_target]
        cmd = target_cfg["cmd"]
        cwd = target_cfg["cwd"]
        timeout_seconds = target_cfg["timeout_seconds"]

        # Ensure cwd exists and is strictly within workspace root
        resolved_cwd = cwd.resolve()
        if not resolved_cwd.is_relative_to(ToolPolicy.get_workspace_root()):
            raise ToolPolicyError("Working directory for test target resolves outside workspace root.")

        # Prepare sanitized environment (strip secret keys)
        safe_env = dict(os.environ)
        for secret_key in [
            "GEMINI_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY",
            "DATABASE_URL", "SECRET_KEY", "JWT_SECRET", "GITHUB_TOKEN"
        ]:
            safe_env.pop(secret_key, None)

        start_time = time.monotonic()
        timed_out = False
        exit_code = -1
        stdout_text = ""
        stderr_text = ""

        try:
            # Strictly NO shell=True. Direct executable invocation with fixed arguments only.
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(resolved_cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=safe_env,
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout_seconds,
                )
                exit_code = process.returncode
                stdout_text = stdout_bytes.decode("utf-8", errors="replace")
                stderr_text = stderr_bytes.decode("utf-8", errors="replace")
            except asyncio.TimeoutError:
                timed_out = True
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass
                stderr_text = f"Execution timed out after {timeout_seconds} seconds."

        except Exception as exc:
            raise ToolExecutionError(f"Failed to execute test target '{test_target}': {str(exc)}")

        duration = round(time.monotonic() - start_time, 2)

        # Output truncation
        if len(stdout_text) > MAX_OUTPUT_CHARS:
            stdout_text = stdout_text[:MAX_OUTPUT_CHARS] + f"\n... [Output truncated to {MAX_OUTPUT_CHARS} characters]"
        if len(stderr_text) > MAX_OUTPUT_CHARS:
            stderr_text = stderr_text[:MAX_OUTPUT_CHARS] + f"\n... [Stderr truncated to {MAX_OUTPUT_CHARS} characters]"

        # Redact secrets from output
        stdout_text = ToolPolicy.redact_secrets(stdout_text)
        stderr_text = ToolPolicy.redact_secrets(stderr_text)

        return {
            "test_target": test_target,
            "target_name": target_cfg["name"],
            "exit_code": exit_code,
            "stdout": stdout_text,
            "stderr": stderr_text,
            "timed_out": timed_out,
            "duration_seconds": duration,
        }
