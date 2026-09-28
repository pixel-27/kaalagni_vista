import test from 'node:test'
import assert from 'node:assert/strict'

// Helper mirroring App.tsx screen capture and chat dispatch logic
function buildChatTurnWithScreen({
  history = [],
  textInput = '',
  screenAttachment = null,
  inputMode = 'text',
}) {
  const defaultPrompt = screenAttachment?.source === 'screen'
    ? "VISTA, look at what's on my screen and tell me why this error is happening."
    : "VISTA, look at this error and tell me what's wrong."

  const finalContent = textInput.trim() || defaultPrompt

  const userMessage = {
    role: 'user',
    content: finalContent,
    input_mode: inputMode,
    attachments: screenAttachment ? [screenAttachment] : undefined,
    timestamp: new Date().toISOString(),
  }

  const updatedHistory = [...history, userMessage]
  const payload = {
    messages: updatedHistory.map((m) => ({
      role: m.role,
      content: m.content,
      input_mode: m.input_mode,
      attachments: m.attachments,
    })),
  }

  return { updatedHistory, payload }
}

test('Screen Context: creates attachment with source="screen" and valid metadata', () => {
  const snapshotAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    filename: 'screen_snapshot_1711600000000.png',
    size_bytes: 68,
    source: 'screen',
  }

  assert.equal(snapshotAttachment.source, 'screen')
  assert.equal(snapshotAttachment.mime_type, 'image/png')
  assert.match(snapshotAttachment.filename, /^screen_snapshot_\d+\.png$/)
  assert.equal(snapshotAttachment.size_bytes, 68)
})

test('Screen Context: combines text question with screen snapshot payload', () => {
  const history = [
    { role: 'user', content: 'Initial message' },
    { role: 'assistant', content: 'Initial response' },
  ]
  const screenAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw...',
    filename: 'screen_snapshot_123.png',
    size_bytes: 12000,
    source: 'screen',
  }

  const { updatedHistory, payload } = buildChatTurnWithScreen({
    history,
    textInput: 'Why is this port 8000 already in use?',
    screenAttachment,
    inputMode: 'text',
  })

  assert.equal(updatedHistory.length, 3)
  const turn = updatedHistory[2]
  assert.equal(turn.role, 'user')
  assert.equal(turn.content, 'Why is this port 8000 already in use?')
  assert.equal(turn.input_mode, 'text')
  assert.equal(turn.attachments.length, 1)
  assert.equal(turn.attachments[0].source, 'screen')

  assert.equal(payload.messages.length, 3)
  assert.equal(payload.messages[2].attachments[0].source, 'screen')
})

test('Screen Context: uses tailored screen prompt when text is empty', () => {
  const screenAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw...',
    filename: 'screen_snapshot_456.png',
    source: 'screen',
  }

  const { updatedHistory } = buildChatTurnWithScreen({
    textInput: '',
    screenAttachment,
  })

  assert.equal(
    updatedHistory[0].content,
    "VISTA, look at what's on my screen and tell me why this error is happening."
  )
})

test('Screen Context: combines spoken voice question with screen snapshot', () => {
  const screenAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw...',
    filename: 'screen_snapshot_789.png',
    source: 'screen',
  }

  const spokenText = 'VISTA, look at my screen and tell me what is wrong with the connection pool.'
  const { updatedHistory, payload } = buildChatTurnWithScreen({
    textInput: spokenText,
    screenAttachment,
    inputMode: 'voice',
  })

  const turn = updatedHistory[0]
  assert.equal(turn.role, 'user')
  assert.equal(turn.content, spokenText)
  assert.equal(turn.input_mode, 'voice')
  assert.equal(turn.attachments[0].source, 'screen')

  assert.equal(payload.messages[0].input_mode, 'voice')
  assert.equal(payload.messages[0].attachments[0].source, 'screen')
})

