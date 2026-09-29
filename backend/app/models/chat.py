from typing import Literal, Optional, List
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from app.models.tools import ToolCall, ToolResult

Role = Literal["user", "assistant", "system", "tool"]

class ImageAttachment(BaseModel):
    mime_type: str = Field(..., description="Image MIME type (image/png, image/jpeg, image/webp)")
    data: str = Field(..., description="Base64 encoded image data or data URI")
    filename: Optional[str] = Field(None, description="Original filename if available")
    size_bytes: Optional[int] = Field(None, description="Image payload size in bytes")
    source: Optional[Literal["upload", "screen"]] = Field(
        default="upload",
        description="Source of visual context: 'upload' (attached file/clipboard) or 'screen' (screen capture snapshot)",
    )

class ChatMessage(BaseModel):
    role: Role
    content: str = Field(default="", max_length=50000, description="Message text content")
    attachments: Optional[List[ImageAttachment]] = Field(
        default=None,
        description="Optional visual attachments associated with this turn",
    )
    input_mode: Optional[Literal["text", "voice"]] = Field(
        default="text",
        description="Input modality: 'text' or 'voice'",
    )
    tool_calls: Optional[List[ToolCall]] = Field(
        default=None,
        description="Optional list of controlled tool calls requested by the assistant",
    )
    tool_call_id: Optional[str] = Field(
        default=None,
        description="Referenced tool call ID when role is 'tool'",
    )
    tool_result: Optional[ToolResult] = Field(
        default=None,
        description="Structured tool execution result when role is 'tool'",
    )
    timestamp: Optional[str] = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


from app.services.diagnostic.models import DiagnosticSession

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Conversation history leading up to the current turn",
    )
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="Sampling temperature")
    model: Optional[str] = Field(None, description="Optional override for model identifier")
    challenge_diagnosis: Optional[bool] = Field(
        default=False,
        description="Whether this turn represents a challenge/re-evaluation request for the active diagnosis",
    )
    diagnostic_session: Optional[DiagnosticSession] = Field(
        default=None,
        description="Optional active diagnostic session from previous turns",
    )

class ChatResponse(BaseModel):
    message: ChatMessage
    provider: str = Field(..., description="LLM provider that serviced the request")
    model: str = Field(..., description="Model identifier used")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finish_reason: Optional[str] = Field("stop", description="Reason model stopped generating ('stop' or 'tool_calls')")
    diagnostic_session: Optional[DiagnosticSession] = Field(
        default=None,
        description="Structured Phase 7 diagnostic investigation session",
    )


