# VISTA — Visual Intelligence & Spoken Technical Assistant

> **Problem Statement:** PS-05 — Real-Time Voice & Multimodal Agents  
> **Core Concept:** Voice + Vision + Context + Reasoning + Controlled Action for Technical Troubleshooting

---

## Overview

**VISTA** is an AI technical troubleshooting assistant designed to assist developers and engineers in diagnosing software issues through multimodal interaction. Rather than behaving as a generic conversational chatbot, VISTA operates as a disciplined, senior-level diagnostic copilot that combines:
- **Root Cause Isolation:** Distinguishes confirmed evidence from working hypotheses.
- **Actionable Remediation:** Delivers concrete code snippets, configuration patches, and verification commands.
- **Multi-Turn Context:** Tracks ongoing technical investigations across multiple prompts and error traces.
- **Pluggable AI Architecture:** Supports multiple LLM backends (Google Gemini, OpenAI, or local deterministic mock for testing) without application lock-in.

---

## Architecture (Phase 2: Text AI Pipeline)

```
kaalagni/
├── .env.example              # Environment variables template
├── .env                      # Local development environment configuration
├── .gitignore                # Git ignore rules for Python, Node, & secrets
├── README.md                 # Project documentation
├── backend/                  # FastAPI Application
│   ├── .venv/                # Isolated Python 3.12 virtual environment
│   ├── pytest.ini            # Pytest configuration
│   ├── requirements.txt      # Backend Python dependencies
│   ├── tests/                # Automated test suite
│   │   ├── test_health.py    # Health & root endpoint tests
│   │   └── test_chat.py      # Chat validation, provider, context, & error tests
│   └── app/
│       ├── __init__.py
│       ├── main.py           # FastAPI entrypoint, CORS setup, & router registration
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py     # Pydantic v2 application settings (AI provider, timeouts)
│       │   └── prompts.py    # VISTA senior troubleshooting system prompt
│       ├── models/
│       │   ├── __init__.py
│       │   └── chat.py       # Pydantic request/response schemas (ChatMessage, ChatRequest, ChatResponse)
│       ├── services/
│       │   ├── __init__.py
│       │   └── llm/          # Pluggable LLM Provider Abstraction
│       │       ├── __init__.py
│       │       ├── base.py    # BaseLLMProvider & custom exceptions
│       │       ├── gemini.py  # Google Gemini API implementation
│       │       ├── openai.py  # OpenAI API implementation
│       │       ├── mock.py    # Deterministic diagnostic mock provider for tests/offline runs
│       │       └── factory.py # Provider factory (get_llm_provider)
│       └── api/
│           ├── __init__.py
│           ├── health.py     # Healthcheck endpoint (GET /api/health)
│           └── chat.py       # Chat conversation endpoint (POST /api/chat)
└── frontend/                 # React Frontend
    ├── package.json
    ├── vite.config.ts        # Vite dev server & /api reverse proxy
    ├── index.html
    └── src/
        ├── types.ts          # TypeScript domain interfaces
        ├── main.tsx
        ├── index.css         # Dark technical design system tokens
        ├── components/
        │   ├── CodeBlock.tsx       # Syntax-styled code container with copy button
        │   └── ChatMessageView.tsx # Markdown dialogue rendering (lists, code, quotes)
        └── App.tsx           # VISTA conversational troubleshooting workspace
```

---

## Tech Stack

- **Backend:**
  - Python 3.12.14 (managed via `uv` toolchain)
  - FastAPI 0.141.1 & Pydantic 2.13.5 (`pydantic-settings`)
  - Uvicorn 0.54.0 ASGI server with hot reloading
  - `httpx` async client for upstream provider calls
  - `pytest` & `pytest-asyncio` test runner
- **Frontend:**
  - React 19 & TypeScript
  - Vite 8.3
  - `react-markdown` for structured technical response formatting
  - Dark-mode technical design system with responsive dock and status telemetry
- **AI Providers Supported:**
  - **Google Gemini** (`gemini-2.5-flash`, `gemini-1.5-flash`, etc.) via Google Generative Language API
  - **OpenAI** (`gpt-4o`, `gpt-4o-mini`, etc.)
  - **Mock Provider** (`mock-vista-diagnostics`) for offline test suites, CI, and local development without API keys

---

