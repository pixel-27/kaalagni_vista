import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch
from app.main import app
from app.services.llm import (
    MockProvider,
    GeminiProvider,
    LLMProviderError,
    LLMTimeoutError,
    LLMConfigError,
)

@pytest.mark.asyncio
async def test_chat_validation_empty_messages():
    """Chat endpoint rejects empty message lists."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/chat", json={"messages": []})
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_chat_validation_last_message_not_user():
    """Chat endpoint rejects requests where the final message is not from user."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "How can I help?"},
                ]
            },
        )
    assert res.status_code == 422
    assert "user" in res.json()["detail"].lower()

@pytest.mark.asyncio
async def test_chat_validation_malformed_payload():
    """Chat endpoint rejects malformed requests lacking required message structure."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/chat", json={"invalid_field": 123})
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_chat_success_mock_provider():
    """Chat endpoint successfully generates responses using the MockProvider."""
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={
                    "messages": [
                        {"role": "user", "content": "My FastAPI app is returning a 500 error."}
                    ]
                },
            )
        assert res.status_code == 200
        data = res.json()
        assert data["provider"] == "mock"
        assert data["message"]["role"] == "assistant"
        assert "500" in data["message"]["content"]
        assert "traceback" in data["message"]["content"].lower()

@pytest.mark.asyncio
async def test_chat_multi_turn_conversation_context():
    """Chat endpoint understands previous conversational turns."""
    history = [
        {"role": "user", "content": "My FastAPI application is returning a 500 error."},
        {"role": "assistant", "content": "Please share the traceback or error details."},
        {"role": "user", "content": "The traceback says KeyError: user_id"},
    ]
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/chat", json={"messages": history})
        assert res.status_code == 200
        data = res.json()
        # Mock provider specifically targets KeyError: user_id in context
        assert "KeyError: 'user_id'" in data["message"]["content"]
        assert "Pydantic" in data["message"]["content"]

@pytest.mark.asyncio
async def test_chat_missing_api_key_handling():
    """Missing API key returns clean HTTP 400 error without leaking internal details."""
    unconfigured_gemini = GeminiProvider(api_key="")
    with patch("app.api.chat.get_llm_provider", return_value=unconfigured_gemini):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={"messages": [{"role": "user", "content": "Why is this failing?"}]},
            )
        assert res.status_code == 400
        data = res.json()
        assert "Configuration Error" in data["detail"]
        assert "GEMINI_API_KEY" in data["detail"]

@pytest.mark.asyncio
async def test_chat_provider_timeout_handling():
    """Provider timeout maps cleanly to HTTP 504 Gateway Timeout."""
    class TimingOutProvider(MockProvider):
        async def generate_response(self, *args, **kwargs):
            raise LLMTimeoutError("Upstream timeout reached", provider="test")

    with patch("app.api.chat.get_llm_provider", return_value=TimingOutProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={"messages": [{"role": "user", "content": "Diagnose my issue"}]},
            )
        assert res.status_code == 504
        assert "Timeout" in res.json()["detail"]

@pytest.mark.asyncio
async def test_chat_provider_upstream_error_handling():
    """Provider errors map cleanly to HTTP 502 Bad Gateway without internal stack traces."""
    class FailingProvider(MockProvider):
        async def generate_response(self, *args, **kwargs):
            raise LLMProviderError("Invalid model parameters", provider="test", status_code=500)

    with patch("app.api.chat.get_llm_provider", return_value=FailingProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={"messages": [{"role": "user", "content": "Help me fix this"}]},
            )
        assert res.status_code == 502
        assert "AI Provider Error" in res.json()["detail"]

# --- Phase 3 Multimodal Tests ---

VALID_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFWM0AAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkKC"
VALID_JPEG_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDH/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/9oACAEBAAA/AL8A/9k="
VALID_WEBP_B64 = "UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAAACIiAgAAAAAAA=="

@pytest.mark.asyncio
async def test_chat_multimodal_png_attachment_accepted():
    """Chat endpoint accepts user messages with a valid PNG screenshot."""
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={
                    "messages": [
                        {
                            "role": "user",
                            "content": "VISTA, look at this error and tell me what's wrong.",
                            "attachments": [
                                {
                                    "mime_type": "image/png",
                                    "data": f"data:image/png;base64,{VALID_PNG_B64}",
                                    "filename": "error_screen.png",
                                }
                            ],
                        }
                    ]
                },
            )
        assert res.status_code == 200
        data = res.json()
        assert data["provider"] == "mock"
        assert "Mock visual analysis received successfully" in data["message"]["content"]

@pytest.mark.asyncio
async def test_chat_multimodal_supported_mime_types():
    """Chat endpoint supports image/png, image/jpeg, and image/webp formats."""
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for mime_type, b64_data in [
                ("image/png", VALID_PNG_B64),
                ("image/jpeg", VALID_JPEG_B64),
                ("image/webp", VALID_WEBP_B64),
            ]:
                res = await client.post(
                    "/api/chat",
                    json={
                        "messages": [
                            {
                                "role": "user",
                                "content": "Analyze this attachment",
                                "attachments": [
                                    {
                                        "mime_type": mime_type,
                                        "data": b64_data,
                                        "filename": f"sample.{mime_type.split('/')[1]}",
                                    }
                                ],
                            }
                        ]
                    },
                )
                assert res.status_code == 200, f"Failed for MIME type: {mime_type}"

@pytest.mark.asyncio
async def test_chat_unsupported_mime_type_rejected():
    """Chat endpoint rejects unsupported image types cleanly with 400 Bad Request."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Look at this GIF",
                        "attachments": [
                            {
                                "mime_type": "image/gif",
                                "data": "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                                "filename": "animation.gif",
                            }
                        ],
                    }
                ]
            },
        )
    assert res.status_code == 400
    assert "Unsupported image MIME type" in res.json()["detail"]

