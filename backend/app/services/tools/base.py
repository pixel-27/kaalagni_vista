from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from app.models.tools import ToolDefinition

class ToolPolicyError(Exception):
    """Raised when a tool request violates security or workspace policy."""
    pass

class ToolExecutionError(Exception):
    """Raised when a tool encounters an error during execution."""
    pass

class BaseTool(ABC):
    """Abstract Base Class for all VISTA diagnostic tools."""

    @property
    @abstractmethod
    def definition(self) -> ToolDefinition:
        """Returns metadata and parameter specifications for this tool."""
        pass

    @abstractmethod
    async def execute(
        self,
        arguments: Dict[str, Any],
        user_approved: bool = False,
        call_id: Optional[str] = None,
        approval_token: Optional[str] = None,
    ) -> Any:
        """
        Executes the tool with validated arguments.

        Args:
            arguments: Dictionary of input parameters matching tool definition schema.
            user_approved: For execution tools, whether explicit user consent was granted.
            call_id: Unique tool call identifier.
            approval_token: Cryptographic token verifying human approval for execution tools.

        Returns:
            Structured JSON-serializable output.
        """
        pass
