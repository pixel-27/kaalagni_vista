from typing import Literal, Optional, List
from pydantic import BaseModel, Field
from datetime import datetime, timezone

Role = Literal["user", "assistant", "system"]

class ChatMessage(BaseModel):
    role: Role
    content: str = Field(..., min_length=1, max_length=50000, description="Message text content")
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
