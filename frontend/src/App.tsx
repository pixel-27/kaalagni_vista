import { useState, useEffect, useRef } from 'react'
import { ChatMessageView } from './components/ChatMessageView'
import { DiagnosticTimeline } from './components/DiagnosticTimeline'
import { EvidencePanel } from './components/EvidencePanel'
import {
  IconPaperclip,
  IconMicrophone,
  IconMicrophoneActive,
  IconScreen,
  IconArrowUp,
  IconVolume,
  IconVolumeMute,
  IconShieldCheck,
  IconCheck,
  IconX,
  IconRefresh,
  IconEye,
  IconTerminal,
  IconSparkles,
} from './components/Icons'
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
  DiagnosticSession,
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

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')

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

  // Phase 7: Controlled Diagnostic System state
  const [diagnosticSession, setDiagnosticSession] = useState<DiagnosticSession | null>(null)
  const [isChallenging, setIsChallenging] = useState(false)

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
        res = await fetch(`${BACKEND_URL}/api/health`)
      } catch {
        if (!BACKEND_URL) {
          res = await fetch('http://127.0.0.1:8000/api/health')
        } else {
          throw new Error('Health check request failed')
        }
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

  const dispatchChatTurn = async (chatHistory: ChatMessage[], challenge: boolean = false): Promise<ChatResponse> => {
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
      challenge_diagnosis: challenge,
      diagnostic_session: diagnosticSession || undefined,
    }

    try {
      res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      if (!BACKEND_URL) {
        res = await fetch('http://127.0.0.1:8000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        throw err
      }
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

  const handleChallengeDiagnosis = async () => {
    if (loading || isChallenging || messages.length === 0) return
    setIsChallenging(true)
    setError(null)
    setDiagnosticState('analyzing')

    try {
      const challengeResponse = await dispatchChatTurn(messages, true)
      if (challengeResponse.diagnostic_session) {
        setDiagnosticSession(challengeResponse.diagnostic_session)
      }
      const nextHistory = [...messages, challengeResponse.message]
      setMessages(nextHistory)
      setLastModelUsed(`${challengeResponse.provider} · ${challengeResponse.model}`)
      if (autoSpeak && challengeResponse.message.content) {
        synthesisRef.current?.speak(challengeResponse.message.content)
        setCurrentlySpeakingText(challengeResponse.message.content)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to challenge diagnosis'
      setError(msg)
    } finally {
      setIsChallenging(false)
      setDiagnosticState('idle')
    }
  }

  const handleChatResponse = async (data: ChatResponse, currentHistory: ChatMessage[]) => {
    const nextHistory = [...currentHistory, data.message]
    setMessages(nextHistory)
    setLastModelUsed(`${data.provider} · ${data.model}`)

    if (data.diagnostic_session) {
      setDiagnosticSession(data.diagnostic_session)
    }

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
      label: approved
        ? `Running approved test target: ${String(call.arguments.test_target || '')}...`
        : 'Test execution denied by user',
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
      setDiagnosticSession(null)
      setMessages([])
      setError(null)
    }
  }

  // Renders the Command Bar Composer
  const renderComposer = (isCenteredLanding: boolean = false) => {
    return (
      <div
        className="glass-composer"
        style={{
          width: '100%',
          maxWidth: isCenteredLanding ? '720px' : '760px',
          margin: '0 auto',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          borderColor: isDragging ? 'var(--accent-primary)' : undefined,
          boxShadow: isDragging ? '0 0 20px rgba(59, 130, 246, 0.4)' : undefined,
        }}
      >
        {/* Pending Attachment / Screen Context Banner */}
        {pendingAttachment && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.45rem 0.75rem',
              backgroundColor:
                pendingAttachment.source === 'screen' ? 'rgba(6, 182, 212, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              border: `1px solid ${
                pendingAttachment.source === 'screen' ? 'var(--accent-cyan-border)' : 'rgba(59, 130, 246, 0.35)'
              }`,
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <img
                src={pendingAttachment.data}
                alt="Context thumbnail"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  objectFit: 'cover',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.76rem', color: '#f8fafc', fontWeight: 600 }}>
                  {pendingAttachment.source === 'screen' ? 'Captured Screen Context' : 'Attached Technical Screenshot'}
                </span>
                <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {pendingAttachment.filename || (pendingAttachment.source === 'screen' ? 'screen-snapshot.png' : 'screenshot.png')}
                  {pendingAttachment.size_bytes ? ` · ${(pendingAttachment.size_bytes / 1024).toFixed(1)} KB` : ''}
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    backgroundColor: 'rgba(6, 182, 212, 0.15)',
                    border: '1px solid var(--accent-cyan-border)',
                    color: 'var(--accent-cyan)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  <IconRefresh size={12} />
                  <span>Retake</span>
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
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'color 0.15s ease',
                }}
              >
                <IconX size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Text Input Area */}
        <textarea
          ref={textareaRef}
          rows={isCenteredLanding ? 3 : 2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={loading}
          placeholder={
            pendingAttachment
              ? pendingAttachment.source === 'screen'
                ? "Ask a technical question about what's on your screen..."
                : 'Ask a technical question about this screenshot...'
              : 'Ask VISTA anything, paste a stack trace, or attach context...'
          }
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            lineHeight: 1.55,
            resize: 'none',
            minHeight: isCenteredLanding ? '64px' : '44px',
            maxHeight: '180px',
          }}
        />

        {/* Command Bar Action Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
          {/* Left Action Buttons: Attachment, Screen, Voice */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
              title="Attach screenshot (PNG, JPEG, WEBP) or Ctrl+V"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 500,
                color:
                  pendingAttachment && pendingAttachment.source !== 'screen'
                    ? 'var(--accent-primary-light)'
                    : 'var(--text-secondary)',
                backgroundColor:
                  pendingAttachment && pendingAttachment.source !== 'screen'
                    ? 'var(--accent-primary-subtle)'
                    : 'transparent',
                border: '1px solid',
                borderColor:
                  pendingAttachment && pendingAttachment.source !== 'screen'
                    ? 'rgba(59, 130, 246, 0.4)'
                    : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconPaperclip size={15} />
              <span>Attach</span>
            </button>

            {/* Screen Context Button */}
            <button
              type="button"
              onClick={handleTriggerScreenCapture}
              disabled={
                loading ||
                screenState === 'unsupported' ||
                screenState === 'requesting_permission' ||
                screenState === 'capturing'
              }
              title={
                screenState === 'unsupported'
                  ? 'Screen capture not supported in this browser'
                  : 'Capture screen context (Click to share screen/window)'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 500,
                color:
                  pendingAttachment?.source === 'screen'
                    ? 'var(--accent-cyan)'
                    : screenState === 'unsupported'
                    ? 'var(--text-dim)'
                    : 'var(--text-secondary)',
                backgroundColor:
                  pendingAttachment?.source === 'screen' ? 'var(--accent-cyan-subtle)' : 'transparent',
                border: '1px solid',
                borderColor:
                  pendingAttachment?.source === 'screen' ? 'var(--accent-cyan-border)' : 'transparent',
                cursor: loading || screenState === 'unsupported' ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconScreen size={15} />
              <span>Screen</span>
            </button>

            {/* Microphone Voice Input Button */}
            <button
              type="button"
              onClick={toggleVoiceRecognition}
              disabled={loading || voiceRecState === 'unsupported'}
              title={
                voiceRecState === 'listening'
                  ? 'Stop voice recording'
                  : voiceRecState === 'unsupported'
                  ? 'Speech recognition not supported in this browser'
                  : 'Speak your question (Voice input)'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 500,
                color:
                  voiceRecState === 'listening'
                    ? 'var(--accent-rose)'
                    : lastInputMode === 'voice'
                    ? 'var(--accent-primary-light)'
                    : voiceRecState === 'unsupported'
                    ? 'var(--text-dim)'
                    : 'var(--text-secondary)',
                backgroundColor:
                  voiceRecState === 'listening'
                    ? 'var(--accent-rose-subtle)'
                    : lastInputMode === 'voice'
                    ? 'var(--accent-primary-subtle)'
                    : 'transparent',
                border: '1px solid',
                borderColor:
                  voiceRecState === 'listening'
                    ? 'var(--accent-rose-border)'
                    : lastInputMode === 'voice'
                    ? 'rgba(59, 130, 246, 0.4)'
                    : 'transparent',
                cursor: loading || voiceRecState === 'unsupported' ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {voiceRecState === 'listening' ? <IconMicrophoneActive size={15} /> : <IconMicrophone size={15} />}
              <span>{voiceRecState === 'listening' ? 'Listening' : 'Voice'}</span>
            </button>
          </div>

          {/* Right Action Button: Submit Arrow */}
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !pendingAttachment) || loading}
            title="Send query to VISTA"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor:
                (input.trim() || pendingAttachment) && !loading
                  ? 'var(--accent-primary)'
                  : 'rgba(255, 255, 255, 0.05)',
              color: (input.trim() || pendingAttachment) && !loading ? '#ffffff' : 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: (input.trim() || pendingAttachment) && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
              boxShadow:
                (input.trim() || pendingAttachment) && !loading ? '0 2px 10px rgba(59, 130, 246, 0.4)' : 'none',
            }}
          >
            <IconArrowUp size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Minimalist Engineering Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          padding: '0.65rem 1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '14px',
              color: '#ffffff',
              boxShadow: '0 0 10px rgba(59, 130, 246, 0.35)',
            }}
          >
            V
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.04em' }}>VISTA</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Visual Intelligence &amp; Spoken Technical Assistant
            </span>
          </div>
        </div>

        {/* Center / Model Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {lastModelUsed && (
            <span
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-primary-light)',
                backgroundColor: 'var(--accent-primary-subtle)',
                padding: '0.2rem 0.55rem',
                borderRadius: '4px',
                border: '1px solid rgba(59, 130, 246, 0.25)',
              }}
            >
              {lastModelUsed}
            </span>
          )}
        </div>

        {/* Right Actions: Auto-Speak, Clear, Health Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
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
              gap: '0.35rem',
              padding: '0.3rem 0.65rem',
              fontSize: '0.72rem',
              borderRadius: '6px',
              backgroundColor: autoSpeak ? 'var(--accent-primary-subtle)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${autoSpeak ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-subtle)'}`,
              color: autoSpeak ? 'var(--accent-primary-light)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {autoSpeak ? <IconVolume size={13} /> : <IconVolumeMute size={13} />}
            <span>Auto-Speak</span>
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              style={{
                fontSize: '0.72rem',
                padding: '0.3rem 0.65rem',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Reset
            </button>
          )}

          {/* System Status Pill */}
          <button
            type="button"
            onClick={() => setShowHealthModal(!showHealthModal)}
            title="Click to view backend telemetry and health status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.65rem',
              borderRadius: '9999px',
              backgroundColor:
                healthStatus === 'connected'
                  ? 'var(--accent-emerald-subtle)'
                  : healthStatus === 'checking'
                  ? 'var(--accent-amber-subtle)'
                  : 'var(--accent-rose-subtle)',
              border: `1px solid ${
                healthStatus === 'connected'
                  ? 'var(--accent-emerald-border)'
                  : healthStatus === 'checking'
                  ? 'var(--accent-amber-border)'
                  : 'var(--accent-rose-border)'
              }`,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor:
                  healthStatus === 'connected'
                    ? 'var(--accent-emerald)'
                    : healthStatus === 'checking'
                    ? 'var(--accent-amber)'
                    : 'var(--accent-rose)',
                boxShadow: healthStatus === 'connected' ? '0 0 6px var(--accent-emerald)' : 'none',
              }}
            />
            <span
              style={{
                fontSize: '0.68rem',
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
                ? `READY${latency ? ` (${latency}ms)` : ''}`
                : healthStatus === 'checking'
                ? 'CHECKING'
                : 'OFFLINE'}
            </span>
          </button>
        </div>
      </header>

      {/* Backend Telemetry Drawer (Phase 1 Health View) */}
      {showHealthModal && (
        <div
          style={{
            backgroundColor: '#0a0d14',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0.65rem 1.75rem',
            fontSize: '0.72rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <span>Backend: <strong style={{ color: '#fff' }}>{BACKEND_URL || 'http://127.0.0.1:8000'}</strong></span>
            <span>Status: <strong style={{ color: 'var(--accent-emerald)' }}>{health?.status || 'unknown'}</strong></span>
            <span>Version: <strong style={{ color: 'var(--accent-primary-light)' }}>{health?.version || '0.2.0'}</strong></span>
            <span>Environment: <strong>{health?.environment || 'development'}</strong></span>
            <span>Provider: <strong style={{ color: 'var(--accent-primary-light)' }}>{health?.ai_provider || 'gemini'}</strong></span>
            <span>Latency: <strong>{latency}ms</strong></span>
          </div>
          <button
            type="button"
            onClick={() => setShowHealthModal(false)}
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            ✕ Close
          </button>
        </div>
      )}

      {/* Main Viewport */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
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
        {isDragging && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(11, 13, 17, 0.88)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              border: '2px dashed var(--accent-primary)',
              margin: '1rem',
              borderRadius: '12px',
              gap: '0.5rem',
              pointerEvents: 'none',
            }}
          >
            <IconPaperclip size={32} style={{ color: 'var(--accent-primary-light)' }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Drop technical screenshot here
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              PNG, JPEG, or WEBP under 10MB
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          /* ==================================================
             MAIN LANDING / EMPTY STATE (Centered & Spacious)
             ================================================== */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '2.5rem 1.5rem',
              maxWidth: '840px',
              width: '100%',
              margin: '0 auto',
            }}
          >
            {/* Hero Heading */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--accent-primary-subtle)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  color: 'var(--accent-primary-light)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  marginBottom: '1rem',
                  textTransform: 'uppercase',
                }}
              >
                <IconSparkles size={12} />
                <span>AI Engineering & Diagnostic Workspace</span>
              </div>
              <h1
                style={{
                  fontSize: '2.25rem',
                  fontWeight: 600,
                  letterSpacing: '-0.025em',
                  color: '#f8fafc',
                  marginBottom: '0.65rem',
                  lineHeight: 1.2,
                }}
              >
                What are you solving?
              </h1>
              <p
                style={{
                  fontSize: '0.98rem',
                  color: 'var(--text-secondary)',
                  maxWidth: '520px',
                  margin: '0 auto',
                  lineHeight: 1.5,
                }}
              >
                Show me the problem. I&apos;ll investigate it with you.
              </p>
            </div>

            {/* Main Centered Command Bar Composer */}
            <div style={{ width: '100%', marginBottom: '2.5rem' }}>
              {renderComposer(true)}
            </div>

            {/* 3-Step Aligned Onboarding Section */}
            <div
              style={{
                width: '100%',
                maxWidth: '720px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1.25rem',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '1.75rem',
                marginBottom: '2rem',
              }}
            >
              {/* Step 1: SHOW */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}><IconEye size={15} /></span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                    SHOW
                  </span>
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Share a screenshot, image, or screen context.
                </p>
              </div>

              {/* Step 2: ASK */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ color: 'var(--accent-primary-light)' }}><IconTerminal size={15} /></span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                    ASK
                  </span>
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Describe what you want VISTA to investigate.
                </p>
              </div>

              {/* Step 3: VERIFY */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ color: 'var(--accent-emerald)' }}><IconShieldCheck size={15} /></span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                    VERIFY
                  </span>
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Review evidence and approve controlled checks.
                </p>
              </div>
            </div>

            {/* Quick Starters / Scenarios */}
            <div style={{ width: '100%', maxWidth: '720px' }}>
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: '0.65rem',
                }}
              >
                Suggested Scenarios
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {QUICK_STARTERS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendMessage(s.prompt)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.74rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)'
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.35)'
                      e.currentTarget.style.color = '#f1f5f9'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'
                      e.currentTarget.style.borderColor = 'var(--border-subtle)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                  >
                    <span>{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ==================================================
             CHAT WORKSPACE (Spacious & Technical)
             ================================================== */
          <div
            style={{
              flex: 1,
              maxWidth: '860px',
              width: '100%',
              margin: '0 auto',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Phase 7: Diagnostic Timeline & Evidence Telemetry Panel */}
            {diagnosticSession && (
              <div style={{ marginBottom: '1rem' }}>
                <DiagnosticTimeline
                  timeline={diagnosticSession.timeline}
                  currentState={diagnosticSession.current_state}
                />
                <EvidencePanel
                  session={diagnosticSession}
                  onChallengeDiagnosis={handleChallengeDiagnosis}
                  isChallenging={isChallenging}
                />
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((m, idx) => (
              <ChatMessageView
                key={idx}
                message={m}
                modelName={m.role === 'assistant' ? lastModelUsed : undefined}
                onSpeak={m.role === 'assistant' ? (content) => handleToggleSpeak(content) : undefined}
                isSpeaking={voicePlayState === 'speaking' && currentlySpeakingText === m.content}
              />
            ))}

            {/* Analyzing / Investigation Status Banner */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.85rem 0' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
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
                  className="glass-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.78rem',
                    color: 'var(--accent-primary-light)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary-light)',
                      animation: 'pulse-dot 1.4s infinite ease-in-out',
                    }}
                  />
                  <span>
                    {diagnosticState === 'uploading'
                      ? 'Uploading image & diagnostic context...'
                      : diagnosticState === 'analyzing'
                      ? 'Analyzing visual screenshot & error telemetry...'
                      : diagnosticState === 'responding'
                      ? 'Formulating technical remediation plan...'
                      : 'VISTA is investigating technical context...'}
                  </span>
                </div>
              </div>
            )}

            {/* Controlled Tool Human Approval Card (Execution Tools: run_test) */}
            {pendingToolCall && (
              <div
                className="glass-panel"
                style={{
                  margin: '1rem 0',
                  padding: '1.15rem 1.35rem',
                  borderRadius: '10px',
                  border: '1px solid var(--accent-amber-border)',
                  backgroundColor: 'rgba(245, 158, 11, 0.06)',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    <IconShieldCheck size={18} style={{ color: 'var(--accent-amber)' }} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>
                      ACTION REQUIRES YOUR APPROVAL
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: 'var(--accent-amber-subtle)',
                      color: 'var(--accent-amber)',
                      border: '1px solid var(--accent-amber-border)',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    CONTROLLED EXECUTION
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Action: </span>
                    <strong style={{ color: 'var(--accent-primary-light)', fontFamily: 'var(--font-mono)' }}>
                      Run{' '}
                      {pendingToolCall.arguments.test_target === 'backend_tests'
                        ? 'Backend Test Suite'
                        : pendingToolCall.arguments.test_target === 'frontend_tests'
                        ? 'Frontend Unit Tests'
                        : 'Frontend Production Build'}{' '}
                      ({String(pendingToolCall.arguments.test_target || '')})
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Purpose: </span>
                    <span style={{ color: '#e2e8f0' }}>Verify whether the suspected backend issue is reproducible.</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Why: </span>
                    <span style={{ color: '#cbd5e1' }}>The current evidence suggests a backend dependency or schema anomaly.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handleConfirmToolExecution(pendingToolCall, false)}
                    disabled={loading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 1rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <IconX size={13} />
                    <span>Deny</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmToolExecution(pendingToolCall, true)}
                    disabled={loading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 1.15rem',
                      backgroundColor: 'var(--accent-primary)',
                      border: '1px solid var(--accent-primary)',
                      color: '#ffffff',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <IconCheck size={13} />
                    <span>Allow &amp; Execute</span>
                  </button>
                </div>
              </div>
            )}

            {/* Active Tool Activity Indicator */}
            {activeToolActivity && (
              <div
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.45rem 0.85rem',
                  margin: '0.5rem 0',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span style={{ color: 'var(--accent-primary-light)' }}>
                  <IconTerminal size={14} />
                </span>
                <span>{activeToolActivity.label || `Running ${activeToolActivity.tool}...`}</span>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div
                style={{
                  backgroundColor: 'var(--accent-rose-subtle)',
                  border: '1px solid var(--accent-rose-border)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  margin: '0.75rem 0',
                  color: 'var(--accent-rose)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong>Diagnostic Error:</strong> {error}
                </div>
                <button
                  type="button"
                  onClick={() => sendMessage(messages[messages.length - 1]?.content)}
                  style={{
                    padding: '0.25rem 0.65rem',
                    backgroundColor: 'rgba(244, 63, 94, 0.2)',
                    color: 'var(--accent-rose)',
                    borderRadius: '4px',
                    border: '1px solid var(--accent-rose-border)',
                    fontSize: '0.72rem',
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
      </main>

      {/* Screen/Voice Live Context Toasts */}
      {(screenState === 'requesting_permission' ||
        screenState === 'capturing' ||
        voiceRecState === 'listening' ||
        interimTranscript ||
        screenErrorMessage ||
        voiceErrorMessage) && (
        <div
          style={{
            padding: '0.45rem 1.75rem',
            backgroundColor: 'rgba(12, 16, 24, 0.95)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            flexShrink: 0,
          }}
        >
          {/* Active Voice Listening */}
          {(voiceRecState === 'listening' || interimTranscript) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-rose)',
                    animation: 'pulse-dot 1s infinite ease-in-out',
                  }}
                />
                <span style={{ color: 'var(--accent-rose)', fontWeight: 600 }}>Listening:</span>
                <span style={{ color: '#ffffff', fontStyle: interimTranscript ? 'italic' : 'normal' }}>
                  {interimTranscript ? `"${interimTranscript}"` : 'Speak into your microphone...'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => recognitionRef.current?.stop()}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.25)',
                  border: '1px solid var(--accent-rose-border)',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontWeight: 600,
                }}
              >
                Done Speaking
              </button>
            </div>
          )}

          {/* Screen Requesting Permission Banner */}
          {(screenState === 'requesting_permission' || screenState === 'capturing') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.76rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-cyan)',
                  animation: 'pulse-dot 1.2s infinite ease-in-out',
                }}
              />
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Screen Context:</span>
              <span style={{ color: '#ffffff' }}>
                {screenState === 'requesting_permission'
                  ? 'Awaiting screen/window selection in browser dialog...'
                  : 'Capturing screen context frame...'}
              </span>
            </div>
          )}

          {/* Error messages */}
          {screenErrorMessage && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--accent-amber)' }}>
              <span>Screen Error: {screenErrorMessage}</span>
              <button type="button" onClick={() => setScreenErrorMessage(null)} style={{ color: 'var(--accent-amber)' }}>✕</button>
            </div>
          )}
          {voiceErrorMessage && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--accent-amber)' }}>
              <span>Voice Error: {voiceErrorMessage}</span>
              <button type="button" onClick={() => setVoiceErrorMessage(null)} style={{ color: 'var(--accent-amber)' }}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Composer Dock (When in Chat View) */}
      {messages.length > 0 && (
        <footer
          style={{
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            padding: '0.75rem 1.5rem',
            flexShrink: 0,
          }}
        >
          {renderComposer(false)}
        </footer>
      )}
    </div>
  )
}
