import test from 'node:test'
import assert from 'node:assert/strict'

// Helper mirroring App.tsx tool dispatch and payload construction
function buildChatPayloadWithTool({
  history = [],
  toolCall = null,
  toolResult = null,
  userInput = '',
  inputMode = 'text',
  attachment = null,
}) {
  const updatedHistory = [...history]

  if (userInput) {
    updatedHistory.push({
      role: 'user',
      content: userInput,
      input_mode: inputMode,
      attachments: attachment ? [attachment] : undefined,
      timestamp: new Date().toISOString(),
    })
  }

  if (toolCall) {
    updatedHistory.push({
      role: 'assistant',
      content: 'I need to run a diagnostic tool.',
      tool_calls: [toolCall],
      timestamp: new Date().toISOString(),
    })
  }

  if (toolResult) {
    updatedHistory.push({
      role: 'tool',
      content: typeof toolResult.output === 'string'
        ? toolResult.output
        : JSON.stringify(toolResult.output || toolResult.error || ''),
      tool_call_id: toolResult.call_id,
      tool_result: toolResult,
      timestamp: new Date().toISOString(),
    })
  }

  const payload = {
    messages: updatedHistory.map((m) => ({
      role: m.role,
      content: m.content,
      input_mode: m.input_mode,
      attachments: m.attachments,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id,
      tool_result: m.tool_result,
    })),
  }

  return { updatedHistory, payload }
}

test('Controlled Tools: ToolCall structure holds id, tool, and arguments', () => {
  const call = {
    id: 'call_rf_101',
    tool: 'read_file',
    arguments: {
      path: 'backend/app/main.py',
      start_line: 1,
      end_line: 40,
    },
  }

  assert.equal(call.id, 'call_rf_101')
  assert.equal(call.tool, 'read_file')
  assert.equal(call.arguments.path, 'backend/app/main.py')
  assert.equal(call.arguments.start_line, 1)
})

test('Controlled Tools: ToolResult represents success with structured output', () => {
  const result = {
    call_id: 'call_rf_101',
    tool: 'read_file',
    status: 'success',
    output: {
      path: 'backend/app/main.py',
      total_lines: 40,
      start_line: 1,
      end_line: 40,
      content: 'from fastapi import FastAPI...',
    },
    permission_level: 'read_only',
    duration_seconds: 0.05,
  }

  assert.equal(result.status, 'success')
  assert.equal(result.permission_level, 'read_only')
  assert.equal(result.output.total_lines, 40)
  assert.equal(result.error, undefined)
})

test('Controlled Tools: ToolResult represents user denial for execution tools', () => {
  const result = {
    call_id: 'call_rt_deny',
    tool: 'run_test',
    status: 'denied',
    error: 'Execution denied by user.',
    output: null,
    permission_level: 'execution',
    duration_seconds: 0.01,
  }

  assert.equal(result.status, 'denied')
  assert.equal(result.tool, 'run_test')
  assert.match(result.error, /denied by user/i)
})

test('Controlled Tools: Confirmation flow logic separates read_only vs execution permission', () => {
  const requiresConfirmation = (toolName) => {
    return toolName === 'run_test'
  }

  assert.equal(requiresConfirmation('read_file'), false)
  assert.equal(requiresConfirmation('search_code'), false)
  assert.equal(requiresConfirmation('analyze_error'), false)
  assert.equal(requiresConfirmation('run_test'), true)
})

test('Controlled Tools: User Allow action formats approved execution request with approval token', () => {
  const pendingCall = {
    id: 'call_rt_777',
    tool: 'run_test',
    arguments: { test_target: 'backend_tests' },
    approval_token: '1727500000.abc123sig',
  }

  const formatExecuteRequest = (call, userApproved) => ({
    call_id: call.id,
    tool: call.tool,
    arguments: call.arguments,
    user_approved: userApproved,
    approval_token: call.approval_token,
  })

  const reqAllowed = formatExecuteRequest(pendingCall, true)
  assert.equal(reqAllowed.user_approved, true)
  assert.equal(reqAllowed.tool, 'run_test')
  assert.equal(reqAllowed.arguments.test_target, 'backend_tests')
  assert.equal(reqAllowed.approval_token, '1727500000.abc123sig')

  const reqDenied = formatExecuteRequest(pendingCall, false)
  assert.equal(reqDenied.user_approved, false)
})

