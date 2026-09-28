import logging
from typing import Optional
from app.core.config import settings
from .base import BaseLLMProvider, LLMConfigError
from .gemini import GeminiProvider
from .openai import OpenAIProvider
from .mock import MockProvider

logger = logging.getLogger(__name__)

def get_llm_provider(provider_name: Optional[str] = None) -> BaseLLMProvider:
    """
    Factory function to retrieve the configured or requested LLM provider instance.

    Supported provider names:
    - 'gemini': Google Gemini API (v1beta / gemini-2.5-flash)
    - 'openai': OpenAI API (v1 / gpt-4o)
    - 'mock': Offline deterministic troubleshooting mock provider
    """
    selected = (provider_name or settings.AI_PROVIDER or "gemini").strip().lower()

    if selected == "gemini":
        return GeminiProvider()
    elif selected == "openai":
        return OpenAIProvider()
    elif selected == "mock":
        return MockProvider()
    else:
        logger.warning("Unrecognized AI provider '%s'. Falling back to mock provider.", selected)
        return MockProvider()
