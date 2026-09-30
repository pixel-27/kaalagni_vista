import ReactMarkdown from 'react-markdown'
import { CodeBlock } from './CodeBlock'
import type { ChatMessage } from '../types'
import {
  IconScreen,
  IconPaperclip,
  IconMicrophone,
  IconVolume,
  IconStop,
  IconClock,
  IconSearch,
  IconFileText,
  IconStethoscope,
  IconFlask,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconTerminal,
} from './Icons'

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

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'read_file':
        return <IconFileText size={15} />
      case 'search_code':
        return <IconSearch size={15} />
      case 'analyze_error':
        return <IconStethoscope size={15} />
      case 'run_test':
        return <IconFlask size={15} />
      default:
        return <IconTerminal size={15} />
    }
  }

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
          margin: '0.75rem 0',
          gap: '0.35rem',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: 'var(--accent-primary-light)', letterSpacing: '0.04em' }}>
            DIAGNOSTIC TOOL RESULT
          </span>
          {formattedTime && <span style={{ fontFamily: 'var(--font-mono)' }}>{formattedTime}</span>}
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: '94%',
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid ${
              status === 'success'
                ? 'var(--accent-emerald-border)'
                : status === 'denied'
                ? 'var(--accent-amber-border)'
                : 'var(--accent-rose-border)'
            }`,
            borderRadius: '8px',
            overflow: 'hidden',
            fontSize: '0.8rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            style={{
              padding: '0.45rem 0.85rem',
              backgroundColor:
                status === 'success'
                  ? 'var(--accent-emerald-subtle)'
                  : status === 'denied'
                  ? 'var(--accent-amber-subtle)'
                  : 'var(--accent-rose-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--accent-primary-light)' }}>{getToolIcon(toolName)}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{toolName}</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              {duration && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <IconClock size={12} />
                  <span>{duration}</span>
                </span>
              )}
              <span
                style={{
                  fontSize: '0.66rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '4px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  backgroundColor:
                    status === 'success'
                      ? 'rgba(16, 185, 129, 0.2)'
                      : status === 'denied'
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)',
                  color: status === 'success' ? '#34d399' : status === 'denied' ? '#fbbf24' : '#f87171',
                  border: `1px solid ${
                    status === 'success'
                      ? 'var(--accent-emerald-border)'
                      : status === 'denied'
                      ? 'var(--accent-amber-border)'
                      : 'var(--accent-rose-border)'
                  }`,
                }}
              >
                {status === 'success' ? (
                  <>
                    <IconCheck size={11} />
                    <span>COMPLETED</span>
                  </>
                ) : status === 'denied' ? (
                  <>
                    <IconX size={11} />
                    <span>DENIED</span>
                  </>
                ) : (
                  <>
                    <IconAlertTriangle size={11} />
                    <span>ERROR</span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div style={{ padding: '0.65rem 0.85rem' }}>
            {tr?.error ? (
              <div
                style={{
                  color: status === 'denied' ? 'var(--accent-amber)' : 'var(--accent-rose)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.76rem',
                  lineHeight: 1.45,
                }}
              >
                {tr.error}
              </div>
            ) : tr?.output ? (
              <details open style={{ cursor: 'pointer' }}>
                <summary
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.7rem',
                    marginBottom: '0.35rem',
                    userSelect: 'none',
                    fontWeight: 500,
                  }}
                >
                  Inspection Telemetry (Click to toggle)
                </summary>
                <pre
                  style={{
                    margin: 0,
                    padding: '0.55rem',
                    backgroundColor: '#080a0f',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.74rem',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#e2e8f0',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output, null, 2)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {message.input_mode === 'voice' && (
            <span
              style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: 'var(--accent-cyan-subtle)',
                color: 'var(--accent-cyan)',
                border: '1px solid var(--accent-cyan-border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              title="Query submitted via voice input"
            >
              <IconMicrophone size={11} />
              <span>Spoken</span>
            </span>
          )}
          {formattedTime && <span style={{ fontFamily: 'var(--font-mono)' }}>{formattedTime}</span>}
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>YOU</span>
        </div>

        <div
          style={{
            maxWidth: '82%',
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: '10px 10px 2px 10px',
            padding: '0.85rem 1.15rem',
            color: 'var(--text-primary)',
            fontSize: '0.88rem',
            lineHeight: 1.55,
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {message.attachments.map((att, idx) => {
                const src = att.data.startsWith('data:') ? att.data : `data:${att.mime_type};base64,${att.data}`
                const sizeLabel = att.size_bytes ? `${(att.size_bytes / 1024).toFixed(1)} KB` : null

                return (
                  <div
                    key={idx}
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.7rem',
                        color: 'var(--accent-cyan)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {att.source === 'screen' ? <IconScreen size={13} /> : <IconPaperclip size={13} />}
                        <strong>
                          {att.filename || (att.source === 'screen' ? 'Captured Screen Context' : 'Attached Screenshot')}
                        </strong>
                      </span>
                      {sizeLabel && (
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{sizeLabel}</span>
                      )}
                    </div>
                    <img
                      src={src}
                      alt={att.filename || 'Attached technical screenshot'}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '340px',
                        display: 'block',
                        objectFit: 'contain',
                        backgroundColor: '#07090e',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
        </div>
      </div>
    )
  }

  // Assistant Response
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        margin: '1.25rem 0',
        gap: '0.45rem',
        width: '100%',
      }}
    >
      {/* Header Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%' }}>
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
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.35)',
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
              fontSize: '0.66rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.12rem 0.45rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--accent-primary-light)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
            }}
          >
            {modelName}
          </span>
        )}
        {onSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(message.content)}
            title={isSpeaking ? 'Stop speech playback' : 'Read VISTA response aloud with text-to-speech'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.15rem 0.45rem',
              fontSize: '0.7rem',
              borderRadius: '4px',
              backgroundColor: isSpeaking ? 'var(--accent-rose-subtle)' : 'rgba(255, 255, 255, 0.05)',
              border: isSpeaking ? '1px solid var(--accent-rose-border)' : '1px solid var(--border-subtle)',
              color: isSpeaking ? 'var(--accent-rose)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isSpeaking ? <IconStop size={12} /> : <IconVolume size={12} />}
            <span>{isSpeaking ? 'Stop' : 'Speak'}</span>
          </button>
        )}
        {formattedTime && (
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
            {formattedTime}
          </span>
        )}
      </div>

      {/* Assistant Body Container */}
      <div
        style={{
          width: '100%',
          backgroundColor: 'var(--bg-surface)',
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
              return (
                <h3 style={{ fontSize: '0.92rem', margin: '0.55rem 0 0.3rem', color: 'var(--accent-primary-light)', fontWeight: 600 }}>
                  {children}
                </h3>
              )
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
                    borderLeft: '3px solid var(--accent-primary)',
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

        {/* Controlled Tool Call Requests from LLM */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--accent-primary-light)',
                fontWeight: 600,
                marginBottom: '0.4rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <IconTerminal size={14} />
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
                    fontSize: '0.74rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    color: '#f1f5f9',
                  }}
                >
                  <span style={{ color: 'var(--accent-primary-light)' }}>{getToolIcon(tc.tool)}</span>
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
