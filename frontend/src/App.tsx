import { useState, useEffect, useRef } from 'react'
import { ChatMessageView } from './components/ChatMessageView'
import type { ChatMessage, ChatResponse, HealthData } from './types'

const QUICK_STARTERS = [
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
  {
    title: 'React State Desync',
    subtitle: 'Infinite re-render in useEffect',
    prompt: 'My React component is stuck in an infinite re-render loop inside a useEffect hook. How do I properly structure the dependency array?',
  },
]

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastModelUsed, setLastModelUsed] = useState<string>('')
  const [showHealthModal, setShowHealthModal] = useState(false)

  // Health telemetry state (preserved from Phase 1)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthStatus, setHealthStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [latency, setLatency] = useState<number | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const sendMessage = async (textToSend?: string) => {
    const content = (textToSend || input).trim()
    if (!content || loading) return

    setError(null)
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    const updatedHistory = [...messages, userMessage]
    setMessages(updatedHistory)
    setInput('')
    setLoading(true)

    try {
      let res: Response
      const payload = {
        messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
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
          // ignore json parse error
        }
        throw new Error(errDetail)
      }

      const data: ChatResponse = await res.json()
      setMessages([...updatedHistory, data.message])
      setLastModelUsed(`${data.provider} · ${data.model}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to communicate with VISTA backend'
      setError(msg)
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
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
                  color: 'var(--accent-blue)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  border: '1px solid #334155',
                }}
              >
                Text AI
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

      {/* Multimodal Context Bar (Phase 3 & 6 Preview) */}
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
          <span style={{ color: 'var(--text-secondary)' }}>None attached (Text troubleshooting active)</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span
            style={{
              padding: '0.15rem 0.45rem',
              backgroundColor: '#151d2d',
              borderRadius: '4px',
              border: '1px dashed #202b3f',
              fontSize: '0.68rem',
            }}
          >
            📷 Screenshot Upload (Phase 3)
          </span>
          <span
            style={{
              padding: '0.15rem 0.45rem',
              backgroundColor: '#151d2d',
              borderRadius: '4px',
              border: '1px dashed #202b3f',
              fontSize: '0.68rem',
            }}
          >
            🖥 Screen Share (Phase 6)
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
                <ChatMessageView key={idx} message={m} modelName={m.role === 'assistant' ? lastModelUsed : undefined} />
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
                    <span>VISTA is analyzing the technical context...</span>
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
      >
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              transition: 'border-color 0.2s',
            }}
            onFocus={() => {
              const dock = textareaRef.current?.parentElement
              if (dock) dock.style.borderColor = 'var(--border-active)'
            }}
            onBlur={() => {
              const dock = textareaRef.current?.parentElement
              if (dock) dock.style.borderColor = 'var(--border-subtle)'
            }}
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Describe the bug, paste an error traceback, or ask a technical diagnostic question..."
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
              disabled={!input.trim() || loading}
              style={{
                marginLeft: '0.75rem',
                padding: '0.55rem 1rem',
                backgroundColor: input.trim() && !loading ? 'var(--accent-blue)' : '#1e293b',
                color: input.trim() && !loading ? '#ffffff' : 'var(--text-muted)',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              <span>{loading ? 'Analyzing...' : 'Send'}</span>
              <span>↵</span>
            </button>
          </div>

          {/* Input helper & Voice/Vision hints */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span>Enter ↵ to send · Shift+Enter for new line</span>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <span>🎙 Voice (Phase 5)</span>
              <span>📎 Vision (Phase 3)</span>
              <span>⚡ Controlled Tools (Phase 7)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
