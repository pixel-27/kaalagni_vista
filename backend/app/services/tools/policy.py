import hashlib
import hmac
import json
import re
import secrets
import time
from pathlib import Path
from typing import Union, Dict, Any, Optional, Set
from app.core.config import ROOT_DIR
from .base import ToolPolicyError

# Backend-generated cryptographic secret for approval tokens (in-memory, rotated per process)
_APPROVAL_SECRET: bytes = secrets.token_bytes(32)
_CONSUMED_TOKENS: Set[str] = set()

# Denied filename patterns
DENIED_FILE_PATTERNS = [
    r"^\.env(\..+)?$",                    # .env, .env.local, .env.production
    r"^.*\.(pem|key|id_rsa|pfx|p12|crt)$", # Certificates and private keys
    r"^(id_rsa|id_ed25519|id_ecdsa)$",    # SSH private keys
    r"^.*(secret|credential|private_key).*$", # Secret token files
    r"^(credentials|service_account)\.json$",
]

# Denied directory names
DENIED_DIRECTORIES = {
    ".git",
    ".ssh",
    ".aws",
    ".azure",
    ".kube",
    ".gnupg",
}

# Secret pattern regexes for redaction
REDACTION_PATTERNS = [
    (re.compile(r"AIza[0-9A-Za-z-_]{35}"), "[REDACTED_GEMINI_KEY]"),
    (re.compile(r"sk-[a-zA-Z0-9T3BlbkFJ]{20,}"), "[REDACTED_OPENAI_KEY]"),
    (re.compile(r"gh[pousr]_[0-9a-zA-Z]{36}"), "[REDACTED_GITHUB_TOKEN]"),
    (
        re.compile(r"(?i)(api[_-]?key|secret|password|access[_-]?token|private[_-]?key)\s*[:=]\s*['\"]([^'\"]{4,})['\"]"),
        r'\1="[REDACTED_SECRET]"',
    ),
]

class ToolPolicy:
    """Enforces strict security, sandboxing, and permission rules for diagnostic tools."""

    @classmethod
    def get_workspace_root(cls) -> Path:
        """Returns the canonical workspace root directory."""
        return ROOT_DIR.resolve()

    @classmethod
    def validate_path(
        cls,
        path_str: str,
        workspace_root: Union[Path, None] = None,
        check_exists: bool = True,
        allow_directory: bool = False,
    ) -> Path:
        """
        Validates that a path is safe, inside the workspace, and not in the sensitive denylist.

        Raises:
            ToolPolicyError: If path violates any sandbox or security boundary.
        """
        if not path_str or not path_str.strip():
            raise ToolPolicyError("File path cannot be empty.")

        root = (workspace_root or cls.get_workspace_root()).resolve()
        raw_path = path_str.strip()

        # Reject obvious path traversal patterns early
        if ".." in raw_path.replace("\\", "/").split("/"):
            raise ToolPolicyError(f"Path traversal ('..') is strictly prohibited: '{path_str}'.")

        # Resolve path
        target_path = Path(raw_path)
        if not target_path.is_absolute():
            resolved = (root / target_path).resolve()
        else:
            resolved = target_path.resolve()

        # Ensure path stays strictly inside workspace root
        try:
            resolved.relative_to(root)
        except ValueError:
            raise ToolPolicyError(
                f"Access denied: Path '{path_str}' resolves outside workspace root ('{root}')."
            )

        # Check path components against denied directory names
        for part in resolved.parts:
            if part in DENIED_DIRECTORIES:
                raise ToolPolicyError(
                    f"Access denied: Access to protected directory '{part}' is prohibited."
                )

        # Check filename against denied patterns
        filename = resolved.name.lower()
        for pattern in DENIED_FILE_PATTERNS:
            if re.match(pattern, filename, re.IGNORECASE):
                raise ToolPolicyError(
                    f"Access denied: Access to sensitive or credential file '{resolved.name}' is prohibited."
                )

        # Existence checks if requested
        if check_exists and not resolved.exists():
            raise ToolPolicyError(f"File not found: '{path_str}'.")

        if check_exists and not allow_directory and resolved.is_dir():
            raise ToolPolicyError(f"Target path is a directory, not a file: '{path_str}'.")

        return resolved

    @classmethod
    def redact_secrets(cls, text: str) -> str:
        """Redacts sensitive credentials and tokens from text output."""
        if not text:
            return ""

        redacted = text
        for pattern, replacement in REDACTION_PATTERNS:
            redacted = pattern.sub(replacement, redacted)

        return redacted

    @classmethod
    def generate_approval_token(cls, call_id: str, tool_name: str, arguments: Dict[str, Any]) -> str:
        """
        Generates a cryptographically signed, timestamped approval token for an execution tool call.
        """
        timestamp = int(time.time())
        canonical_args = json.dumps(arguments, sort_keys=True, separators=(",", ":"))
        payload = f"{call_id}:{tool_name}:{canonical_args}:{timestamp}"
        signature = hmac.new(_APPROVAL_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"{timestamp}.{signature}"

    @classmethod
    def verify_approval_token(
        cls,
        call_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        token: Optional[str],
        max_age_seconds: int = 900,
    ) -> bool:
        """
        Validates an approval token:
        1. Must be non-empty string in format: timestamp.signature
        2. Must not be expired (within max_age_seconds, default 15 min)
        3. Must not be replayed (single-use)
        4. Cryptographic HMAC must match call_id, tool_name, arguments, and timestamp.
        """
        if not token or not isinstance(token, str) or "." not in token:
            return False

        parts = token.split(".", 1)
        if len(parts) != 2:
            return False

        try:
            timestamp = int(parts[0])
            signature = parts[1]
        except ValueError:
            return False

        now = int(time.time())
        # Check expiration and future clock skew
        if (now - timestamp) > max_age_seconds or timestamp > (now + 60):
            return False

        token_key = f"{call_id}:{token}"
        if token_key in _CONSUMED_TOKENS:
            return False

        canonical_args = json.dumps(arguments, sort_keys=True, separators=(",", ":"))
        payload = f"{call_id}:{tool_name}:{canonical_args}:{timestamp}"
        expected_sig = hmac.new(_APPROVAL_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(signature, expected_sig):
            return False

        # Mark single-use token consumed
        _CONSUMED_TOKENS.add(token_key)
        return True

    @classmethod
    def check_execution_permission(
        cls,
        call_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        permission_level: str,
        user_approved: bool,
        approval_token: Optional[str] = None,
    ) -> None:
        """
        Validates user permission level for tool execution.

        Raises:
            ToolPolicyError: If execution permission is required but not granted or token is missing/invalid.
        """
        if permission_level == "execution":
            if not user_approved:
                raise ToolPolicyError(
                    f"Execution permission denied: Tool '{tool_name}' requires explicit user confirmation before running."
                )
            if not approval_token:
                raise ToolPolicyError(
                    f"Execution permission denied: Missing backend approval token for '{tool_name}'."
                )
            if not cls.verify_approval_token(call_id, tool_name, arguments, approval_token):
                raise ToolPolicyError(
                    f"Execution permission denied: Invalid, expired, or fabricated approval token for '{tool_name}'."
                )