## Environment Variables Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `HOST` | Backend server bind address | `127.0.0.1` |
| `PORT` | Backend server port | `8000` |
| `CORS_ORIGINS` | Permitted frontend origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `AI_PROVIDER` | Selected LLM provider (`gemini`, `openai`, or `mock`) | `mock` (or `gemini`) |
| `GEMINI_API_KEY` | API Key from Google AI Studio (required if `AI_PROVIDER=gemini`) | Empty |
| `GEMINI_MODEL` | Gemini model identifier | `gemini-2.5-flash` |
| `OPENAI_API_KEY` | OpenAI API key (required if `AI_PROVIDER=openai`) | Empty |
| `OPENAI_MODEL` | OpenAI model identifier | `gpt-4o` |
| `LLM_TEMPERATURE` | Generation sampling temperature (0.0 to 1.0) | `0.2` |
| `LLM_MAX_TOKENS` | Maximum completion output tokens | `2048` |
| `LLM_TIMEOUT_SECONDS` | Upstream provider timeout in seconds | `30.0` |

---

## Running VISTA Locally

### 1. Launch FastAPI Backend
From the project root:
```bash
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API root: `http://127.0.0.1:8000/`
- Interactive Swagger docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

### 2. Launch React Frontend
In a separate terminal:
```bash
cd frontend
npm run dev
```
Open `http://127.0.0.1:5173/` in your browser.

---

## API Specification

### `POST /api/chat`

Processes a technical troubleshooting dialogue turn.

#### Request Body
```json
{
  "messages": [
    {
      "role": "user",
      "content": "My FastAPI application is returning a 500 error. How can I diagnose it?"
    }
  ],
  "temperature": 0.2
}
```

#### Successful Response (`200 OK`)
```json
{
  "message": {
    "role": "assistant",
    "content": "### Diagnostic Assessment: FastAPI HTTP 500 Internal Server Error\n\n**Analysis:**\nAn HTTP 500 error signifies an unhandled exception thrown in the backend application pipeline...\n\n**Common Root Causes:**\n1. Uncaught Exception in Endpoint Logic\n2. Database Session / Connection Failure\n3. Failed Dependency Injection\n\n**Immediate Action Steps:**\n- Check Uvicorn terminal output to extract the Python traceback.\n- Please share the traceback or endpoint handler code.",
    "timestamp": "2026-09-28T06:54:00.822868+00:00"
  },
  "provider": "mock",
  "model": "mock-vista-diagnostics",
  "timestamp": "2026-09-28T06:54:00.822868+00:00",
  "finish_reason": "stop"
}
```

#### Error Handling Responses
- `400 Bad Request`: Configuration error (e.g., missing API key when provider is active).
- `422 Unprocessable Content`: Empty message list or final message not from `'user'`.
- `502 Bad Gateway`: Upstream AI provider returned an error (rate limits, service degradation).
- `504 Gateway Timeout`: AI provider request timed out.

---

## Automated Test Suite

Run all backend unit and integration tests:
```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -v -p no:cacheprovider
```

### Test Coverage (10/10 Passed)
- `tests/test_health.py`: Validates `/api/health` and root API catalog.
- `tests/test_chat.py::test_chat_validation_empty_messages`: Validates rejection of empty message payloads.
- `tests/test_chat.py::test_chat_validation_last_message_not_user`: Validates final message role constraint.
- `tests/test_chat.py::test_chat_validation_malformed_payload`: Validates schema conformance.
- `tests/test_chat.py::test_chat_success_mock_provider`: Validates successful diagnostic response generation.
- `tests/test_chat.py::test_chat_multi_turn_conversation_context`: Validates contextual follow-up reasoning (`KeyError: 'user_id'`).
- `tests/test_chat.py::test_chat_missing_api_key_handling`: Validates sanitized error return on unconfigured keys without leaking secrets.
- `tests/test_chat.py::test_chat_provider_timeout_handling`: Validates HTTP 504 timeout mapping.
- `tests/test_chat.py::test_chat_provider_upstream_error_handling`: Validates HTTP 502 bad gateway mapping.

---

## Roadmap

- **Phase 1 (Complete):** Foundation, clean repository structure, FastAPI backend, React/Vite frontend, live health monitor.
- **Phase 2 (Complete):** Text AI integration, pluggable LLM provider abstraction, VISTA technical system prompt, multi-turn conversation context, code/markdown rendering, automated test suite.
- **Phase 3 (Next):** Multimodal Vision (screenshot upload, error image understanding, diagram inspection).
- **Phase 4:** Conversation persistence and session management.
- **Phase 5:** Speech-to-Text and Text-to-Speech voice loop.
- **Phase 6:** Browser screen sharing capture.
- **Phase 7:** Controlled diagnostic tools (`analyze_error`, `read_file`, `search_code`, allowlisted `run_test`).
- **Phase 8:** Demo hardening and end-to-end rehearsal.
