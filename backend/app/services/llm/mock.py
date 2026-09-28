from typing import List, Optional, Tuple
from app.models.chat import ChatMessage
from .base import BaseLLMProvider

class MockProvider(BaseLLMProvider):
    """
    Deterministic technical troubleshooting mock provider.
    Used for automated tests, CI, and local development without active API keys.
    """

    def __init__(self, default_model: str = "mock-vista-diagnostics"):
        super().__init__(provider_name="mock", default_model=default_model)

    async def generate_response(
        self,
        messages: List[ChatMessage],
        system_instruction: str,
        temperature: Optional[float] = None,
        model: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        target_model = model or self.default_model

        if not messages:
            return "No input provided. Please share the technical problem or error you are diagnosing.", target_model, "stop"

        last_user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "").lower()
        full_conversation = " ".join([m.content.lower() for m in messages])

        # Scenario 1: FastAPI 500 error multi-turn
        if "keyerror" in full_conversation and ("user_id" in full_conversation or "500" in full_conversation):
            response = (
                "### Root Cause Identified: Unhandled `KeyError: 'user_id'`\n\n"
                "**Confirmed Evidence:**\n"
                "- The server crashed with an unhandled `KeyError: 'user_id'` during request processing.\n"
                "- Direct dictionary indexing (`data['user_id']`) was executed on a dictionary that does not contain that key.\n\n"
                "**Recommended Fixes:**\n\n"
                "1. **Use Pydantic Request Models (Best Practice)**:\n"
                "   Instead of reading raw untyped dicts, parse through a Pydantic schema so FastAPI automatically validates payload fields with a 422 Unprocessable Entity error instead of an internal 500 error:\n\n"
                "   ```python\n"
                "   from pydantic import BaseModel\n"
                "   from typing import Optional\n\n"
                "   class UserRequest(BaseModel):\n"
                "       user_id: str\n"
                "       # or optional: user_id: Optional[str] = None\n\n"
                "   @app.post('/api/endpoint')\n"
                "   async def handle_user(payload: UserRequest):\n"
                "       return {'received_id': payload.user_id}\n"
                "   ```\n\n"
                "2. **Safe Dictionary Retrieval**:\n"
                "   If working with dynamic JSON dictionaries:\n"
                "   ```python\n"
                "   user_id = data.get('user_id')\n"
                "   if not user_id:\n"
                "       raise HTTPException(status_code=400, detail='Missing required user_id parameter')\n"
                "   ```\n\n"
                "Would you like me to inspect your router file or help you structure the Pydantic schema?"
            )
            return response, target_model, "stop"

        elif "500" in last_user_msg or "fastapi" in last_user_msg or "internal server error" in last_user_msg:
            response = (
                "### Diagnostic Assessment: FastAPI HTTP 500 Internal Server Error\n\n"
                "**Analysis:**\n"
                "An HTTP 500 error signifies an unhandled exception thrown in the backend application pipeline before a response could be generated.\n\n"
                "**Common Root Causes in FastAPI:**\n"
                "1. **Uncaught Exception in Endpoint Logic**: A `KeyError`, `AttributeError`, or `TypeError` during data parsing.\n"
                "2. **Database Session / Connection Failure**: An unhandled async SQLAlchemy/ORM transaction rollback or connection timeout.\n"
                "3. **Failed Dependency Injection**: An unhandled exception inside a `Depends(...)` dependency or lifespan context.\n\n"
                "**Immediate Action Steps:**\n"
                "- Check the terminal output where Uvicorn is running to extract the Python traceback.\n"
                "- What specific route/method was invoked when this occurred?\n\n"
                "Please share the exact error traceback or the endpoint handler code, and I will pinpoint the failing line."
            )
            return response, target_model, "stop"

        # Scenario 2: CORS Issues
        elif "cors" in full_conversation or "access-control-allow-origin" in full_conversation:
            response = (
                "### Diagnostic Assessment: CORS Origin / Preflight Policy Violation\n\n"
                "**Analysis:**\n"
                "The browser blocked the client request because the backend did not return the expected `Access-Control-Allow-Origin` header during the HTTP OPTIONS preflight check.\n\n"
                "**Resolution in FastAPI:**\n"
                "Ensure `CORSMiddleware` is configured with the exact origin of your frontend client (e.g. `http://localhost:5173`):\n\n"
                "```python\n"
                "from fastapi import FastAPI\n"
                "from fastapi.middleware.cors import CORSMiddleware\n\n"
                "app = FastAPI()\n\n"
                "origins = [\n"
                "    'http://localhost:5173',\n"
                "    'http://127.0.0.1:5173',\n"
                "]\n\n"
                "app.add_middleware(\n"
                "    CORSMiddleware,\n"
                "    allow_origins=origins,\n"
                "    allow_credentials=True,\n"
                "    allow_methods=['*'],\n"
                "    allow_headers=['*'],\n"
                ")\n"
                "```\n\n"
                "**Verification Step:** Test with curl:\n"
                "```bash\n"
                "curl -I -X OPTIONS http://127.0.0.1:8000/api/endpoint -H 'Origin: http://localhost:5173'\n"
                "```"
            )
            return response, target_model, "stop"

        # Generic technical troubleshooting fallback
        response = (
            f"### Technical Analysis: {messages[-1].content[:60]}...\n\n"
            "**Observation:**\n"
            f"You are asking about: `{messages[-1].content}`.\n\n"
            "**Structured Troubleshooting Approach:**\n"
            "1. **Isolate the Fault Domain**: Determine whether the failure originates in the client request layer, application logic, database, or network boundary.\n"
            "2. **Verify Error Telemetry**: Inspect runtime logs, HTTP status codes, and active stack traces for unambiguous failure signatures.\n"
            "3. **Validate Inputs & Environment**: Confirm configuration variables, request payloads, and dependency versions match expected contracts.\n\n"
            "To help me pinpoint the exact cause, please provide the relevant code snippet, error message, or log output."
        )
        return response, target_model, "stop"
