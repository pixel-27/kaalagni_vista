from typing import Dict, List, Optional
from app.models.tools import ToolDefinition
from app.services.tools.base import BaseTool
from app.services.tools.implementations import (
    ReadFileTool,
    SearchCodeTool,
    AnalyzeErrorTool,
    RunTestTool,
)

class ToolRegistry:
    """Central registry for all approved VISTA diagnostic tools."""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        self.register(ReadFileTool())
        self.register(SearchCodeTool())
        self.register(AnalyzeErrorTool())
        self.register(RunTestTool())

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.definition.name] = tool

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def list_definitions(self) -> List[ToolDefinition]:
        return [tool.definition for tool in self._tools.values()]

    def is_registered(self, name: str) -> bool:
        return name in self._tools

# Singleton registry instance
registry = ToolRegistry()
