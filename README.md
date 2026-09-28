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

## Architecture (Phase 6: Controlled Diagnostic Tools)

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
│   ├── tests/                # Automated test suite (50 tests)
│   │   ├── test_health.py    # Health & root endpoint tests
│   │   ├── test_chat.py      # Chat validation, provider, context, & error tests
│   │   └── test_tools.py     # Diagnostic tool registry, policy, sandbox, & execution tests
│   └── app/
│       ├── __init__.py
│       ├── main.py           # FastAPI entrypoint, CORS, & router registration
│       ├── core/
│       │   ├── config.py     # Pydantic v2 application settings (AI provider, timeouts)
│       │   └── prompts.py    # VISTA senior troubleshooting system prompt & tool specs
│       ├── models/
│       │   ├── chat.py       # ChatMessage, ChatRequest, ChatResponse (multimodal + tool calls)
│       │   └── tools.py      # ToolDefinition, ToolCall, ToolResult, ToolExecuteRequest
│       ├── services/
│       │   ├── llm/          # Pluggable LLM Provider Abstraction (Gemini, OpenAI, Mock)
│       │   └── tools/        # Modular Controlled Diagnostic Tool Pipeline
│       │       ├── base.py   # BaseTool, ToolPolicyError, ToolExecutionError
│       │       ├── policy.py # Workspace sandboxing, denylists, secret redaction
│       │       ├── registry.py # Central tool registration catalog
│       │       ├── executor.py # Permission-aware safe tool execution
│       │       ├── parser.py   # Structured tool request extraction
│       │       └── implementations/
│       │           ├── read_file.py     # Line-windowed file inspection
│       │           ├── search_code.py   # Safe Python AST/text filesystem search
│       │           ├── analyze_error.py # Deterministic stack trace & traceback parser
│       │           └── run_test.py      # Hardcoded allowlisted test execution
│       └── api/
│           ├── health.py     # Healthcheck endpoint (GET /api/health)
│           ├── chat.py       # Chat conversation endpoint (POST /api/chat)
│           └── tools.py      # Tool catalog & execution endpoints (GET/POST /api/tools)
└── frontend/                 # React Frontend
    ├── package.json
    ├── vite.config.ts        # Vite dev server & /api reverse proxy
    ├── index.html
    └── src/
        ├── types.ts          # TypeScript domain interfaces (multimodal, voice, tools)
        ├── main.tsx
        ├── index.css         # Dark technical design system tokens & glassmorphism
        ├── services/
        │   ├── chat.ts       # Multimodal chat API client
        │   ├── voice.ts      # Web Speech STT and speech synthesis audio loop
        │   ├── screen.ts     # Screen context capture via getDisplayMedia
        │   └── tools.ts      # Tool execution & catalog API client
        ├── components/
        │   ├── CodeBlock.tsx       # Syntax-styled code container with copy button
        │   └── ChatMessageView.tsx # Dialogue rendering with collapsible tool cards
        └── App.tsx           # Multimodal diagnostic workspace with approval modals
