from abc import ABC, abstractmethod
from typing import List, Optional, Tuple
from app.models.chat import ChatMessage

class LLMError(Exception):
    """Base exception for all LLM provider operations."""
    def __init__(self, message: str, provider: str = "unknown"):
        super().__init__(message)
        self.provider = provider
        self.message = message

class LLMConfigError(LLMError):
    """Raised when provider configuration or API keys are missing/invalid."""
    pass

class LLMTimeoutError(LLMError):
    """Raised when a request to the provider times out."""
    pass

class LLMProviderError(LLMError):
    """Raised when the upstream provider returns an error (4xx, 5xx, rate limits)."""
    def __init__(self, message: str, provider: str, status_code: Optional[int] = None):
        super().__init__(message, provider=provider)
        self.status_code = status_code

class BaseLLMProvider(ABC):
    """Abstract Base Class for all VISTA LLM providers."""

    def __init__(self, provider_name: str, default_model: str):
        self.provider_name = provider_name
        self.default_model = default_model

    @abstractmethod
    async def generate_response(
        self,
        messages: List[ChatMessage],
        system_instruction: str,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        """
        Generates an assistant response.

        Returns:
            Tuple of (response_text, model_used, finish_reason)
        """
        pass
