from typing import Literal, Optional, List
from pydantic import BaseModel, Field
from datetime import datetime, timezone

Role = Literal["user", "assistant", "system"]

class ImageAttachment(BaseModel):
    mime_type: str = Field(..., description="Image MIME type (image/png, image/jpeg, image/webp)")
    data: str = Field(..., description="Base64 encoded image data or data URI")
    filename: Optional[str] = Field(None, description="Original filename if available")
    size_bytes: Optional[int] = Field(None, description="Image payload size in bytes")

class ChatMessage(BaseModel):
    role: Role
    content: str = Field(..., min_length=1, max_length=50000, description="Message text content")
    attachments: Optional[List[ImageAttachment]] = Field(
        default=None,
        description="Optional visual attachments associated with this turn",
    )
    input_mode: Optional[Literal["text", "voice"]] = Field(
        default="text",
        description="Input modality: 'text' or 'voice'",
    )
    timestamp: Optional[str] = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Conversation history leading up to the current turn",
    )
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="Sampling temperature")
    model: Optional[str] = Field(None, description="Optional override for model identifier")

class ChatResponse(BaseModel):
    message: ChatMessage
    provider: str = Field(..., description="LLM provider that serviced the request")
    model: str = Field(..., description="Model identifier used")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finish_reason: Optional[str] = Field("stop", description="Reason model stopped generating")