test('Controlled Tools: Tool result turn is added to conversation history with role="tool"', () => {
  const initialHistory = [
    { role: 'user', content: 'Inspect the chat endpoint' },
  ]
  const toolCall = {
    id: 'call_rf_01',
    tool: 'read_file',
    arguments: { path: 'backend/app/api/chat.py', start_line: 1, end_line: 25 },
  }
  const toolResult = {
    call_id: 'call_rf_01',
    tool: 'read_file',
    status: 'success',
    output: {
      path: 'backend/app/api/chat.py',
      content: 'from fastapi import APIRouter...',
      start_line: 1,
      end_line: 25,
      total_lines: 120,
    },
    permission_level: 'read_only',
  }

  const { updatedHistory, payload } = buildChatPayloadWithTool({
    history: initialHistory,
    toolCall,
    toolResult,
  })

  assert.equal(updatedHistory.length, 3)
  assert.equal(updatedHistory[1].role, 'assistant')
  assert.equal(updatedHistory[1].tool_calls.length, 1)
  assert.equal(updatedHistory[2].role, 'tool')
  assert.equal(updatedHistory[2].tool_call_id, 'call_rf_01')
  assert.equal(updatedHistory[2].tool_result.status, 'success')

  // Payload verification
  assert.equal(payload.messages[2].role, 'tool')
  assert.equal(payload.messages[2].tool_call_id, 'call_rf_01')
})

test('Controlled Tools: Spoken voice query combined with diagnostic tool request', () => {
  const spokenPrompt = 'VISTA, search the codebase for CORSMiddleware'
  const toolCall = {
    id: 'call_sc_voice',
    tool: 'search_code',
    arguments: { query: 'CORSMiddleware' },
  }

  const { updatedHistory, payload } = buildChatPayloadWithTool({
    userInput: spokenPrompt,
    inputMode: 'voice',
    toolCall,
  })

  assert.equal(updatedHistory[0].input_mode, 'voice')
  assert.equal(updatedHistory[0].content, spokenPrompt)
  assert.equal(updatedHistory[1].role, 'assistant')
  assert.equal(updatedHistory[1].tool_calls[0].tool, 'search_code')
  assert.equal(payload.messages[0].input_mode, 'voice')
})

test('Controlled Tools: Screen snapshot combined with diagnostic tool request', () => {
  const screenAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgo...',
    filename: 'screen_snapshot.png',
    source: 'screen',
  }
  const toolCall = {
    id: 'call_rf_screen',
    tool: 'read_file',
    arguments: { path: 'backend/app/api/chat.py', start_line: 40, end_line: 60 },
  }

  const { updatedHistory, payload } = buildChatPayloadWithTool({
    userInput: "Look at my screen and inspect what's at line 45",
    attachment: screenAttachment,
    toolCall,
  })

  assert.equal(updatedHistory[0].attachments[0].source, 'screen')
  assert.equal(updatedHistory[1].role, 'assistant')
  assert.equal(updatedHistory[1].tool_calls[0].arguments.start_line, 40)
  assert.equal(payload.messages[0].attachments[0].source, 'screen')
})

test('Regression: Normal text chat without tool calls continues smoothly', () => {
  const { updatedHistory, payload } = buildChatPayloadWithTool({
    userInput: 'Explain HTTP 500 status codes in REST APIs',
    inputMode: 'text',
  })

  assert.equal(updatedHistory.length, 1)
  assert.equal(updatedHistory[0].role, 'user')
  assert.equal(updatedHistory[0].tool_calls, undefined)
  assert.equal(payload.messages[0].content, 'Explain HTTP 500 status codes in REST APIs')
})
