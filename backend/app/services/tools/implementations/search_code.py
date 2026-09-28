import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.models.tools import ToolDefinition
from app.services.tools.base import BaseTool, ToolPolicyError
from app.services.tools.policy import ToolPolicy, DENIED_DIRECTORIES, DENIED_FILE_PATTERNS
import re

MAX_SEARCH_RESULTS = 50
DEFAULT_SEARCH_RESULTS = 20
MAX_SEARCH_FILE_SIZE = 2 * 1024 * 1024  # 2 MB

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".pdf",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".pyc", ".pyo",
    ".zip", ".tar", ".gz", ".7z", ".mp3", ".mp4", ".wav", ".wasm",
}

IGNORED_SEARCH_DIRS = {
    ".git", ".venv", "node_modules", "dist", "build", "__pycache__",
    ".pytest_cache", ".idea", ".vscode", ".gemini", ".next", "scratch",
}

class SearchCodeTool(BaseTool):
    """Safely searches project source code for a symbol, error text, or keyword using Python."""

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="search_code",
            description="Search project source code files for a string or identifier. Read-only, safe Python search.",
            permission_level="read_only",
            requires_confirmation=False,
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Text pattern or symbol to search for (2-100 characters)",
                        "minLength": 2,
                        "maxLength": 100,
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional subdirectory within the workspace to restrict search (e.g. 'backend/app')",
                        "default": "",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of matching lines to return (1-50, default 20)",
                        "default": 20,
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
                "required": ["query"],
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
        raw_query = arguments.get("query", "")
        if not raw_query or len(raw_query.strip()) < 2:
            raise ToolPolicyError("Search query must be at least 2 characters long.")

        query = raw_query.strip()
        if len(query) > 100:
            raise ToolPolicyError("Search query cannot exceed 100 characters.")

        subpath = (arguments.get("path") or "").strip()
        workspace_root = ToolPolicy.get_workspace_root()

        if subpath:
            search_dir = ToolPolicy.validate_path(subpath, check_exists=True, allow_directory=True)
            if not search_dir.is_dir():
                search_dir = search_dir.parent
        else:
            search_dir = workspace_root

        max_results = min(int(arguments.get("max_results", DEFAULT_SEARCH_RESULTS) or DEFAULT_SEARCH_RESULTS), MAX_SEARCH_RESULTS)
        if max_results < 1:
            max_results = DEFAULT_SEARCH_RESULTS

        matches: List[Dict[str, Any]] = []
        lower_query = query.lower()

        for root, dirs, files in os.walk(search_dir):
            # Prune ignored and protected directories in-place
            dirs[:] = [
                d for d in dirs
                if d not in IGNORED_SEARCH_DIRS and d not in DENIED_DIRECTORIES and not d.startswith(".")
            ]

            for file in files:
                ext = Path(file).suffix.lower()
                if ext in BINARY_EXTENSIONS:
                    continue

                # Check secret filename denylist
                is_denied = False
                for pattern in DENIED_FILE_PATTERNS:
                    if re.match(pattern, file.lower(), re.IGNORECASE):
                        is_denied = True
                        break
                if is_denied:
                    continue

                file_path = Path(root) / file
                try:
                    if file_path.stat().st_size > MAX_SEARCH_FILE_SIZE:
                        continue

                    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                        for line_num, line in enumerate(f, start=1):
                            if lower_query in line.lower():
                                snippet = line.strip()
                                if len(snippet) > 200:
                                    snippet = snippet[:197] + "..."
                                snippet = ToolPolicy.redact_secrets(snippet)

                                rel_file = str(file_path.relative_to(workspace_root)).replace("\\", "/")
                                matches.append({
                                    "file": rel_file,
                                    "line_number": line_num,
                                    "snippet": snippet,
                                })

                                if len(matches) >= max_results:
                                    break
                except Exception:
                    continue

                if len(matches) >= max_results:
                    break

            if len(matches) >= max_results:
                break

        rel_search_path = str(search_dir.relative_to(workspace_root)).replace("\\", "/") if search_dir != workspace_root else "."

        return {
            "query": query,
            "search_path": rel_search_path,
            "total_matches": len(matches),
            "matches": matches,
        }
