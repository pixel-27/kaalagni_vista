import ReactMarkdown from 'react-markdown'
import { CodeBlock } from './CodeBlock'
import type { ChatMessage } from '../types'

interface ChatMessageViewProps {
  message: ChatMessage
  modelName?: string
  onSpeak?: (content: string) => void
  isSpeaking?: boolean
}

export function ChatMessageView({ message, modelName, onSpeak, isSpeaking }: ChatMessageViewProps) {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'

  const formattedTime = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''

  if (isTool) {
    const tr = message.tool_result
    const toolName = tr?.tool || message.tool_call_id || 'diagnostic_tool'
    const status = tr?.status || 'success'
    const duration = tr?.duration_seconds ? `${tr.duration_seconds}s` : null

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          margin: '0.85rem 0',
          gap: '0.35rem',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: '#a78bfa' }}>⚡ DIAGNOSTIC TOOL RESULT</span>
          {formattedTime && <span>{formattedTime}</span>}
        </div>
        <div
          style={{
            width: '100%',
            maxWidth: '92%',
            backgroundColor: '#0f172a',
            border: `1px solid ${status === 'success' ? 'rgba(16, 185, 129, 0.35)' : status === 'denied' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: '8px',
            overflow: 'hidden',
            fontSize: '0.82rem',
          }}
        >
          <div
            style={{
              padding: '0.45rem 0.85rem',
              backgroundColor: status === 'success' ? 'rgba(16, 185, 129, 0.1)' : status === 'denied' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: '#f1f5f9' }}>
              <span>{toolName === 'read_file' ? '📄' : toolName === 'search_code' ? '🔍' : toolName === 'analyze_error' ? '🩺' : '🧪'}</span>
              <span>{toolName}</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {duration && (
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  ⏱️ {duration}
                </span>
              )}
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '4px',
                  fontWeight: 600,
                  backgroundColor: status === 'success' ? 'rgba(16, 185, 129, 0.2)' : status === 'denied' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.2)',
                  color: status === 'success' ? '#34d399' : status === 'denied' ? '#fbbf24' : '#f87171',
                }}
              >
                {status === 'success' ? '✅ COMPLETED' : status === 'denied' ? '🚫 DENIED' : '❌ ERROR'}
              </span>
            </div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem' }}>
            {tr?.error ? (
              <div style={{ color: status === 'denied' ? '#fbbf24' : '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                {tr.error}
              </div>
            ) : tr?.output ? (
              <details open style={{ cursor: 'pointer' }}>
                <summary style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.35rem', userSelect: 'none' }}>
                  Inspection Telemetry (Click to collapse)
                </summary>
                <pre
                  style={{
                    margin: 0,
                    padding: '0.5rem',
                    backgroundColor: '#0a0f18',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#e2e8f0',
                  }}
                >
                  {typeof tr.output === 'string'
                    ? tr.output
                    : JSON.stringify(tr.output, null, 2)}
                </pre>
              </details>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>{message.content}</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isUser) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          margin: '1rem 0',
          gap: '0.35rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {message.input_mode === 'voice' && (
            <span
              style={{
                fontSize: '0.66rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              title="Query submitted via voice input"
            >
              🎙 Spoken
            </span>
          )}
          {formattedTime && <span>{formattedTime}</span>}
          <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>YOU</span>
        </div>
        <div
          style={{
            maxWidth: '82%',
            backgroundColor: '#162235',
            border: '1px solid #1e3a5f',
            borderRadius: '12px 12px 2px 12px',
            padding: '0.85rem 1.15rem',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            lineHeight: 1.55,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {message.attachments.map((att, idx) => {
                const src = att.data.startsWith('data:')
                  ? att.data
                  : `data:${att.mime_type};base64,${att.data}`
                const sizeLabel = att.size_bytes
                  ? `${(att.size_bytes / 1024).toFixed(1)} KB`
                  : null

                return (
                  <div
                    key={idx}
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.72rem',
                        color: 'var(--accent-cyan)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{att.source === 'screen' ? '🖥️' : '📷'}</span>
                        <strong>
                          {att.filename || (att.source === 'screen' ? 'Captured Screen Context' : 'Attached Screenshot')}
                        </strong>
                      </span>
                      {sizeLabel && (
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {sizeLabel}
                        </span>
                      )}
                    </div>
                    <img
                      src={src}
                      alt={att.filename || 'Attached technical screenshot'}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '360px',
                        display: 'block',
                        objectFit: 'contain',
                        backgroundColor: '#0a0f18',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content}
          </div>
        </div>

      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        margin: '1.25rem 0',
        gap: '0.45rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '13px',
            color: '#ffffff',
            boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)',
          }}
        >
          V
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
          VISTA
        </span>
        {modelName && (
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.1rem 0.45rem',
              borderRadius: '4px',
              backgroundColor: '#172033',
              color: 'var(--accent-blue)',
              border: '1px solid #1e2d4a',
            }}
          >
            {modelName}
          </span>
        )}
        {onSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(message.content)}
            title={isSpeaking ? 'Stop text-to-speech audio playback' : 'Read VISTA response aloud with text-to-speech'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.15rem 0.5rem',
              fontSize: '0.72rem',
              borderRadius: '4px',
              backgroundColor: isSpeaking ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: isSpeaking ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              color: isSpeaking ? '#f43f5e' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span>{isSpeaking ? '⏹' : '🔊'}</span>
            <span>{isSpeaking ? 'Stop' : 'Speak'}</span>
          </button>
        )}
        {formattedTime && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {formattedTime}
          </span>
        )}
      </div>

      <div
        style={{
          width: '100%',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '2px 12px 12px 12px',
          padding: '1.15rem 1.35rem',
          color: 'var(--text-primary)',
          fontSize: '0.88rem',
          lineHeight: 1.65,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        }}
      >
        <ReactMarkdown
          components={{
            code({ className, children }) {
              return <CodeBlock className={className}>{children}</CodeBlock>
            },
            h1({ children }) {
              return <h1 style={{ fontSize: '1.2rem', margin: '0.75rem 0 0.4rem', color: '#f8fafc', fontWeight: 600 }}>{children}</h1>
            },
            h2({ children }) {
              return <h2 style={{ fontSize: '1.05rem', margin: '0.65rem 0 0.35rem', color: '#f1f5f9', fontWeight: 600 }}>{children}</h2>
            },
            h3({ children }) {
              return <h3 style={{ fontSize: '0.95rem', margin: '0.55rem 0 0.3rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>{children}</h3>
            },
            p({ children }) {
              return <p style={{ margin: '0.45rem 0' }}>{children}</p>
            },
            ul({ children }) {
              return <ul style={{ margin: '0.45rem 0 0.45rem 1.25rem', paddingLeft: '0.5rem' }}>{children}</ul>
            },
            ol({ children }) {
              return <ol style={{ margin: '0.45rem 0 0.45rem 1.25rem', paddingLeft: '0.5rem' }}>{children}</ol>
            },
            li({ children }) {
              return <li style={{ margin: '0.25rem 0' }}>{children}</li>
            },
            blockquote({ children }) {
              return (
                <blockquote
                  style={{
                    borderLeft: '3px solid var(--accent-cyan)',
                    paddingLeft: '0.85rem',
                    margin: '0.75rem 0',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                  }}
                >
                  {children}
                </blockquote>
              )
            },
            strong({ children }) {
              return <strong style={{ color: '#ffffff', fontWeight: 600 }}>{children}</strong>
            },
          }}
        >
          {message.content}
        </ReactMarkdown>

        {message.tool_calls && message.tool_calls.length > 0 && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>🔧</span>
              <span>Requested Controlled Diagnostic Action:</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {message.tool_calls.map((tc, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'rgba(167, 139, 250, 0.12)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(167, 139, 250, 0.35)',
                    color: '#f1f5f9',
                  }}
                >
                  <span>{tc.tool === 'read_file' ? '📄' : tc.tool === 'search_code' ? '🔍' : tc.tool === 'analyze_error' ? '🩺' : '🧪'}</span>
                  <strong>{tc.tool}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{JSON.stringify(tc.arguments)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
