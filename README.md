# VISTA — Visual Intelligence & Spoken Technical Assistant

> **Problem Statement:** PS-05 — Real-Time Voice & Multimodal Agents  
> **Core Concept:** Voice + Vision + Context + Reasoning + Controlled Action for Technical Troubleshooting

---

## Overview

**VISTA** is an AI technical troubleshooting assistant designed to assist developers and engineers in diagnosing software issues through multimodal interaction. Rather than relying solely on text descriptions, VISTA enables developers to present visual context (screenshots, shared screen viewports, terminal logs, and system error traces) alongside natural dialogue.

---

## Architecture (Phase 1 Foundation)

```
kaalagni/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules for Python, Node, & secrets
├── README.md                 # Project documentation
├── backend/                  # FastAPI Application
│   ├── .venv/                # Isolated Python 3.12 virtual environment
│   ├── requirements.txt      # Backend Python dependencies
│   └── app/
│       ├── __init__.py
│       ├── main.py           # FastAPI server entrypoint & CORS setup
│       ├── core/
│       │   ├── __init__.py
│       │   └── config.py     # Pydantic v2 application configuration
│       └── api/
│           ├── __init__.py
│           └── health.py     # Healthcheck endpoint (/api/health)
└── frontend/                 # React Frontend
    ├── package.json
    ├── vite.config.ts        # Vite dev server & /api reverse proxy
    ├── index.html
    └── src/
        ├── main.tsx
        ├── index.css         # Dark technical design system tokens
        └── App.tsx           # VISTA diagnostic dashboard & layout shell
```

---

## Tech Stack (Current Milestone)

- **Backend:**
  - Python 3.12.14
  - FastAPI 0.141.1
  - Pydantic 2.13.5 & `pydantic-settings`
  - Uvicorn 0.54.0 ASGI server
  - Managed via `uv` toolchain
- **Frontend:**
  - React 19
  - Vite 8.3
  - TypeScript
  - Pure CSS design tokens tailored for dark-mode technical interfaces
- **Version Control:**
  - Git initialized with isolated project history and logical commits

---

## Local Setup

### Prerequisites
- Node.js (v20+ recommended, tested with v24.14.1) & npm
- Python (v3.12+, managed via `uv` or system Python)
- Git

### Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```

Default configuration variables in `.env`:
```env
HOST=127.0.0.1
PORT=8000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
VISTA_ENV=development
LOG_LEVEL=info
```

---

## Running the Application

### 1. Running the FastAPI Backend
From the project root:
```bash
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The backend will be live at `http://127.0.0.1:8000` with Swagger docs available at `http://127.0.0.1:8000/docs`.

### 2. Running the React Frontend
In a separate terminal:
```bash
cd frontend
npm run dev
```
The frontend dev server will be live at `http://127.0.0.1:5173`.

---

## Verification & Health Check

The frontend and backend communication can be tested via:
1. Direct backend health endpoint:
   ```bash
   curl http://127.0.0.1:8000/api/health
   ```
   Returns:
   ```json
   {
     "status": "healthy",
     "project": "VISTA Backend",
     "version": "0.1.0",
     "timestamp": "2026-09-28T...",
     "environment": "development"
   }
   ```
2. Frontend Vite proxy route:
   ```bash
   curl http://127.0.0.1:5173/api/health
   ```
3. Interactive UI:
   Open `http://127.0.0.1:5173` in any modern web browser to view the live health monitor, real-time latency ping, and system status badge.

---

## Known Limitations (Phase 1 Status)
- Voice capture (STT / TTS) is scheduled for Phase 5.
- Vision upload and screen capture are scheduled for Phase 3 and Phase 6.
- Controlled diagnostic tools (read_file, analyze_error, search_code) are scheduled for Phase 7.
- Browser automated subagent verification reported an external Playwright driver CDN resolution error; end-to-end HTTP and proxy communication was verified directly via server telemetry and curl.
