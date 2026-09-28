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

  const formattedTime = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''

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
      </div>
    </div>
  )
}
