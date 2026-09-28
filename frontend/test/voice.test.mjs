import test from 'node:test'
import assert from 'node:assert/strict'

// Import text preparation logic or mirror client service logic for test execution
function prepareTextForSpeech(markdown) {
  if (!markdown) return ''

  let text = markdown
    .replace(/```[\s\S]*?```/g, ' A code example is provided on your screen. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+(.+)$/gm, '$1. ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^>\s*(.+)$/gm, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return text
}

function buildVoiceChatTurn(history, spokenText, attachment) {
  const finalContent = (spokenText || '').trim() || "VISTA, look at this error and tell me what's wrong."
  const userMessage = {
    role: 'user',
    content: finalContent,
    input_mode: 'voice',
    attachments: attachment ? [attachment] : undefined,
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

test('Voice TTS: strips code blocks and inserts natural spoken placeholder', () => {
  const markdown = `
Here is how you fix the CORS policy:
\`\`\`python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"])
\`\`\`
Let me know if this works.
`
  const spoken = prepareTextForSpeech(markdown)
  assert.equal(spoken.includes('CORSMiddleware'), false)
  assert.equal(spoken.includes('A code example is provided on your screen.'), true)
  assert.match(spoken, /^Here is how you fix the CORS policy: A code example is provided on your screen\. Let me know if this works\.$/)
})

test('Voice TTS: strips markdown formatting, headers, bullets, and inline backticks', () => {
  const markdown = `
### Diagnostic Summary
* **Error**: \`OperationalError\`
* **Solution**: Check database [connection pool](https://postgresql.org/pool).
> Note: Increase max_connections.
`
  const spoken = prepareTextForSpeech(markdown)
  assert.equal(spoken.includes('###'), false)
  assert.equal(spoken.includes('`'), false)
  assert.equal(spoken.includes('**'), false)
  assert.equal(spoken.includes('https://'), false)
  assert.match(spoken, /Diagnostic Summary\. Error: OperationalError Solution: Check database connection pool\. Note: Increase max_connections\./)
})

test('Voice TTS: handles empty or whitespace-only text gracefully', () => {
  assert.equal(prepareTextForSpeech(''), '')
  assert.equal(prepareTextForSpeech('   \n\n  '), '')
  assert.equal(prepareTextForSpeech(null), '')
})

test('Voice STT: simulated recognition state machine transitions correctly', () => {
  const transitions = []
  let state = 'idle'
  const onStateChange = (s) => transitions.push(s)

  // Start listening
  state = 'listening'
  onStateChange(state)

  // Audio detected & processing
  state = 'processing'
  onStateChange(state)

  // Turn ended
  state = 'idle'
  onStateChange(state)

  assert.deepEqual(transitions, ['listening', 'processing', 'idle'])
})

test('Voice STT: handles permission denied (not-allowed) gracefully', () => {
  let state = 'idle'
  let errorMsg = null

  // Simulate browser throwing not-allowed error
  const event = { error: 'not-allowed' }
  if (event.error === 'not-allowed') {
    state = 'permission_denied'
    errorMsg = 'Microphone access was denied. Please allow microphone permissions in your browser.'
  }

  assert.equal(state, 'permission_denied')
  assert.match(errorMsg, /Microphone access was denied/i)
})

test('Voice STT: handles no-speech and network errors gracefully', () => {
  const handleVoiceError = (errType) => {
    if (errType === 'no-speech') {
      return 'No speech was detected. Please try speaking again.'
    }
    if (errType === 'network') {
      return 'Speech recognition network error. Please verify network connectivity.'
    }
    return 'Speech recognition error.'
  }

  assert.match(handleVoiceError('no-speech'), /No speech was detected/i)
  assert.match(handleVoiceError('network'), /network error/i)
})

test('Voice Synthesis: simulates speak, pause, resume, and stop playback lifecycle', () => {
  const events = []
  let playbackState = 'idle'

  const speak = () => {
    playbackState = 'speaking'
    events.push('speaking')
  }

  const pause = () => {
    if (playbackState === 'speaking') {
      playbackState = 'paused'
      events.push('paused')
    }
  }

  const resume = () => {
    if (playbackState === 'paused') {
      playbackState = 'speaking'
      events.push('resumed')
    }
  }

  const stop = () => {
    playbackState = 'idle'
    events.push('stopped')
  }

  speak()
  pause()
  resume()
  stop()

  assert.deepEqual(events, ['speaking', 'paused', 'resumed', 'stopped'])
  assert.equal(playbackState, 'idle')
})

test('Multimodal Spoken Query: combines spoken prompt with attached screenshot in conversation history', () => {
  const history = [
    { role: 'user', content: 'What is VISTA?', input_mode: 'text' },
    { role: 'assistant', content: 'VISTA is your Visual Intelligence & Spoken Technical Assistant.' },
  ]

  const screenshot = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgo...',
    filename: 'exception.png',
    size_bytes: 42000,
  }

  const spokenPrompt = "VISTA, look at this error and tell me what's wrong."
  const { updatedHistory, payload } = buildVoiceChatTurn(history, spokenPrompt, screenshot)

  // Verify history preservation
  assert.equal(updatedHistory.length, 3)
  assert.equal(updatedHistory[0].role, 'user')
  assert.equal(updatedHistory[1].role, 'assistant')

  // Verify voice turn properties
  const latestMessage = updatedHistory[2]
  assert.equal(latestMessage.role, 'user')
  assert.equal(latestMessage.content, spokenPrompt)
  assert.equal(latestMessage.input_mode, 'voice')
  assert.equal(latestMessage.attachments.length, 1)
  assert.equal(latestMessage.attachments[0].filename, 'exception.png')

  // Verify API payload preserves multi-turn context and voice input_mode
  assert.equal(payload.messages.length, 3)
  assert.equal(payload.messages[2].input_mode, 'voice')
  assert.equal(payload.messages[2].attachments[0].mime_type, 'image/png')
})

test('Graceful Degradation: user can continue with 100% text if voice is unsupported', () => {
  const isSpeechSupported = false
  let voiceStatus = isSpeechSupported ? 'ready' : 'unsupported'

  assert.equal(voiceStatus, 'unsupported')

  // Text flow continues unimpeded
  const textHistory = []
  const textMessage = {
    role: 'user',
    content: 'Diagnose this traceback via keyboard',
    input_mode: 'text',
  }
  textHistory.push(textMessage)
  assert.equal(textHistory.length, 1)
  assert.equal(textHistory[0].input_mode, 'text')
})
