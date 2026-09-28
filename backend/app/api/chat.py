import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from app.models.chat import ChatRequest, ChatResponse, ChatMessage, ImageAttachment
from app.services.llm import (
    get_llm_provider,
    LLMConfigError,
    LLMTimeoutError,
    LLMProviderError,
    LLMError,
)
from app.services.vision_validator import sanitize_and_validate_image, ImageValidationError
from app.core.prompts import VISTA_SYSTEM_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def send_chat_message(request: ChatRequest) -> ChatResponse:
    """
    Process a technical troubleshooting conversation turn with VISTA.
    Takes conversation history, validates text and visual inputs, applies VISTA system instructions,
    and returns the assistant's technical diagnostic response.
    """
    if not request.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The messages array cannot be empty.",
        )

    # Validate that the last message is from the user
    last_msg = request.messages[-1]
    if last_msg.role != "user":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The final message in the conversation history must be from the 'user'.",
        )

    # Validate and sanitize all visual attachments in conversation history
    for msg_idx, msg in enumerate(request.messages):
        if msg.attachments:
            cleaned_attachments = []
            for att_idx, att in enumerate(msg.attachments):
                try:
                    norm_mime, clean_data, size_bytes = sanitize_and_validate_image(
                        mime_type=att.mime_type,
                        data=att.data,
                    )
                    cleaned_attachments.append(
                        ImageAttachment(
                            mime_type=norm_mime,
                            data=clean_data,
                            filename=att.filename,
                            size_bytes=size_bytes,
                        )
                    )
                except ImageValidationError as exc:
                    logger.warning("Image validation failed for message %d attachment %d: %s", msg_idx, att_idx, exc)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid image attachment: {str(exc)}",
                    )
            msg.attachments = cleaned_attachments

    provider = get_llm_provider()


    try:
        response_text, model_used, finish_reason = await provider.generate_response(
            messages=request.messages,
            system_instruction=VISTA_SYSTEM_PROMPT,
            temperature=request.temperature,
            model=request.model,
        )

        return ChatResponse(
            message=ChatMessage(
                role="assistant",
                content=response_text,
                timestamp=datetime.now(timezone.utc).isoformat(),
            ),
            provider=provider.provider_name,
            model=model_used,
            timestamp=datetime.now(timezone.utc).isoformat(),
            finish_reason=finish_reason,
        )

    except LLMConfigError as exc:
        logger.warning("LLM configuration error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Configuration Error: {exc.message}",
        )
    except LLMTimeoutError as exc:
        logger.warning("LLM request timeout: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"AI Provider Timeout: {exc.message}",
        )
    except LLMProviderError as exc:
        logger.error("LLM upstream provider error: %s", exc)
        status_code = status.HTTP_502_BAD_GATEWAY
        if exc.status_code == 429:
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
        raise HTTPException(
            status_code=status_code,
            detail=f"AI Provider Error: {exc.message}",
        )
    except LLMError as exc:
        logger.error("General LLM error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI Communication Error: {exc.message}",
        )
    except Exception as exc:
        logger.exception("Unexpected error in chat endpoint: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected internal error occurred while processing the troubleshooting request.",
        )