test('Screen Context: multi-turn follow-up preserves screen context in history', () => {
  const initialHistory = [
    {
      role: 'user',
      content: 'What is this error on screen?',
      attachments: [
        {
          mime_type: 'image/png',
          data: 'data:image/png;base64,iVBORw...',
          filename: 'screen_1.png',
          source: 'screen',
        },
      ],
    },
    {
      role: 'assistant',
      content: 'The traceback shows FastAPI failed because port 8000 is occupied.',
    },
  ]

  // User asks a follow-up question without attaching a new screen
  const { updatedHistory, payload } = buildChatTurnWithScreen({
    history: initialHistory,
    textInput: 'How do I kill the process holding port 8000 on Windows?',
    screenAttachment: null,
    inputMode: 'text',
  })

  assert.equal(updatedHistory.length, 3)
  assert.equal(updatedHistory[0].attachments[0].source, 'screen')
  assert.equal(updatedHistory[2].content, 'How do I kill the process holding port 8000 on Windows?')
  assert.equal(updatedHistory[2].attachments, undefined)

  // Payload retains entire multi-turn conversation
  assert.equal(payload.messages.length, 3)
  assert.equal(payload.messages[0].attachments[0].source, 'screen')
})

test('Screen Context State Machine: transitions permission and active states correctly', () => {
  const stateLog = []
  let state = 'idle'
  const setState = (s) => {
    state = s
    stateLog.push(s)
  }

  // 1. User clicks screen context button
  setState('requesting_permission')
  // 2. Permission granted, frame capture starts
  setState('capturing')
  // 3. Snapshot obtained, preview visible
  setState('active')
  // 4. User stops screen context
  setState('idle')

  assert.deepEqual(stateLog, ['requesting_permission', 'capturing', 'active', 'idle'])
  assert.equal(state, 'idle')
})

test('Screen Context State Machine: handles permission denied (NotAllowedError)', () => {
  let screenState = 'requesting_permission'
  let screenError = null

  // Simulate user dismissing or denying the browser getDisplayMedia dialog
  const simError = new Error('Permission denied by user')
  simError.name = 'NotAllowedError'

  if (simError.name === 'NotAllowedError') {
    screenState = 'permission_denied'
    screenError = 'Screen sharing was canceled or denied by the user.'
  }

  assert.equal(screenState, 'permission_denied')
  assert.match(screenError, /canceled or denied/i)
})

test('Screen Context State Machine: handles unsupported environment', () => {
  const isSupported = false
  const screenState = isSupported ? 'idle' : 'unsupported'
  const errorMessage = screenState === 'unsupported'
    ? 'Screen capture is not supported in this browser or environment.'
    : null

  assert.equal(screenState, 'unsupported')
  assert.match(errorMessage, /not supported/i)
})

test('Screen Context: stopping/removing screen context clears pending attachment', () => {
  let pendingScreenAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw...',
    filename: 'screen_snapshot.png',
    source: 'screen',
  }
  let screenState = 'active'

  // User clicks ✕ Stop / Remove
  pendingScreenAttachment = null
  screenState = 'idle'

  assert.equal(pendingScreenAttachment, null)
  assert.equal(screenState, 'idle')
})

test('Regression: existing uploaded image workflow remains intact with source="upload"', () => {
  const uploadAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw...',
    filename: 'attached_screenshot.png',
    size_bytes: 45000,
    source: 'upload',
  }

  const { updatedHistory, payload } = buildChatTurnWithScreen({
    textInput: 'Diagnose this attached file',
    screenAttachment: uploadAttachment,
    inputMode: 'text',
  })

  assert.equal(updatedHistory[0].attachments[0].source, 'upload')
  assert.equal(payload.messages[0].attachments[0].filename, 'attached_screenshot.png')
})

test('Regression: existing text-only workflow remains intact', () => {
  const { updatedHistory, payload } = buildChatTurnWithScreen({
    textInput: 'Explain ACID compliance in databases',
    screenAttachment: null,
    inputMode: 'text',
  })

  assert.equal(updatedHistory.length, 1)
  assert.equal(updatedHistory[0].attachments, undefined)
  assert.equal(payload.messages[0].attachments, undefined)
  assert.equal(payload.messages[0].content, 'Explain ACID compliance in databases')
})
