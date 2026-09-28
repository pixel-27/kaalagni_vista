from typing import Literal, Optional, Dict, Any, List
from pydantic import BaseModel, Field

ToolPermissionLevel = Literal["read_only", "execution"]

class ToolParameter(BaseModel):
    name: str
    type: str
    description: str
    required: bool = True
    default: Optional[Any] = None

class ToolDefinition(BaseModel):
    name: str = Field(..., description="Unique identifier of the tool")
    description: str = Field(..., description="Human-readable description of what the tool does")
    permission_level: ToolPermissionLevel = Field(..., description="'read_only' or 'execution'")
    requires_confirmation: bool = Field(default=False, description="Whether explicit user confirmation is mandatory")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="JSON Schema of accepted parameters")

class ToolCall(BaseModel):
    id: str = Field(..., description="Unique identifier for this tool call turn")
    tool: str = Field(..., description="Name of the requested tool")
    arguments: Dict[str, Any] = Field(default_factory=dict, description="Key-value arguments for tool execution")
    approval_token: Optional[str] = Field(default=None, description="Backend approval token for execution tools")

class ToolResult(BaseModel):
    call_id: str = Field(..., description="ID matching the originating ToolCall")
    tool: str = Field(..., description="Name of the executed tool")
    status: Literal["success", "error", "denied"] = Field(..., description="Execution outcome")
    output: Optional[Any] = Field(None, description="Structured result output on success")
    error: Optional[str] = Field(None, description="Structured error message on failure or denial")
    permission_level: ToolPermissionLevel = Field(default="read_only", description="Permission category")
    duration_seconds: Optional[float] = Field(None, description="Execution duration in seconds")

class ToolExecuteRequest(BaseModel):
    call_id: str = Field(..., description="Unique tool call ID")
    tool: str = Field(..., description="Tool name to execute")
    arguments: Dict[str, Any] = Field(default_factory=dict, description="Tool arguments")
    user_approved: bool = Field(default=False, description="Whether the user explicitly approved execution (for execution tools)")
    approval_token: Optional[str] = Field(default=None, description="Cryptographic backend approval token required for execution tools")

class ToolExecuteResponse(BaseModel):
    result: ToolResult