@pytest.mark.asyncio
async def test_chat_oversized_image_rejected():
    """Chat endpoint rejects image payloads exceeding 10MB."""
    import base64
    raw_oversized = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * (11 * 1024 * 1024)
    large_b64 = base64.b64encode(raw_oversized).decode()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Analyze huge screenshot",
                        "attachments": [
                            {
                                "mime_type": "image/png",
                                "data": large_b64,
                                "filename": "giant.png",
                            }
                        ],
                    }
                ]
            },
        )
    assert res.status_code == 400
    assert "exceeds the 10MB limit" in res.json()["detail"]


@pytest.mark.asyncio
async def test_chat_malformed_base64_rejected():
    """Chat endpoint rejects malformed/corrupt base64 string data."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Analyze bad base64",
                        "attachments": [
                            {
                                "mime_type": "image/png",
                                "data": "!!!NOT_VALID_BASE64###",
                                "filename": "bad.png",
                            }
                        ],
                    }
                ]
            },
        )
    assert res.status_code == 400
    assert "Malformed base64" in res.json()["detail"]

@pytest.mark.asyncio
async def test_chat_corrupt_magic_bytes_rejected():
    """Chat endpoint rejects files where declared MIME does not match magic byte signature."""
    import base64
    fake_png = base64.b64encode(b"THIS_IS_NOT_A_PNG_FILE_HEADER").decode()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Check this masquerading file",
                        "attachments": [
                            {
                                "mime_type": "image/png",
                                "data": fake_png,
                                "filename": "fake.png",
                            }
                        ],
                    }
                ]
            },
        )
    assert res.status_code == 400
    assert "Image header does not match" in res.json()["detail"]

@pytest.mark.asyncio
async def test_chat_gemini_multimodal_conversion():
    """Gemini provider formats visual attachments as inlineData parts."""
    from app.models.chat import ChatMessage, ImageAttachment
    gemini = GeminiProvider(api_key="mock_key")
    messages = [
        ChatMessage(
            role="user",
            content="Check traceback",
            attachments=[
                ImageAttachment(
                    mime_type="image/png",
                    data=VALID_PNG_B64,
                    filename="trace.png",
                )
            ],
        )
    ]
    contents = gemini._convert_messages(messages)
    assert len(contents) == 1
    parts = contents[0]["parts"]
    assert len(parts) == 2
    assert "inlineData" in parts[0]
    assert parts[0]["inlineData"]["mimeType"] == "image/png"
    assert parts[0]["inlineData"]["data"] == VALID_PNG_B64
    assert parts[1]["text"] == "Check traceback"

@pytest.mark.asyncio
async def test_chat_openai_multimodal_conversion():
    """OpenAI provider formats visual attachments as image_url content items."""
    from app.services.llm import OpenAIProvider
    from app.models.chat import ChatMessage, ImageAttachment
    openai_provider = OpenAIProvider(api_key="mock_key")
    messages = [
        ChatMessage(
            role="user",
            content="Check traceback",
            attachments=[
                ImageAttachment(
                    mime_type="image/png",
                    data=VALID_PNG_B64,
                    filename="trace.png",
                )
            ],
        )
    ]
    # Verify OpenAI converts to multi-part message content
    with patch("httpx.AsyncClient.post") as mock_post:
        # Mock 200 response
        class MockResponse:
            status_code = 200
            def json(self):
                return {
                    "choices": [
                        {"message": {"content": "OpenAI visual analysis complete"}, "finish_reason": "stop"}
                    ]
                }
        mock_post.return_value = MockResponse()
        res, model, reason = await openai_provider.generate_response(
            messages=messages,
            system_instruction="System instruction",
        )
        assert res == "OpenAI visual analysis complete"
        # Check payload passed to httpx post
        called_kwargs = mock_post.call_args[1]
        sent_messages = called_kwargs["json"]["messages"]
        user_msg = sent_messages[1]
        assert isinstance(user_msg["content"], list)
        assert user_msg["content"][0]["type"] == "text"
        assert user_msg["content"][1]["type"] == "image_url"
        assert "data:image/png;base64," in user_msg["content"][1]["image_url"]["url"]

@pytest.mark.asyncio
async def test_chat_multi_turn_with_image_context():
    """Chat endpoint preserves visual context across multi-turn follow-up queries."""
    history = [
        {
            "role": "user",
            "content": "What is wrong with this API? Look at the KeyError traceback.",
            "attachments": [
                {
                    "mime_type": "image/png",
                    "data": VALID_PNG_B64,
                    "filename": "keyerror_trace.png",
                }
            ],
        },
        {
            "role": "assistant",
            "content": "The traceback indicates a KeyError for user_id during dictionary access.",
        },
        {
            "role": "user",
            "content": "How should I fix it?",
        },
    ]
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/chat", json={"messages": history})
        assert res.status_code == 200
        data = res.json()
        content = data["message"]["content"]
        assert "KeyError: 'user_id'" in content
        assert "Pydantic" in content or "get" in content


@pytest.mark.asyncio
async def test_chat_voice_input_mode_accepted():
    """Chat endpoint accepts user messages submitted via voice input mode."""
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={
                    "messages": [
                        {
                            "role": "user",
                            "content": "What is the recommended pool timeout for asyncpg?",
                            "input_mode": "voice",
                        }
                    ]
                },
            )
        assert res.status_code == 200
        data = res.json()
        assert data["provider"] == "mock"
        assert len(data["message"]["content"]) > 0


@pytest.mark.asyncio
async def test_chat_voice_turn_with_image_attachment():
    """Chat endpoint accepts multimodal spoken query with screenshot attachment."""
    with patch("app.api.chat.get_llm_provider", return_value=MockProvider()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/chat",
                json={
                    "messages": [
                        {
                            "role": "user",
                            "content": "VISTA, look at this error and tell me what is wrong.",
                            "input_mode": "voice",
                            "attachments": [
                                {
                                    "mime_type": "image/png",
                                    "data": VALID_PNG_B64,
                                    "filename": "spoken_error_screen.png",
                                }
                            ],
                        }
                    ]
                },
            )
        assert res.status_code == 200
        data = res.json()
        assert "diagnostic" in data["message"]["content"].lower() or "troubleshooting" in data["message"]["content"].lower()


@pytest.mark.asyncio
async def test_chat_invalid_input_mode_rejected():
    """Chat endpoint rejects unsupported input_mode types."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Diagnose my thoughts",
                        "input_mode": "telepathy",
                    }
                ]
            },
        )
    assert res.status_code == 422


