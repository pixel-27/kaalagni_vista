import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.tools import registry, ToolPolicy, ToolPolicyError, ToolExecutor
from app.models.tools import ToolCall, ToolResult

@pytest.mark.asyncio
async def test_tools_list_endpoint():
    """GET /api/tools returns all 4 registered diagnostic tools with their metadata and permissions."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/tools")
    assert res.status_code == 200
    tools = res.json()
    assert len(tools) == 4
    tool_names = {t["name"] for t in tools}
    assert tool_names == {"read_file", "search_code", "analyze_error", "run_test"}

    # Verify permission levels
    for t in tools:
        if t["name"] == "run_test":
            assert t["permission_level"] == "execution"
            assert t["requires_confirmation"] is True
        else:
            assert t["permission_level"] == "read_only"
            assert t["requires_confirmation"] is False

@pytest.mark.asyncio
async def test_tool_registry_rejects_unknown():
    """ToolRegistry accurately reports registered vs unregistered tools."""
    assert registry.is_registered("read_file") is True
    assert registry.is_registered("run_test") is True
    assert registry.is_registered("arbitrary_shell") is False
    assert registry.is_registered("rm_rf") is False
    assert registry.get_tool("nonexistent") is None

@pytest.mark.asyncio
async def test_read_file_valid_workspace_file():
    """read_file safely reads lines from a valid project file within workspace root."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rf_1",
                "tool": "read_file",
                "arguments": {
                    "path": "backend/app/main.py",
                    "start_line": 1,
                    "end_line": 20,
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "success"
    assert data["tool"] == "read_file"
    assert "FastAPI" in data["output"]["content"]
    assert data["output"]["start_line"] == 1
    assert data["output"]["end_line"] == 20

@pytest.mark.asyncio
async def test_read_file_path_traversal_rejected():
    """read_file strictly rejects path traversal with '..'."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rf_trav",
                "tool": "read_file",
                "arguments": {
                    "path": "../../Windows/System32/drivers/etc/hosts",
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "error"
    assert "Policy Violation" in data["error"]
    assert "Path traversal" in data["error"] or "outside workspace" in data["error"]

@pytest.mark.asyncio
async def test_read_file_secret_env_file_rejected():
    """read_file rejects access to .env and credential files."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rf_sec",
                "tool": "read_file",
                "arguments": {
                    "path": ".env",
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "error"
    assert "sensitive or credential file" in data["error"]

@pytest.mark.asyncio
async def test_read_file_oversized_line_window_rejected():
    """read_file rejects requests asking for more than 300 lines in a single call."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rf_over",
                "tool": "read_file",
                "arguments": {
                    "path": "backend/app/api/chat.py",
                    "start_line": 1,
                    "end_line": 500,
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "error"
    assert "exceeds the maximum window of 300 lines" in data["error"]

@pytest.mark.asyncio
async def test_search_code_valid_query():
    """search_code successfully finds matches using safe Python directory walk."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_sc_1",
                "tool": "search_code",
                "arguments": {
                    "query": "CORSMiddleware",
                    "path": "backend/app",
                    "max_results": 10,
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "success"
    assert data["output"]["total_matches"] >= 1
    assert any("CORSMiddleware" in m["snippet"] for m in data["output"]["matches"])

@pytest.mark.asyncio
async def test_search_code_path_outside_workspace_rejected():
    """search_code rejects path arguments resolving outside workspace."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_sc_esc",
                "tool": "search_code",
                "arguments": {
                    "query": "password",
                    "path": "../../../",
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "error"
    assert "Policy Violation" in data["error"]

@pytest.mark.asyncio
async def test_analyze_error_traceback():
    """analyze_error extracts structured telemetry from raw Python traceback without executing code."""
    sample_trace = (
        'Traceback (most recent call last):\n'
        '  File "backend/app/api/chat.py", line 45, in send_chat_message\n'
        '    user_id = data["user_id"]\n'
        "KeyError: 'user_id'\n"
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_ae_1",
                "tool": "analyze_error",
                "arguments": {
                    "error_text": sample_trace,
                    "context": "FastAPI chat endpoint",
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "success"
    out = data["output"]
    assert out["error_type"] == "KeyError"
    assert out["error_message"] == "'user_id'"
    assert out["category"] == "missing_key"
    assert out["likely_file"] == "backend/app/api/chat.py"
    assert out["likely_line"] == 45
    assert len(out["stack_frames"]) >= 1

@pytest.mark.asyncio
async def test_analyze_error_empty_input():
    """analyze_error handles empty or whitespace input gracefully."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_ae_empty",
                "tool": "analyze_error",
                "arguments": {
                    "error_text": "   ",
                },
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "success"
    assert data["output"]["error_type"] == "Unknown"

@pytest.mark.asyncio
async def test_run_test_without_approval_rejected():
    """run_test strictly rejects direct calls when user_approved is omitted or False, with zero execution."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Case A: user_approved omitted
        res_omitted = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rt_no_approval",
                "tool": "run_test",
                "arguments": {
                    "test_target": "backend_tests",
                },
            },
        )
        assert res_omitted.status_code == 200
        data_omitted = res_omitted.json()["result"]
        assert data_omitted["status"] == "denied"
        assert "denied by user" in data_omitted["error"]

        # Case B: user_approved=False
        res_denied = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rt_deny",
                "tool": "run_test",
                "arguments": {
                    "test_target": "backend_tests",
                },
                "user_approved": False,
            },
        )
        assert res_denied.status_code == 200
        data_denied = res_denied.json()["result"]
        assert data_denied["status"] == "denied"
        assert "denied by user" in data_denied["error"]

@pytest.mark.asyncio
async def test_run_test_missing_or_fabricated_approval_token_rejected():
    """run_test strictly rejects requests with missing or fabricated approval tokens even if user_approved=True."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Case A: user_approved=True but missing approval_token
        res_no_tok = await client.post(
            "/api/tools/execute",
            json={
                "call_id": "call_rt_no_tok",
                "tool": "run_test",
                "arguments": {
                    "test_target": "backend_tests",
                },
                "user_approved": True,
            },
        )
        assert res_no_tok.status_code == 200
        data_no_tok = res_no_tok.json()["result"]
        assert data_no_tok["status"] == "error"
        assert "Missing backend approval token" in data_no_tok["error"]

        # Case B: user_approved=True with fabricated approval token
        for bad_token in ["fabricated_token", "1727500000.badhash", "random_string_xyz"]:
            res_bad_tok = await client.post(
                "/api/tools/execute",
                json={
                    "call_id": "call_rt_bad_tok",
                    "tool": "run_test",
                    "arguments": {
                        "test_target": "backend_tests",
                    },
                    "user_approved": True,
                    "approval_token": bad_token,
                },
            )
            assert res_bad_tok.status_code == 200
            data_bad_tok = res_bad_tok.json()["result"]
            assert data_bad_tok["status"] == "error"
            assert "Invalid, expired, or fabricated approval token" in data_bad_tok["error"]

@pytest.mark.asyncio
async def test_run_test_tampered_arguments_rejected():
    """run_test rejects tokens if arguments were tampered with after issuance."""
    call_id = "call_rt_tamper"
    valid_args = {"test_target": "backend_tests"}
    token = ToolPolicy.generate_approval_token(call_id, "run_test", valid_args)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Client tries to use token for frontend_tests instead
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": call_id,
                "tool": "run_test",
                "arguments": {
                    "test_target": "frontend_tests",
                },
                "user_approved": True,
                "approval_token": token,
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "error"
    assert "Invalid, expired, or fabricated approval token" in data["error"]

@pytest.mark.asyncio
async def test_run_test_token_replay_rejected():
    """run_test enforces single-use tokens; replaying the same token is blocked."""
    call_id = "call_rt_replay"
    args = {"test_target": "backend_tests"}
    token = ToolPolicy.generate_approval_token(call_id, "run_test", args)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First execution succeeds
        res1 = await client.post(
            "/api/tools/execute",
            json={
                "call_id": call_id,
                "tool": "run_test",
                "arguments": args,
                "user_approved": True,
                "approval_token": token,
            },
        )
        assert res1.status_code == 200
        assert res1.json()["result"]["status"] == "success"

        # Replay attempt fails
        res2 = await client.post(
            "/api/tools/execute",
            json={
                "call_id": call_id,
                "tool": "run_test",
                "arguments": args,
                "user_approved": True,
                "approval_token": token,
            },
        )
        assert res2.status_code == 200
        data2 = res2.json()["result"]
        assert data2["status"] == "error"
        assert "Invalid, expired, or fabricated approval token" in data2["error"]

@pytest.mark.asyncio
async def test_run_test_unapproved_target_rejected():
    """run_test strictly rejects arbitrary commands or non-allowlisted targets."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for bad_target in [
            "rm -rf /",
            "powershell Get-Process",
            "python arbitrary.py",
            "malicious_suite",
        ]:
            bad_token = ToolPolicy.generate_approval_token("call_rt_bad", "run_test", {"test_target": bad_target})
            res = await client.post(
                "/api/tools/execute",
                json={
                    "call_id": "call_rt_bad",
                    "tool": "run_test",
                    "arguments": {
                        "test_target": bad_target,
                    },
                    "user_approved": True,
                    "approval_token": bad_token,
                },
            )
            assert res.status_code == 200
            data = res.json()["result"]
            assert data["status"] == "error"
            assert "Unknown or unapproved test target" in data["error"]

@pytest.mark.asyncio
async def test_run_test_allowed_target_executes_with_valid_token():
    """run_test executes approved backend_tests target when user_approved=True and valid approval_token is supplied."""
    call_id = "call_rt_valid_exec"
    args = {"test_target": "backend_tests"}
    token = ToolPolicy.generate_approval_token(call_id, "run_test", args)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/tools/execute",
            json={
                "call_id": call_id,
                "tool": "run_test",
                "arguments": args,
                "user_approved": True,
                "approval_token": token,
            },
        )
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "success"
    out = data["output"]
    assert out["test_target"] == "backend_tests"
    assert out["exit_code"] == 0
    assert "passed" in out["stdout"].lower()
    assert out["timed_out"] is False

@pytest.mark.asyncio
async def test_chat_turn_generates_approval_token_for_execution_tool():
    """Chat endpoint generates a valid approval_token when an execution tool is requested."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Please verify by running tests"}
                ]
            },
        )
    assert res.status_code == 200
    data = res.json()
    tool_calls = data["message"]["tool_calls"]
    assert len(tool_calls) == 1
    tc = tool_calls[0]
    assert tc["tool"] == "run_test"
    assert tc["approval_token"] is not None
    assert "." in tc["approval_token"]
    # Token must verify against ToolPolicy
    assert ToolPolicy.verify_approval_token(
        tc["id"],
        tc["tool"],
        tc["arguments"],
        tc["approval_token"],
    ) is True

