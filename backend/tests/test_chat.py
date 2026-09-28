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
