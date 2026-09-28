import { useState, useEffect, useRef } from 'react'
import { ChatMessageView } from './components/ChatMessageView'
import type {
  ChatMessage,
  ChatResponse,
  HealthData,
  ImageAttachment,
  VoiceRecognitionState,
  VoicePlaybackState,
  InputMode,
  ScreenCaptureState,
  ToolCall,
} from './types'
import {
  VoiceRecognitionController,
  VoiceSynthesisController,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
} from './services/voice'
import {
  ScreenCaptureController,
  isScreenCaptureSupported,
} from './services/screen'
import { executeTool } from './services/tools'


const QUICK_STARTERS = [
  {
    title: 'Screen Context Diagnosis',
    subtitle: "VISTA, look at my screen and tell me what's wrong",
    prompt: "VISTA, look at what's on my screen and tell me why this error is happening.",
  },
  {
    title: 'Visual Screenshot Error',
    subtitle: "VISTA, look at this error and tell me what's wrong",
    prompt: "VISTA, look at this error and tell me what's wrong.",
  },
  {
    title: 'FastAPI 500 Error',
    subtitle: 'Unhandled exception & traceback diagnosis',
    prompt: 'My FastAPI application is returning a 500 Internal Server Error. How do I diagnose the root cause?',
  },
  {
    title: 'CORS Preflight Block',
    subtitle: 'Access-Control-Allow-Origin header failure',
    prompt: 'The browser is blocking my frontend API requests with a CORS preflight policy error. How do I configure CORSMiddleware in FastAPI?',
  },
  {
    title: 'PostgreSQL Pool Timeout',
    subtitle: 'Connection exhaustion under async load',
    prompt: 'My async database connection pool is timing out with "OperationalError: connection pool exhausted". How should I tune pool size and timeout parameters?',
  },
]

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastModelUsed, setLastModelUsed] = useState<string>('')
  const [showHealthModal, setShowHealthModal] = useState(false)

  // Multimodal visual attachment state (Phase 3)
  const [pendingAttachment, setPendingAttachment] = useState<ImageAttachment | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [diagnosticState, setDiagnosticState] = useState<'idle' | 'uploading' | 'analyzing' | 'thinking' | 'responding'>('idle')

  // Screen context state (Phase 5)
  const [screenState, setScreenState] = useState<ScreenCaptureState>(
    isScreenCaptureSupported() ? 'idle' : 'unsupported'
  )
  const [screenErrorMessage, setScreenErrorMessage] = useState<string | null>(null)

  // Voice interaction state (Phase 4)
  const [voiceRecState, setVoiceRecState] = useState<VoiceRecognitionState>(
    isSpeechRecognitionSupported() ? 'idle' : 'unsupported'
  )
  const [voicePlayState, setVoicePlayState] = useState<VoicePlaybackState>(
    isSpeechSynthesisSupported() ? 'idle' : 'unsupported'
  )
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [currentlySpeakingText, setCurrentlySpeakingText] = useState<string | null>(null)
  const [lastInputMode, setLastInputMode] = useState<InputMode>('text')

  // Controlled Diagnostic Tools state (Phase 6)
  const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(null)
  const [activeToolActivity, setActiveToolActivity] = useState<{
    tool: string
    status: 'running' | 'completed' | 'denied' | 'error'
    label?: string
  } | null>(null)

  // Health telemetry state (preserved from Phase 1)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthStatus, setHealthStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [latency, setLatency] = useState<number | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<VoiceRecognitionController | null>(null)
  const synthesisRef = useRef<VoiceSynthesisController | null>(null)
  const screenControllerRef = useRef<ScreenCaptureController | null>(null)

  useEffect(() => {
    const rec = new VoiceRecognitionController({
      onStateChange: (state) => setVoiceRecState(state),
      onInterimTranscript: (text) => setInterimTranscript(text),
      onFinalTranscript: (text) => {
        setInterimTranscript('')
        setLastInputMode('voice')
        setInput((prev) => (prev ? `${prev.trim()} ${text}` : text))
      },
      onError: (err) => setVoiceErrorMessage(err),
    })
    recognitionRef.current = rec

    const syn = new VoiceSynthesisController({
      onStateChange: (state) => {
        setVoicePlayState(state)
        if (state === 'idle') {
          setCurrentlySpeakingText(null)
        }
      },
      onError: (err) => setVoiceErrorMessage(err),
    })
    synthesisRef.current = syn

    return () => {
      rec.destroy()
      syn.stop()
    }
  }, [])

  useEffect(() => {
    const screenCtrl = new ScreenCaptureController({
      onStateChange: (state) => setScreenState(state),
      onError: (err) => setScreenErrorMessage(err),
      onSnapshot: (attachment) => {
        setPendingAttachment(attachment)
        setScreenErrorMessage(null)
      },
    })
    screenControllerRef.current = screenCtrl
  }, [])

  const handleTriggerScreenCapture = async () => {
    setScreenErrorMessage(null)
    setError(null)
    if (screenControllerRef.current) {
      await screenControllerRef.current.captureSnapshot()
    }
  }

  const handleClearAttachment = () => {
    setPendingAttachment(null)
    screenControllerRef.current?.clear()
  }

  const toggleVoiceRecognition = () => {
    setVoiceErrorMessage(null)
    if (voiceRecState === 'listening') {
      recognitionRef.current?.stop()
    } else {
      if (voicePlayState === 'speaking') {
        synthesisRef.current?.stop()
      }
      recognitionRef.current?.start()
    }
  }

  const handleToggleSpeak = (content: string) => {
    if (voicePlayState === 'speaking' && currentlySpeakingText === content) {
      synthesisRef.current?.stop()
      setCurrentlySpeakingText(null)
    } else {
      synthesisRef.current?.speak(content)
      setCurrentlySpeakingText(content)
    }
  }


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  // Probe health endpoint
  const checkHealth = async () => {
    setHealthStatus('checking')
    const start = performance.now()
    try {
      let res: Response
      try {
        res = await fetch('/api/health')
      } catch {
        res = await fetch('http://127.0.0.1:8000/api/health')
      }
      const elapsed = Math.round(performance.now() - start)
      setLatency(elapsed)
      if (res.ok) {
        const data: HealthData = await res.json()
        setHealth(data)
        setHealthStatus('connected')
      } else {
        setHealthStatus('error')
      }
    } catch {
      setHealthStatus('error')
    }
  }

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const processImageFile = (file: File, fallbackName?: string) => {
    setError(null)
    const validMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    const fileType = file.type.toLowerCase()
    const fileName = file.name || fallbackName || 'screenshot.png'

    if (!validMimes.includes(fileType) && !fileName.match(/\.(png|jpe?g|webp)$/i)) {
      setError('Unsupported image format. Please attach a PNG, JPEG, or WEBP image.')
      return
    }
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_SIZE) {
      setError(`Image file size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit.`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      let mime = file.type || 'image/png'
      if (mime === 'image/jpg') mime = 'image/jpeg'
      setPendingAttachment({
        mime_type: mime,
        data: result,
        filename: fileName,
        size_bytes: file.size,
        source: 'upload',
      })
    }
    reader.onerror = () => {
      setError('Failed to read image attachment from disk or clipboard.')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          const ext = item.type.split('/')[1] === 'jpeg' ? 'jpg' : item.type.split('/')[1] || 'png'
          processImageFile(file, `pasted-screenshot-${new Date().toLocaleTimeString().replace(/:/g, '-')}.${ext}`)
          return
        }
      }
    }
  }

  const sendMessage = async (textToSend?: string) => {
    const content = (textToSend || input).trim()
    const currentAttachment = pendingAttachment
    const currentInputMode: InputMode = lastInputMode

    if ((!content && !currentAttachment) || loading) return

    // Stop active speech recognition when sending
    if (voiceRecState === 'listening') {
      recognitionRef.current?.stop()
    }

    setError(null)
    const finalContent =
      content ||
      (currentAttachment?.source === 'screen'
        ? "VISTA, look at what's on my screen and tell me why this error is happening."
        : "VISTA, look at this error and tell me what's wrong.")

    const userMessage: ChatMessage = {
      role: 'user',
      content: finalContent,
      attachments: currentAttachment ? [currentAttachment] : undefined,
      input_mode: currentInputMode,
      timestamp: new Date().toISOString(),
    }

    const updatedHistory = [...messages, userMessage]
    setMessages(updatedHistory)
    setInput('')
    setPendingAttachment(null)
    screenControllerRef.current?.clear()
    setLastInputMode('text')
    setLoading(true)

    if (currentAttachment) {
      setDiagnosticState('uploading')
      setTimeout(() => setDiagnosticState('analyzing'), 350)
    } else {
      setDiagnosticState('thinking')
    }

    try {
      const data = await dispatchChatTurn(updatedHistory)
      setDiagnosticState('responding')
      await handleChatResponse(data, updatedHistory)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to communicate with VISTA backend'
      setError(msg)
    } finally {
      setLoading(false)
      setDiagnosticState('idle')
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const dispatchChatTurn = async (chatHistory: ChatMessage[]): Promise<ChatResponse> => {
    let res: Response
    const payload = {
      messages: chatHistory.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        input_mode: m.input_mode,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
        tool_result: m.tool_result,
      })),
    }

    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      res = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    if (!res.ok) {
      let errDetail = `Server returned HTTP ${res.status}: ${res.statusText}`
      try {
        const errData = await res.json()
        if (errData.detail) errDetail = errData.detail
      } catch {
        // ignore
      }
      throw new Error(errDetail)
    }

    return res.json()
  }

  const handleChatResponse = async (data: ChatResponse, currentHistory: ChatMessage[]) => {
    const nextHistory = [...currentHistory, data.message]
    setMessages(nextHistory)
    setLastModelUsed(`${data.provider} · ${data.model}`)

    // Check if assistant requested controlled diagnostic tool(s)
    if (data.message.tool_calls && data.message.tool_calls.length > 0) {
      const toolCall = data.message.tool_calls[0]
      if (toolCall.tool === 'run_test') {
        // Execution tool requires explicit user confirmation
        setPendingToolCall(toolCall)
        setActiveToolActivity({
          tool: toolCall.tool,
          status: 'running',
          label: `Awaiting user approval to run test: ${String(toolCall.arguments.test_target || '')}`,
        })
      } else {
        // Read-only tool: execute automatically
        await executeReadOnlyTool(toolCall, nextHistory)
      }
    } else {
      setActiveToolActivity(null)
      if (autoSpeak && data.message.content) {
        synthesisRef.current?.speak(data.message.content)
        setCurrentlySpeakingText(data.message.content)
      }
    }
  }

  const executeReadOnlyTool = async (call: ToolCall, historySoFar: ChatMessage[]) => {
    setActiveToolActivity({
      tool: call.tool,
      status: 'running',
      label: `Executing ${call.tool}...`,
    })

    try {
      const toolRes = await executeTool({
        call_id: call.id,
        tool: call.tool,
        arguments: call.arguments,
        user_approved: true,
      })

      const toolMsg: ChatMessage = {
        role: 'tool',
        content: typeof toolRes.output === 'string' ? toolRes.output : JSON.stringify(toolRes.output || toolRes.error || ''),
        tool_call_id: call.id,
        tool_result: toolRes,
        timestamp: new Date().toISOString(),
      }

      const updatedHistory = [...historySoFar, toolMsg]
      setMessages(updatedHistory)
      setActiveToolActivity({
        tool: call.tool,
        status: toolRes.status === 'success' ? 'completed' : 'error',
        label: toolRes.status === 'success' ? `✅ ${call.tool} completed` : `❌ ${call.tool} error`,
      })

      // Dispatch follow-up to LLM so VISTA analyzes the tool result
      setLoading(true)
      setDiagnosticState('analyzing')
      const followUpData = await dispatchChatTurn(updatedHistory)
      await handleChatResponse(followUpData, updatedHistory)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tool execution failed'
      setError(msg)
      setActiveToolActivity(null)
    } finally {
      setLoading(false)
      setDiagnosticState('idle')
    }
  }

  const handleConfirmToolExecution = async (call: ToolCall, approved: boolean) => {
    setPendingToolCall(null)
    setActiveToolActivity({
      tool: call.tool,
      status: approved ? 'running' : 'denied',
      label: approved ? `Running approved test target: ${String(call.arguments.test_target || '')}...` : 'Test execution denied by user',
    })

    setLoading(true)
    try {
      const toolRes = await executeTool({
        call_id: call.id,
        tool: call.tool,
        arguments: call.arguments,
        user_approved: approved,
        approval_token: call.approval_token,
      })

      const toolMsg: ChatMessage = {
        role: 'tool',
        content: approved ? 'Test executed successfully.' : 'Execution denied by user.',
        tool_call_id: call.id,
        tool_result: toolRes,
        timestamp: new Date().toISOString(),
      }

      const updatedHistory = [...messages, toolMsg]
      setMessages(updatedHistory)

      // Dispatch follow-up to LLM
      setDiagnosticState('analyzing')
      const followUpData = await dispatchChatTurn(updatedHistory)
      await handleChatResponse(followUpData, updatedHistory)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute tool'
      setError(msg)
    } finally {
      setLoading(false)
      setDiagnosticState('idle')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    if (window.confirm('Reset conversation history?')) {
      synthesisRef.current?.stop()
      recognitionRef.current?.stop()
      screenControllerRef.current?.clear()
      setCurrentlySpeakingText(null)
      setPendingAttachment(null)
      setScreenErrorMessage(null)
      setVoiceErrorMessage(null)
      setMessages([])
      setError(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* VISTA Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '0.75rem 1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '17px',
              color: '#ffffff',
              boxShadow: '0 0 14px rgba(6, 182, 212, 0.4)',
            }}
          >
            V
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.04em' }}>VISTA</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: 'var(--accent-cyan)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  border: '1px solid #334155',
                }}
              >
                Voice & Vision
              </span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Visual Intelligence & Spoken Technical Assistant
            </p>
          </div>
        </div>

        {/* Center / Model Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastModelUsed && (
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-cyan)',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                padding: '0.2rem 0.6rem',
                borderRadius: '4px',
                border: '1px solid rgba(6, 182, 212, 0.25)',
              }}
            >
              Active: {lastModelUsed}
            </span>
          )}
        </div>

        {/* Actions & Health Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Auto-Speak Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !autoSpeak
              setAutoSpeak(next)
              if (!next && voicePlayState === 'speaking') {
                synthesisRef.current?.stop()
                setCurrentlySpeakingText(null)
              }
            }}
            title="Toggle automatic speech synthesis for assistant responses"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              fontSize: '0.72rem',
              borderRadius: '6px',
              backgroundColor: autoSpeak ? 'rgba(6, 182, 212, 0.15)' : '#1e293b',
              border: autoSpeak ? '1px solid var(--accent-cyan)' : '1px solid #334155',
              color: autoSpeak ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span>{autoSpeak ? '🔊' : '🔈'}</span>
            <span>Auto-Speak: {autoSpeak ? 'ON' : 'OFF'}</span>
          </button>

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              style={{
                fontSize: '0.72rem',
                padding: '0.35rem 0.75rem',
                backgroundColor: '#1e293b',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                border: '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              Clear Chat
            </button>
          )}

          {/* System Status Pill */}
          <button
            onClick={() => setShowHealthModal(!showHealthModal)}
            title="Click to view backend diagnostics"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              backgroundColor:
                healthStatus === 'connected'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : healthStatus === 'checking'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(244, 63, 94, 0.1)',
              border: `1px solid ${
                healthStatus === 'connected'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : healthStatus === 'checking'
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(244, 63, 94, 0.3)'
              }`,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor:
                  healthStatus === 'connected'
                    ? 'var(--accent-emerald)'
                    : healthStatus === 'checking'
                    ? 'var(--accent-amber)'
                    : 'var(--accent-rose)',
                boxShadow:
                  healthStatus === 'connected'
                    ? '0 0 8px var(--accent-emerald)'
                    : 'none',
              }}
            />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color:
                  healthStatus === 'connected'
                    ? 'var(--accent-emerald)'
                    : healthStatus === 'checking'
                    ? 'var(--accent-amber)'
                    : 'var(--accent-rose)',
                letterSpacing: '0.04em',
              }}
            >
              {healthStatus === 'connected'
                ? `READY (${latency}ms)`
                : healthStatus === 'checking'
                ? 'CHECKING...'
                : 'OFFLINE'}
            </span>
          </button>
        </div>
      </header>

      {/* Diagnostics Drawer (Preserves Phase 1 Health View) */}
      {showHealthModal && (
        <div
          style={{
            backgroundColor: '#0c1322',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0.85rem 1.75rem',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>Backend: <strong style={{ color: '#fff' }}>http://127.0.0.1:8000</strong></span>
            <span>Status: <strong style={{ color: 'var(--accent-emerald)' }}>{health?.status || 'unknown'}</strong></span>
            <span>Version: <strong style={{ color: 'var(--accent-blue)' }}>{health?.version || '0.2.0'}</strong></span>
            <span>Environment: <strong>{health?.environment || 'development'}</strong></span>
            <span>Ping: <strong>{latency}ms</strong></span>
          </div>
          <button
            onClick={() => setShowHealthModal(false)}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            ✕ Close
          </button>
        </div>
      )}

      {/* Multimodal Context Bar (Phase 3 Active) */}
      <div
        style={{
          backgroundColor: '#0c101a',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.45rem 1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.73rem',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span>👁 Visual Context:</span>
          {pendingAttachment ? (
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
              Attachment staged ({pendingAttachment.filename}) · Ready to send
            </span>
          ) : messages.some((m) => m.attachments && m.attachments.length > 0) ? (
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
              Active (Multi-turn visual context engaged)
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>
              Ready (Click 📎 or paste Ctrl+V to attach technical screenshot)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span
            style={{
              padding: '0.15rem 0.5rem',
              backgroundColor: voiceRecState === 'listening' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.12)',
              color: voiceRecState === 'listening' ? '#ef4444' : 'var(--accent-cyan)',
              borderRadius: '4px',
              border: voiceRecState === 'listening' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(6, 182, 212, 0.3)',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            {voiceRecState === 'listening' ? '🔴 Voice: Listening' : '🎙 Voice & Speech Active'}
          </span>
          <span
            style={{
              padding: '0.15rem 0.5rem',
              backgroundColor: 'rgba(6, 182, 212, 0.12)',
              color: 'var(--accent-cyan)',
              borderRadius: '4px',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            📷 Multimodal Vision Active
          </span>
          <span
            style={{
              padding: '0.15rem 0.5rem',
              backgroundColor: pendingAttachment?.source === 'screen' ? 'rgba(6, 182, 212, 0.22)' : 'rgba(6, 182, 212, 0.1)',
              color: 'var(--accent-cyan)',
              borderRadius: '4px',
              border: pendingAttachment?.source === 'screen' ? '1px solid var(--accent-cyan)' : '1px solid rgba(6, 182, 212, 0.3)',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            {pendingAttachment?.source === 'screen' ? '🖥️ Screen Context Active' : '🖥️ Screen Context Ready'}
          </span>
        </div>
      </div>


      {/* Main Conversation Viewport */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem 2rem',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ maxWidth: '900px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 ? (
            /* Empty State */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                padding: '2rem 1rem',
              }}
            >
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  marginBottom: '1rem',
                  color: 'var(--accent-cyan)',
                }}
              >
                ⚡
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f8fafc' }}>
                Technical Troubleshooting Engine
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '520px', lineHeight: 1.6, marginBottom: '2rem' }}>
                Ask VISTA to diagnose API errors, analyze stack traces, resolve runtime bugs, or inspect system architecture issues.
              </p>

              {/* Starter Scenarios */}
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.85rem', textAlign: 'left' }}>
                {QUICK_STARTERS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(s.prompt)}
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.2s, background-color 0.2s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-blue)'
                      e.currentTarget.style.backgroundColor = 'var(--bg-card)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)'
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                    }}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      {s.title}
                    </span>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {s.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message List */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {messages.map((m, idx) => (
                <ChatMessageView
                  key={idx}
                  message={m}
                  modelName={m.role === 'assistant' ? lastModelUsed : undefined}
                  onSpeak={m.role === 'assistant' ? (content) => handleToggleSpeak(content) : undefined}
                  isSpeaking={voicePlayState === 'speaking' && currentlySpeakingText === m.content}
                />
              ))}

              {/* Thinking / Analyzing Indicator */}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '12px',
                      color: '#ffffff',
                    }}
                  >
                    V
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.65rem 1rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: 'var(--accent-cyan)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-cyan)',
                        animation: 'pulse 1.5s infinite',
                      }}
                    />
                    <span>
                      {diagnosticState === 'uploading'
                        ? 'Uploading image & diagnostic context...'
                        : diagnosticState === 'analyzing'
                        ? 'Analyzing visual screenshot & error telemetry...'
                        : diagnosticState === 'responding'
                        ? 'Formulating technical remediation plan...'
                        : 'VISTA is analyzing the technical context...'}
                    </span>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.35)',
                    borderRadius: '8px',
                    padding: '0.85rem 1.15rem',
                    margin: '1rem 0',
                    color: 'var(--accent-rose)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <strong>Diagnostic Error:</strong> {error}
                  </div>
                  <button
                    onClick={() => sendMessage(messages[messages.length - 1]?.content)}
                    style={{
                      padding: '0.3rem 0.75rem',
                      backgroundColor: 'rgba(244, 63, 94, 0.2)',
                      color: 'var(--accent-rose)',
                      borderRadius: '4px',
                      border: '1px solid rgba(244, 63, 94, 0.4)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Dock */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '0.85rem 2rem',
          flexShrink: 0,
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processImageFile(e.dataTransfer.files[0])
          }
        }}
      >
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Compact Image/Screen Preview before sending */}
          {pendingAttachment && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.75rem',
                backgroundColor: pendingAttachment.source === 'screen' ? '#0f2438' : '#111d2e',
                border: pendingAttachment.source === 'screen' ? '1px solid #0284c7' : '1px solid #1e3a5f',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <img
                  src={pendingAttachment.data}
                  alt="Context thumbnail"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.78rem', color: '#f8fafc', fontWeight: 600 }}>
                    {pendingAttachment.source === 'screen' ? '🖥️ Captured Screen Context' : '📷 Attached Screenshot'}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {pendingAttachment.filename || (pendingAttachment.source === 'screen' ? 'screen-snapshot.png' : 'screenshot.png')} ·{' '}
                    {pendingAttachment.size_bytes ? `${(pendingAttachment.size_bytes / 1024).toFixed(1)} KB` : ''} ·{' '}
                    <span style={{ color: 'var(--accent-cyan)' }}>
                      {pendingAttachment.source === 'screen' ? 'Observation Only' : 'User Upload'}
                    </span>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {pendingAttachment.source === 'screen' && (
                  <button
                    type="button"
                    onClick={handleTriggerScreenCapture}
                    title="Retake screen snapshot"
                    style={{
                      backgroundColor: 'rgba(6, 182, 212, 0.15)',
                      border: '1px solid rgba(6, 182, 212, 0.35)',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    🔄 Retake
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearAttachment}
                  title="Remove attachment or screen context"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent-rose)')}
                  onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  ✕ {pendingAttachment.source === 'screen' ? 'Stop' : 'Remove'}
                </button>
              </div>
            </div>
          )}

          {/* Phase 6: Diagnostic Tool Confirmation Card (for execution tools like run_test) */}
          {pendingToolCall && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                padding: '0.9rem 1.15rem',
                backgroundColor: 'rgba(167, 139, 250, 0.12)',
                border: '1px solid rgba(167, 139, 250, 0.5)',
                borderRadius: '10px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#f1f5f9', fontSize: '0.86rem' }}>
                  <span>🧪</span>
                  <span>VISTA requests permission to execute diagnostic test:</span>
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontFamily: 'var(--font-mono)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(245, 158, 11, 0.25)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.45)',
                    fontWeight: 600,
                  }}
                >
                  REQUIRES CONFIRMATION
                </span>
              </div>

              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#cbd5e1',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Target: </span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{String(pendingToolCall.arguments.test_target || '')}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Scope: </span>
                  <span>Allowlisted project test suite execution within workspace sandbox</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem' }}>
                <button
                  type="button"
                  onClick={() => handleConfirmToolExecution(pendingToolCall, true)}
                  disabled={loading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 1rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.22)',
                    border: '1px solid #10b981',
                    color: '#34d399',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <span>✓</span>
                  <span>Allow & Run Test</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmToolExecution(pendingToolCall, false)}
                  disabled={loading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.95rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    color: '#f87171',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <span>✕</span>
                  <span>Deny</span>
                </button>
              </div>
            </div>
          )}

          {/* Phase 6: Active Tool Activity Banner */}
          {activeToolActivity && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.5rem 0.85rem',
                backgroundColor:
                  activeToolActivity.status === 'running'
                    ? 'rgba(167, 139, 250, 0.15)'
                    : activeToolActivity.status === 'completed'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${
                  activeToolActivity.status === 'running'
                    ? 'rgba(167, 139, 250, 0.45)'
                    : activeToolActivity.status === 'completed'
                    ? 'rgba(16, 185, 129, 0.4)'
                    : 'rgba(245, 158, 11, 0.4)'
                }`,
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: '#f1f5f9',
              }}
            >
              <span>{activeToolActivity.tool === 'read_file' ? '📄' : activeToolActivity.tool === 'search_code' ? '🔍' : activeToolActivity.tool === 'analyze_error' ? '🩺' : '🧪'}</span>
              <span>{activeToolActivity.label || `Running ${activeToolActivity.tool}...`}</span>
            </div>
          )}

          {/* Screen Requesting Permission / Capturing Banner */}
          {(screenState === 'requesting_permission' || screenState === 'capturing') && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.5rem 0.85rem',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                border: '1px solid rgba(6, 182, 212, 0.45)',
                borderRadius: '8px',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-cyan)',
                  animation: 'pulse 1.5s infinite',
                }}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                Screen Context:
              </span>
              <span style={{ fontSize: '0.8rem', color: '#ffffff' }}>
                {screenState === 'requesting_permission'
                  ? 'Awaiting display selection in browser dialog (Select a screen, window, or tab)...'
                  : 'Capturing screen context frame...'}
              </span>
            </div>
          )}

          {/* Screen Error Banner */}
          {screenErrorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.85rem',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '8px',
                fontSize: '0.76rem',
                color: '#fcd34d',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚠️</span>
                <span>{screenErrorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setScreenErrorMessage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fcd34d',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '0 0.3rem',
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Active Voice Listening Banner */}
          {(voiceRecState === 'listening' || interimTranscript) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.55rem 0.85rem',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                <span style={{ fontSize: '0.78rem', color: '#fca5a5', fontWeight: 600 }}>
                  Listening:
                </span>
                <span style={{ fontSize: '0.82rem', color: '#ffffff', fontStyle: interimTranscript ? 'italic' : 'normal' }}>
                  {interimTranscript ? `"${interimTranscript}"` : 'Speak into your microphone... (say your question)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => recognitionRef.current?.stop()}
                style={{
                  fontSize: '0.72rem',
                  padding: '0.2rem 0.6rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.3)',
                  border: '1px solid rgba(239, 68, 68, 0.6)',
                  borderRadius: '4px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Done Speaking
              </button>
            </div>
          )}

          {/* Voice Error Banner */}
          {voiceErrorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.85rem',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '8px',
                fontSize: '0.76rem',
                color: '#fcd34d',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚠️</span>
                <span>{voiceErrorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setVoiceErrorMessage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fcd34d',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '0 0.3rem',
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Textarea Box with drag highlight */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              backgroundColor: isDragging ? '#162235' : 'var(--bg-primary)',
              border: isDragging ? '1px dashed var(--accent-cyan)' : '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              transition: 'border-color 0.2s, background-color 0.2s',
            }}
            onFocus={() => {
              const dock = textareaRef.current?.parentElement
              if (dock && !isDragging) dock.style.borderColor = 'var(--border-active)'
            }}
            onBlur={() => {
              const dock = textareaRef.current?.parentElement
              if (dock && !isDragging) dock.style.borderColor = 'var(--border-subtle)'
            }}
          >
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processImageFile(e.target.files[0])
                  e.target.value = ''
                }
              }}
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
            />

            {/* Attach Image Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Attach screenshot (PNG, JPEG, WEBP - Max 10MB) or Ctrl+V"
              style={{
                backgroundColor: pendingAttachment && pendingAttachment.source !== 'screen' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                border: pendingAttachment && pendingAttachment.source !== 'screen' ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                color: pendingAttachment && pendingAttachment.source !== 'screen' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                padding: '0.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '0.35rem',
                marginBottom: '2px',
                transition: 'color 0.2s, border-color 0.2s',
              }}
              onMouseOver={(e) => {
                if (!pendingAttachment || pendingAttachment.source === 'screen') e.currentTarget.style.color = '#ffffff'
              }}
              onMouseOut={(e) => {
                if (!pendingAttachment || pendingAttachment.source === 'screen') e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              📎
            </button>

            {/* Screen Context Button (Phase 5) */}
            <button
              type="button"
              onClick={handleTriggerScreenCapture}
              disabled={loading || screenState === 'unsupported' || screenState === 'requesting_permission' || screenState === 'capturing'}
              title={
                screenState === 'requesting_permission'
                  ? 'Awaiting display selection...'
                  : screenState === 'capturing'
                  ? 'Capturing screen context frame...'
                  : screenState === 'unsupported'
                  ? 'Screen capture not supported in this browser'
                  : pendingAttachment?.source === 'screen'
                  ? 'Retake screen context snapshot'
                  : 'Capture screen context (Click to share screen/window)'
              }
              style={{
                backgroundColor:
                  pendingAttachment?.source === 'screen'
                    ? 'rgba(6, 182, 212, 0.22)'
                    : screenState === 'requesting_permission' || screenState === 'capturing'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'transparent',
                border:
                  pendingAttachment?.source === 'screen'
                    ? '1px solid var(--accent-cyan)'
                    : screenState === 'requesting_permission' || screenState === 'capturing'
                    ? '1px solid #f59e0b'
                    : '1px solid transparent',
                color:
                  pendingAttachment?.source === 'screen'
                    ? 'var(--accent-cyan)'
                    : screenState === 'requesting_permission' || screenState === 'capturing'
                    ? '#f59e0b'
                    : screenState === 'unsupported'
                    ? '#475569'
                    : 'var(--text-muted)',
                padding: '0.5rem',
                borderRadius: '6px',
                cursor: loading || screenState === 'unsupported' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '0.35rem',
                marginBottom: '2px',
                transition: 'all 0.2s',
                boxShadow: pendingAttachment?.source === 'screen' ? '0 0 10px rgba(6, 182, 212, 0.4)' : 'none',
              }}
              onMouseOver={(e) => {
                if (screenState !== 'unsupported' && pendingAttachment?.source !== 'screen') {
                  e.currentTarget.style.color = '#ffffff'
                }
              }}
              onMouseOut={(e) => {
                if (screenState !== 'unsupported' && pendingAttachment?.source !== 'screen') {
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
              }}
            >
              🖥️
            </button>

            {/* Microphone Voice Input Button */}
            <button
              type="button"
              onClick={toggleVoiceRecognition}
              disabled={loading || voiceRecState === 'unsupported'}
              title={
                voiceRecState === 'listening'
                  ? 'Stop recording (Microphone active)'
                  : voiceRecState === 'unsupported'
                  ? 'Web Speech API is not supported in this browser'
                  : 'Speak your question with microphone (Voice input)'
              }
              style={{
                backgroundColor:
                  voiceRecState === 'listening'
                    ? 'rgba(239, 68, 68, 0.25)'
                    : lastInputMode === 'voice'
                    ? 'rgba(6, 182, 212, 0.18)'
                    : 'transparent',
                border:
                  voiceRecState === 'listening'
                    ? '1px solid #ef4444'
                    : lastInputMode === 'voice'
                    ? '1px solid var(--accent-cyan)'
                    : '1px solid transparent',
                color:
                  voiceRecState === 'listening'
                    ? '#ef4444'
                    : lastInputMode === 'voice'
                    ? 'var(--accent-cyan)'
                    : voiceRecState === 'unsupported'
                    ? '#475569'
                    : 'var(--text-muted)',
                padding: '0.5rem',
                borderRadius: '6px',
                cursor: loading || voiceRecState === 'unsupported' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '0.5rem',
                marginBottom: '2px',
                transition: 'all 0.2s',
                boxShadow: voiceRecState === 'listening' ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
              }}
              onMouseOver={(e) => {
                if (voiceRecState !== 'listening' && voiceRecState !== 'unsupported') {
                  e.currentTarget.style.color = '#ffffff'
                }
              }}
              onMouseOut={(e) => {
                if (voiceRecState !== 'listening' && voiceRecState !== 'unsupported' && lastInputMode !== 'voice') {
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
              }}
            >
              {voiceRecState === 'listening' ? '🔴' : '🎙️'}
            </button>

            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={loading}
              placeholder={
                pendingAttachment
                  ? pendingAttachment.source === 'screen'
                    ? "Ask a technical question about what's on your screen (or press Enter)..."
                    : "Ask a technical question about this screenshot (or press Enter)..."
                  : "Describe the bug, paste a traceback, click 🖥️ for screen context, 🎙️ for voice, or 📎 to attach..."
              }
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                resize: 'none',
                minHeight: '44px',
                maxHeight: '180px',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !pendingAttachment) || loading}
              style={{
                marginLeft: '0.75rem',
                padding: '0.55rem 1rem',
                backgroundColor: (input.trim() || pendingAttachment) && !loading ? 'var(--accent-blue)' : '#1e293b',
                color: (input.trim() || pendingAttachment) && !loading ? '#ffffff' : 'var(--text-muted)',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: (input.trim() || pendingAttachment) && !loading ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              <span>{loading ? 'Analyzing...' : 'Send'}</span>
              <span>↵</span>
            </button>
          </div>

          {/* Input helper & Voice/Vision hints */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span>Enter ↵ to send · Click 🖥️ for screen · Click 🎙️ for mic · Ctrl+V to paste screenshot</span>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <span
                style={{
                  color: voiceRecState === 'listening' ? '#ef4444' : voiceRecState === 'unsupported' ? 'var(--text-muted)' : 'var(--accent-cyan)',
                  fontWeight: 600,
                }}
              >
                {voiceRecState === 'listening' ? '🔴 Mic Active' : '🎙 Voice Ready'}
              </span>
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>📎 Vision Ready</span>
              <span
                style={{
                  color: pendingAttachment?.source === 'screen' ? 'var(--accent-cyan)' : screenState === 'unsupported' ? 'var(--text-muted)' : 'var(--accent-cyan)',
                  fontWeight: 600,
                }}
              >
                {pendingAttachment?.source === 'screen' ? '🖥️ Screen Active' : '🖥️ Screen Ready'}
              </span>
              <span style={{ color: '#a78bfa', fontWeight: 600 }}>⚡ Controlled Tools Ready (Phase 6)</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
