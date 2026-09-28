import { useState, useEffect } from 'react'

interface HealthData {
  status: string
  project: string
  version: string
  timestamp: string
  environment: string
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [latency, setLatency] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [lastChecked, setLastChecked] = useState<string>('')
  const [logs, setLogs] = useState<Array<{ time: string; msg: string; type: 'info' | 'success' | 'error' }>>([])

  const addLog = (msg: string, type: 'info' | 'success' | 'error') => {
    const time = new Date().toLocaleTimeString()
    setLogs((prev) => [{ time, msg, type }, ...prev.slice(0, 19)])
  }

  const checkHealth = async () => {
    setStatus('checking')
    setErrorMessage('')
    const start = performance.now()
    addLog('Checking FastAPI /api/health endpoint...', 'info')

    try {
      // Try direct route through Vite proxy first, fallback to direct port 8000
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
        setStatus('connected')
        setLastChecked(new Date().toLocaleTimeString())
        addLog(`Connected to ${data.project} (v${data.version}) in ${elapsed}ms`, 'success')
      } else {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reach FastAPI backend'
      setStatus('error')
      setErrorMessage(msg)
      addLog(`Health check failed: ${msg}`, 'error')
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '18px',
              color: '#ffffff',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)',
            }}
          >
            V
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.05em' }}>VISTA</h1>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: 'var(--accent-blue)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  border: '1px solid #334155',
                }}
              >
                Phase 1: Foundation
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Visual Intelligence & Spoken Technical Assistant
            </p>
          </div>
        </div>

        {/* System Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {latency !== null && status === 'connected' && (
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              Latency: <span style={{ color: 'var(--accent-emerald)' }}>{latency}ms</span>
            </span>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.85rem',
              borderRadius: '9999px',
              backgroundColor:
                status === 'connected'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : status === 'checking'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(244, 63, 94, 0.1)',
              border: `1px solid ${
                status === 'connected'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : status === 'checking'
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(244, 63, 94, 0.3)'
              }`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor:
                  status === 'connected'
                    ? 'var(--accent-emerald)'
                    : status === 'checking'
                    ? 'var(--accent-amber)'
                    : 'var(--accent-rose)',
                boxShadow:
                  status === 'connected'
                    ? '0 0 8px var(--accent-emerald)'
                    : status === 'checking'
                    ? '0 0 8px var(--accent-amber)'
                    : '0 0 8px var(--accent-rose)',
              }}
            />
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color:
                  status === 'connected'
                    ? 'var(--accent-emerald)'
                    : status === 'checking'
                    ? 'var(--accent-amber)'
                    : 'var(--accent-rose)',
                letterSpacing: '0.05em',
              }}
            >
              {status === 'connected'
                ? 'SYSTEM READY'
                : status === 'checking'
                ? 'CONNECTING...'
                : 'DISCONNECTED'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main style={{ flex: 1, padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Verification Status Banner */}
        <section
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Phase 1 Foundation: Frontend-Backend Handshake
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Verifying live communication between React (Vite/TypeScript) and FastAPI (Python 3.12 / Uvicorn).
            </p>
          </div>
          <button
            onClick={checkHealth}
            disabled={status === 'checking'}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#1e293b',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              border: '1px solid #334155',
              fontSize: '0.8rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
          >
            <span>↻</span>
            <span>{status === 'checking' ? 'Testing...' : 'Re-check Connection'}</span>
          </button>
        </section>

        {/* Diagnostic Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Health Details Card */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Backend Health Payload
              </span>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {lastChecked ? `Checked at ${lastChecked}` : ''}
              </span>
            </div>

            {status === 'connected' && health ? (
              <div
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '6px',
                  padding: '1rem',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>status: </span>
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>"{health.status}"</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>project: </span>
                  <span style={{ color: 'var(--accent-cyan)' }}>"{health.project}"</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>version: </span>
                  <span style={{ color: 'var(--accent-blue)' }}>"{health.version}"</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>environment: </span>
                  <span style={{ color: '#e2e8f0' }}>"{health.environment}"</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>server_time: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>"{health.timestamp}"</span>
                </div>
              </div>
            ) : status === 'checking' ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Probing FastAPI backend...
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: '6px',
                  padding: '1rem',
                  color: 'var(--accent-rose)',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Connection Error:</strong> {errorMessage}
              </div>
            )}

            {/* Architecture checklist */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                STACK VERIFICATION CHECKLIST
              </div>
              <ul style={{ listStyle: 'none', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--accent-emerald)' }}>✓</span>
                  <span>Python 3.12 (via uv managed toolchain)</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--accent-emerald)' }}>✓</span>
                  <span>FastAPI + Pydantic v2 Backend API</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--accent-emerald)' }}>✓</span>
                  <span>React 19 + TypeScript + Vite Frontend</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: status === 'connected' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                    {status === 'connected' ? '✓' : '○'}
                  </span>
                  <span>Live Frontend-to-Backend HTTP Link</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Activity / Event Logs */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                System Activity Log
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Real-time telemetry</span>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: '180px',
                maxHeight: '260px',
                overflowY: 'auto',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              {logs.map((log, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>[{log.time}]</span>
                  <span
                    style={{
                      color:
                        log.type === 'success'
                          ? 'var(--accent-emerald)'
                          : log.type === 'error'
                          ? 'var(--accent-rose)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Multimodal Interface Skeleton (Ready for Phase 2 - Phase 6) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flex: 1 }}>
          {/* Visual Context Panel (Phase 3 placeholder) */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '10px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              textAlign: 'center',
              minHeight: '200px',
            }}
          >
            <div style={{ fontSize: '2rem' }}>🖥</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Visual Context Viewport</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
              Screenshots, screen sharing, and technical diagrams will be rendered here for multimodal AI analysis.
            </p>
            <span
              style={{
                fontSize: '0.65rem',
                padding: '0.2rem 0.5rem',
                backgroundColor: '#1e293b',
                color: 'var(--accent-cyan)',
                borderRadius: '4px',
                border: '1px solid #334155',
              }}
            >
              Activates in Phase 3
            </span>
          </div>

          {/* Conversation Panel (Phase 2 & 4 placeholder) */}
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '10px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              textAlign: 'center',
              minHeight: '200px',
            }}
          >
            <div style={{ fontSize: '2rem' }}>💬</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Technical Troubleshooting Dialogue</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
              Natural language technical reasoning, follow-ups, and tool verification traces will appear here.
            </p>
            <span
              style={{
                fontSize: '0.65rem',
                padding: '0.2rem 0.5rem',
                backgroundColor: '#1e293b',
                color: 'var(--accent-cyan)',
                borderRadius: '4px',
                border: '1px solid #334155',
              }}
            >
              Activates in Phase 2
            </span>
          </div>
        </div>
      </main>

      {/* Persistent Bottom Status & Controls Bar */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          padding: '0.85rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Agent State:
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.15rem 0.5rem',
              backgroundColor: '#1e293b',
              borderRadius: '4px',
              color: status === 'connected' ? 'var(--accent-emerald)' : 'var(--text-muted)',
            }}
          >
            {status === 'connected' ? '● IDLE (READY)' : '○ INITIALIZING'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            disabled
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              opacity: 0.6,
              cursor: 'not-allowed',
            }}
          >
            🎙 Voice (Phase 5)
          </button>
          <button
            disabled
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              opacity: 0.6,
              cursor: 'not-allowed',
            }}
          >
            🖥 Share Screen (Phase 6)
          </button>
          <button
            disabled
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              opacity: 0.6,
              cursor: 'not-allowed',
            }}
          >
            📎 Upload (Phase 3)
          </button>
        </div>
      </footer>
    </div>
  )
}