@pytest.mark.asyncio
async def test_chat_turn_triggers_read_file_tool_call():
    """Chat endpoint emits tool_calls when user asks to inspect a file."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Please read_file backend/app/api/chat.py to examine the routes",
                    }
                ]
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["finish_reason"] == "tool_calls"
    assert data["message"]["tool_calls"] is not None
    assert len(data["message"]["tool_calls"]) == 1
    call = data["message"]["tool_calls"][0]
    assert call["tool"] == "read_file"
    assert call["arguments"]["path"] == "backend/app/api/chat.py"

@pytest.mark.asyncio
async def test_chat_turn_triggers_run_test_tool_call():
    """Chat endpoint emits tool_calls for run_test when user asks to run backend tests."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Can you run backend tests to verify?",
                    }
                ]
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["finish_reason"] == "tool_calls"
    assert data["message"]["tool_calls"] is not None
    call = data["message"]["tool_calls"][0]
    assert call["tool"] == "run_test"
    assert call["arguments"]["test_target"] == "backend_tests"

@pytest.mark.asyncio
async def test_chat_multi_turn_with_tool_result():
    """Chat endpoint accepts role='tool' message and synthesizes next diagnostic response."""
    history = [
        {
            "role": "user",
            "content": "Please inspect backend/app/api/chat.py",
        },
        {
            "role": "assistant",
            "content": "I need to inspect backend/app/api/chat.py to check the code implementation.",
            "tool_calls": [
                {
                    "id": "call_123",
                    "tool": "read_file",
                    "arguments": {"path": "backend/app/api/chat.py", "start_line": 1, "end_line": 50},
                }
            ],
        },
        {
            "role": "tool",
            "content": "File content read successfully.",
            "tool_call_id": "call_123",
            "tool_result": {
                "call_id": "call_123",
                "tool": "read_file",
                "status": "success",
                "output": {
                    "path": "backend/app/api/chat.py",
                    "start_line": 1,
                    "end_line": 50,
                    "total_lines": 120,
                    "content": "from fastapi import APIRouter...",
                },
            },
        },
    ]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/chat", json={"messages": history})
    assert res.status_code == 200
    data = res.json()
    assert data["finish_reason"] == "stop"
    content = data["message"]["content"]
    assert "Diagnostic Analysis: Inspected `backend/app/api/chat.py`" in content