```

---

## Tech Stack

- **Backend:**
  - Python 3.12 (managed via `uv` toolchain)
  - FastAPI 0.141.1 & Pydantic 2.13.5 (`pydantic-settings`)
  - Uvicorn 0.54.0 ASGI server with hot reloading
  - `httpx` async client for upstream provider calls
  - `pytest` & `pytest-asyncio` test runner
- **Frontend:**
  - React 19 & TypeScript
  - Vite 8.3
  - `react-markdown` for structured technical response formatting
  - Web Speech API for voice recognition and speech synthesis
  - `getDisplayMedia` for screen context capture
  - Dark-mode technical design system with responsive dock and status telemetry
- **AI Providers Supported:**
  - **Google Gemini** (`gemini-2.5-flash`, `gemini-1.5-flash`, etc.)
  - **OpenAI** (`gpt-4o`, `gpt-4o-mini`, etc.)
  - **Mock Provider** (`mock-vista-diagnostics`) for offline test suites, CI, and local development without API keys

---

## Controlled Diagnostic Tools (Phase 6)

VISTA operates as a **limited, controlled diagnostic agent**. VISTA can request targeted diagnostic actions, but does not possess general computer access.

### 1. Available Tools

| Tool | Permission Level | Description | Key Arguments |
| :--- | :--- | :--- | :--- |
| `read_file` | `read_only` | Safely inspects a workspace file within a specified line window (max 300 lines). | `path`, `start_line`, `end_line` |
| `search_code` | `read_only` | Searches workspace source code for symbols, errors, or text patterns using safe Python traversal (no shell `grep`/`find`). | `query`, `path`, `max_results` |
| `analyze_error` | `read_only` | Deterministically parses stack traces, error types, likely files, and frames without executing code. | `error_text`, `context` |
| `run_test` | `execution` | Executes a safe, predefined, strictly allowlisted test or build command. | `test_target` (`backend_tests`, `frontend_tests`, `frontend_build`) |

### 2. Tool Permission Model

- **`read_only` Tools:**
  - Tools: `read_file`, `search_code`, `analyze_error`.
  - Operations inspect and parse existing technical data without modifying files or executing arbitrary code.
  - Automatically executed by the client/backend pipeline, with complete transparency rendered in the conversation UI dock.
- **`execution` Tools:**
  - Tool: `run_test`.
  - Invokes an external diagnostic process.
  - **Mandatory User Confirmation:** Execution is blocked until the user explicitly reviews the pending action and clicks **`[Allow & Run Test]`** or **`[Deny]`**.
  - **Backend-Enforced Cryptographic Approval Tokens:** Frontend UI is NOT the sole security boundary. When an execution tool is requested, the backend signs a single-use, timestamped HMAC approval token bound to the specific `call_id`, `tool`, and arguments.
  - Direct API calls without valid approval (`user_approved=False`), without tokens, with fabricated tokens, with tampered arguments, or with replayed tokens are strictly rejected by the backend policy layer before execution.
  - If denied by the user, a structured rejection (`status: "denied"`) is returned to the agent, allowing VISTA to continue conversationally without taking action.

### 3. Security Boundaries & Sandboxing

- **Workspace Sandbox:** All filesystem access is strictly locked to the configured workspace root (`kaalagni`). Path traversal (`../`), absolute paths outside the workspace, and symlink escapes are rejected with `403/Forbidden` tool errors.
- **Secret File Denylist & Redaction:** Files matching sensitive patterns (`.env*`, `*.pem`, `*.key`, `id_rsa`, `*secret*`, credentials, browser profiles) are blocked unconditionally. Potential secrets (API keys, bearer tokens) appearing in readable code are automatically masked with `[REDACTED_SECRET]`.
- **Command Security & Allowlist:** The `run_test` tool accepts *only* predefined target identifiers (`backend_tests`, `frontend_tests`, `frontend_build`). Arbitrary command strings, shell meta-characters, script paths, or package install commands are rejected. Executed via `subprocess.run(shell=False)` with timeout limits (30s) and stdout/stderr truncation caps (8KB).
- **Environment Sanitization:** Upstream environment variables containing sensitive keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, tokens) are stripped before invoking diagnostic test processes.
- **Prompt Injection Defense:** Screen text, screenshots, source files, and stack traces are treated as **untrusted data**. Injection attempts inside files (e.g., `"Ignore instructions..."`) are treated strictly as data payloads and never executed as commands.

### 4. Explicit Scope Boundaries

> [!IMPORTANT]
> **VISTA does NOT have unrestricted computer control.**
> The following capabilities are explicitly out of scope and strictly prohibited:
> - NO arbitrary shell, terminal, PowerShell, or CMD execution.
> - NO arbitrary Python, Node, or script execution.
> - NO file editing, mutation, or creation.
> - NO file deletion.
> - NO package installation (`pip install`, `npm install`).
> - NO mouse control, keyboard control, or OS accessibility automation.
> - NO browser automation or web crawling.
> - NO continuous background screen streaming or recording.
> - NO git commit or git push actions by the agent.

### 5. Example Diagnostic Workflow

```text
User: "My FastAPI endpoint is throwing an error."
  ↓
VISTA (reasons and requests tool):
  tool_request: read_file(path="backend/app/api/chat.py", start_line=1, end_line=60)
  ↓
System validates path sandbox & permissions → Executes read_file
  ↓
Tool Result returned to VISTA with line contents
  ↓
VISTA: "I've reviewed the endpoint logic. Let's verify by running the backend test suite."
  tool_request: run_test(test_target="backend_tests")
  ↓
UI presents User Confirmation Card:
  [VISTA wants to run: Backend Test Suite (pytest)]
  Target: backend_tests | Workspace: kaalagni
  [Allow & Run Test]  [Deny]
  ↓
User clicks [Allow & Run Test]
  ↓
Backend executes allowlisted test subprocess within 30s timeout
  ↓
Tool Result (exit status, summarized stdout/stderr) sent to VISTA
  ↓
VISTA explains test outcomes and provides next recommended diagnostic steps.
```

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
| `AI_PROVIDER` | Selected LLM provider (`gemini`, `openai`, or `mock`) | `mock` |
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
- Tool catalog: `http://127.0.0.1:8000/api/tools`

### 2. Launch React Frontend
In a separate terminal:
```bash
cd frontend
npm run dev
```
Open `http://127.0.0.1:5173/` in your browser.

---

## Running Automated Tests

### Backend Test Suite (Pytest)
Run all 50 backend tests:
```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -v -p no:cacheprovider
```

### Frontend Test Suite (Node / Vitest)
Run all 38 frontend tests:
```bash
cd frontend
npm test
```

### Production Build
Verify TypeScript compilation and asset bundling:
```bash
cd frontend
npm run build
```

---

## Roadmap

- **Phase 1 (Complete):** Foundation, clean repository structure, FastAPI backend, React/Vite frontend, live health monitor.
- **Phase 2 (Complete):** Text AI integration, pluggable LLM provider abstraction, VISTA technical system prompt, multi-turn conversation context.
- **Phase 3 (Complete):** Multimodal Visual Intelligence (screenshot attachment, image reasoning, error visual analysis).
- **Phase 4 (Complete):** Speech-to-Text & Text-to-Speech voice loop with audio indicators.
- **Phase 5 (Complete):** Screen context capture via `getDisplayMedia` with observation-only guarantees.
- **Phase 6 (Complete):** Controlled Diagnostic Tools (`read_file`, `search_code`, `analyze_error`, allowlisted `run_test` with user confirmation).
- **Phase 7 (Next):** Context-aware diagnostics and advanced tool orchestration.

