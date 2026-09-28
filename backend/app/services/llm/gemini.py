import httpx
import logging
from typing import List, Optional, Tuple, Dict, Any
from app.models.chat import ChatMessage
from app.core.config import settings
from .base import BaseLLMProvider, LLMConfigError, LLMTimeoutError, LLMProviderError

logger = logging.getLogger(__name__)

class GeminiProvider(BaseLLMProvider):
    """Google Gemini LLM provider implementation."""

    def __init__(self, api_key: Optional[str] = None, default_model: Optional[str] = None):
        super().__init__(
            provider_name="gemini",
            default_model=default_model or settings.GEMINI_MODEL or "gemini-2.5-flash",
        )
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY

    def _convert_messages(self, messages: List[ChatMessage]) -> List[Dict[str, Any]]:
        """Converts ChatMessages into Gemini contents array."""
        contents: List[Dict[str, Any]] = []
        for msg in messages:
            if msg.role == "system":
                # System prompt is passed separately in generationConfig/system_instruction
                continue
            role = "user" if msg.role == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg.content}],
            })
        return contents

    async def generate_response(
        self,
        messages: List[ChatMessage],
        system_instruction: str,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        if not self.api_key or not self.api_key.strip():
            raise LLMConfigError(
                "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file, "
                "or set AI_PROVIDER=mock for offline development/testing.",
                provider=self.provider_name,
            )

        target_model = model or self.default_model
        temp = temperature if temperature is not None else settings.LLM_TEMPERATURE
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={self.api_key}"

        contents = self._convert_messages(messages)
        if not contents:
            raise LLMProviderError("No conversation contents provided to generate response", provider=self.provider_name)

        payload: Dict[str, Any] = {
            "contents": contents,
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "temperature": temp,
                "maxOutputTokens": settings.LLM_MAX_TOKENS,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
                res = await client.post(url, json=payload)

            if res.status_code != 200:
                # Safely parse error without leaking key
                try:
                    err_json = res.json()
                    err_msg = err_json.get("error", {}).get("message", res.text)
                except Exception:
                    err_msg = res.text

                logger.error("Gemini API error status %s: %s", res.status_code, err_msg)
                raise LLMProviderError(
                    f"Gemini API returned error ({res.status_code}): {err_msg}",
                    provider=self.provider_name,
                    status_code=res.status_code,
                )

            data = res.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise LLMProviderError("Gemini returned no response candidates", provider=self.provider_name)

            first_cand = candidates[0]
            parts = first_cand.get("content", {}).get("parts", [])
            if not parts:
                raise LLMProviderError("Gemini response candidate contains no text parts", provider=self.provider_name)

            text_content = "".join([p.get("text", "") for p in parts]).strip()
            finish_reason = first_cand.get("finishReason", "stop")
            return text_content, target_model, finish_reason

        except httpx.TimeoutException as exc:
            logger.error("Gemini request timed out: %s", exc)
            raise LLMTimeoutError(
                f"Gemini API request timed out after {settings.LLM_TIMEOUT_SECONDS}s",
                provider=self.provider_name,
            ) from exc
        except (LLMConfigError, LLMProviderError, LLMTimeoutError):
            raise
        except Exception as exc:
            logger.error("Unexpected Gemini provider exception: %s", exc, exc_info=True)
            raise LLMProviderError(f"Unexpected provider communication error: {str(exc)}", provider=self.provider_name) from exc