@pytest.mark.asyncio
async def test_chat_multi_turn_with_denied_tool_result():
    """Chat endpoint gracefully handles tool status='denied' when user rejects execution."""
    history = [
        {
            "role": "user",
            "content": "Verify by running tests",
        },
        {
            "role": "assistant",
            "content": "I recommend running the backend tests.",
            "tool_calls": [
                {
                    "id": "call_test_1",
                    "tool": "run_test",
                    "arguments": {"test_target": "backend_tests"},
                }
            ],
        },
        {
            "role": "tool",
            "content": "Execution denied by user.",
            "tool_call_id": "call_test_1",
            "tool_result": {
                "call_id": "call_test_1",
                "tool": "run_test",
                "status": "denied",
                "error": "Execution denied by user.",
                "output": None,
            },
        },
    ]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/chat", json={"messages": history})
    assert res.status_code == 200
    data = res.json()
    content = data["message"]["content"]
    assert "Tool Execution Canceled" in content
    assert "pytest -v" in content

@pytest.mark.asyncio
async def test_chat_voice_turn_with_tool_result():
    """Spoken voice turn combined with diagnostic tool request functions smoothly."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "VISTA, search the codebase for 'ChatRequest'",
                        "input_mode": "voice",
                    }
                ]
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["finish_reason"] == "tool_calls"
    assert data["message"]["tool_calls"][0]["tool"] == "search_code"

@pytest.mark.asyncio
async def test_chat_screen_snapshot_with_tool_request():
    """Screen snapshot turn combined with diagnostic tool request functions smoothly."""
    valid_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": "Look at my screen and inspect file backend/app/api/chat.py",
                        "attachments": [
                            {
                                "mime_type": "image/png",
                                "data": valid_png_b64,
                                "filename": "screen_snapshot.png",
                                "source": "screen",
                            }
                        ],
                    }
                ]
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["finish_reason"] == "tool_calls"
    assert data["message"]["tool_calls"][0]["tool"] == "read_file"
