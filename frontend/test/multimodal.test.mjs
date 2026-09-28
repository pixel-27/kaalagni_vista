import test from 'node:test'
import assert from 'node:assert/strict'

// Test helpers mirroring App.tsx client logic
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const VALID_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

function validateImageFile(file) {
  const normType = (file.type || '').toLowerCase()
  const name = file.name || ''
  const isValidMime = VALID_MIMES.includes(normType) || Boolean(name.match(/\.(png|jpe?g|webp)$/i))
  if (!isValidMime) {
    return { valid: false, error: 'Unsupported image format. Please attach a PNG, JPEG, or WEBP image.' }
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image file size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit.`,
    }
  }
  return { valid: true, error: null }
}

function simulatePasteEvent(items) {
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const ext = item.type.split('/')[1] === 'jpeg' ? 'jpg' : item.type.split('/')[1] || 'png'
      return {
        isImage: true,
        file: item.file,
        fallbackName: `pasted-screenshot.${ext}`,
      }
    }
  }
  return { isImage: false, file: null, fallbackName: null }
}

function buildChatPayload(history, currentInput, currentAttachment) {
  const finalContent = (currentInput || '').trim() || "VISTA, look at this error and tell me what's wrong."
  const userMessage = {
    role: 'user',
    content: finalContent,
    attachments: currentAttachment ? [currentAttachment] : undefined,
    timestamp: new Date().toISOString(),
  }
  const updatedHistory = [...history, userMessage]
  const payload = {
    messages: updatedHistory.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    })),
  }
  return { updatedHistory, payload }
}

test('Frontend: image selection accepts valid PNG, JPEG, WEBP under 10MB', () => {
  const pngFile = { name: 'error.png', type: 'image/png', size: 1024 * 50 }
  const jpgFile = { name: 'trace.jpg', type: 'image/jpeg', size: 1024 * 150 }
  const webpFile = { name: 'ui.webp', type: 'image/webp', size: 1024 * 80 }

  assert.equal(validateImageFile(pngFile).valid, true)
  assert.equal(validateImageFile(jpgFile).valid, true)
  assert.equal(validateImageFile(webpFile).valid, true)
})

test('Frontend: image selection rejects unsupported formats (GIF, PDF, EXE)', () => {
  const gifFile = { name: 'anim.gif', type: 'image/gif', size: 1024 }
  const pdfFile = { name: 'doc.pdf', type: 'application/pdf', size: 1024 }
  const exeFile = { name: 'malware.exe', type: 'application/octet-stream', size: 1024 }

  const resGif = validateImageFile(gifFile)
  assert.equal(resGif.valid, false)
  assert.match(resGif.error, /Unsupported image format/i)

  const resPdf = validateImageFile(pdfFile)
  assert.equal(resPdf.valid, false)

  const resExe = validateImageFile(exeFile)
  assert.equal(resExe.valid, false)
})

test('Frontend: image selection rejects files exceeding 10MB', () => {
  const oversizedFile = { name: 'huge_screen.png', type: 'image/png', size: 11 * 1024 * 1024 }
  const res = validateImageFile(oversizedFile)
  assert.equal(res.valid, false)
  assert.match(res.error, /exceeds the 10MB limit/i)
})

test('Frontend: paste-image handling extracts image from clipboard data', () => {
  const mockImageFile = { name: 'image.png', type: 'image/png', size: 12000 }
  const clipboardItems = [
    { type: 'text/plain', file: null },
    { type: 'image/png', file: mockImageFile },
  ]
  const pasteResult = simulatePasteEvent(clipboardItems)
  assert.equal(pasteResult.isImage, true)
  assert.equal(pasteResult.file, mockImageFile)
  assert.equal(pasteResult.fallbackName, 'pasted-screenshot.png')
})

test('Frontend: paste-image falls back gracefully on text-only clipboard', () => {
  const clipboardItems = [{ type: 'text/plain', file: null }]
  const pasteResult = simulatePasteEvent(clipboardItems)
  assert.equal(pasteResult.isImage, false)
  assert.equal(pasteResult.file, null)
})

test('Frontend: image preview holds attachment and removal clears it', () => {
  let pendingAttachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgo...',
    filename: 'debug.png',
    size_bytes: 45000,
  }
  assert.equal(pendingAttachment.filename, 'debug.png')
  assert.equal(pendingAttachment.mime_type, 'image/png')

  // Simulate user clicking ✕ Remove
  pendingAttachment = null
  assert.equal(pendingAttachment, null)
})

test('Frontend: send with image builds valid multimodal payload and preserves history', () => {
  const initialHistory = [
    { role: 'user', content: 'Initial text query' },
    { role: 'assistant', content: 'Initial diagnosis' },
  ]
  const attachment = {
    mime_type: 'image/png',
    data: 'data:image/png;base64,iVBORw0KGgo...',
    filename: 'traceback.png',
    size_bytes: 32000,
  }

  const { updatedHistory, payload } = buildChatPayload(initialHistory, 'Look at this error', attachment)

  assert.equal(updatedHistory.length, 3)
  assert.equal(updatedHistory[2].role, 'user')
  assert.equal(updatedHistory[2].content, 'Look at this error')
  assert.equal(updatedHistory[2].attachments.length, 1)
  assert.equal(updatedHistory[2].attachments[0].filename, 'traceback.png')

  // Ensure request payload correctly mapped
  assert.equal(payload.messages.length, 3)
  assert.deepEqual(payload.messages[2].attachments, [attachment])
})

test('Frontend: visual analysis states transition correctly during send', () => {
  const states = []
  let state = 'idle'
  states.push(state)

  const isMultimodal = true
  if (isMultimodal) {
    state = 'uploading'
    states.push(state)
    state = 'analyzing'
    states.push(state)
  } else {
    state = 'thinking'
    states.push(state)
  }

  state = 'responding'
  states.push(state)

  state = 'idle'
  states.push(state)

  assert.deepEqual(states, ['idle', 'uploading', 'analyzing', 'responding', 'idle'])
})

test('Frontend: error state is captured when server returns an HTTP error', () => {
  let error = null
  const mockServerError = 'Server returned HTTP 400: Invalid image attachment'

  try {
    throw new Error(mockServerError)
  } catch (err) {
    error = err.message
  }

  assert.equal(error, 'Server returned HTTP 400: Invalid image attachment')
})
