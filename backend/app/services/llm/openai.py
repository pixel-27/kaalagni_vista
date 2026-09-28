import httpx
import logging
from typing import List, Optional, Tuple, Dict, Any
from app.models.chat import ChatMessage
from app.core.config import settings
from .base import BaseLLMProvider, LLMConfigError, LLMTimeoutError, LLMProviderError

logger = logging.getLogger(__name__)

class OpenAIProvider(BaseLLMProvider):
    """OpenAI API provider implementation."""

    def __init__(self, api_key: Optional[str] = None, default_model: Optional[str] = None):
        super().__init__(
            provider_name="openai",
            default_model=default_model or settings.OPENAI_MODEL or "gpt-4o",
        )
        self.api_key = api_key if api_key is not None else settings.OPENAI_API_KEY

    async def generate_response(
        self,
        messages: List[ChatMessage],
        system_instruction: str,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        if not self.api_key or not self.api_key.strip():
            raise LLMConfigError(
                "OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file, "
                "or set AI_PROVIDER=mock for offline development/testing.",
                provider=self.provider_name,
            )

        target_model = model or self.default_model
        temp = temperature if temperature is not None else settings.LLM_TEMPERATURE
        url = "https://api.openai.com/v1/chat/completions"

        api_messages: List[Dict[str, Any]] = [{"role": "system", "content": system_instruction}]
        for m in messages:
            if not m.attachments:
                api_messages.append({"role": m.role, "content": m.content})
            else:
                parts: List[Dict[str, Any]] = [{"type": "text", "text": m.content}]
                for att in m.attachments:
                    data_url = f"data:{att.mime_type};base64,{att.data}"
                    parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": data_url,
                            "detail": "auto",
                        },
                    })
                api_messages.append({"role": m.role, "content": parts})


        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": api_messages,
            "temperature": temp,
            "max_tokens": settings.LLM_MAX_TOKENS,
        }

        try:
            async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
                res = await client.post(url, json=payload, headers=headers)

            if res.status_code != 200:
                try:
                    err_json = res.json()
                    err_msg = err_json.get("error", {}).get("message", res.text)
                except Exception:
                    err_msg = res.text
                logger.error("OpenAI API error status %s: %s", res.status_code, err_msg)
                raise LLMProviderError(
                    f"OpenAI API returned error ({res.status_code}): {err_msg}",
                    provider=self.provider_name,
                    status_code=res.status_code,
                )

            data = res.json()
            choices = data.get("choices", [])
            if not choices:
                raise LLMProviderError("OpenAI returned no completion choices", provider=self.provider_name)

            first_choice = choices[0]
            text_content = first_choice.get("message", {}).get("content", "").strip()
            finish_reason = first_choice.get("finish_reason", "stop")
            return text_content, target_model, finish_reason

        except httpx.TimeoutException as exc:
            logger.error("OpenAI request timed out: %s", exc)
            raise LLMTimeoutError(
                f"OpenAI API request timed out after {settings.LLM_TIMEOUT_SECONDS}s",
                provider=self.provider_name,
            ) from exc
        except (LLMConfigError, LLMProviderError, LLMTimeoutError):
            raise
        except Exception as exc:
            logger.error("Unexpected OpenAI provider exception: %s", exc, exc_info=True)
            raise LLMProviderError(f"Unexpected provider communication error: {str(exc)}", provider=self.provider_name) from exc
