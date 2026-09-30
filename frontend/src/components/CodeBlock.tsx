import { useState, type ReactNode } from 'react'
import { IconCopy, IconCheck } from './Icons'

interface CodeBlockProps {
  children?: ReactNode
  className?: string
}

export function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const language = className ? className.replace(/language-/, '') : 'code'
  const codeText = String(children).replace(/\n$/, '')

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback if clipboard API is restricted
    }
  }

  // If no language class and no line breaks, treat as inline code snippet
  const isInline = !className && !codeText.includes('\n')
  if (isInline) {
    return (
      <code
        style={{
          fontFamily: 'var(--font-mono)',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          color: '#e2e8f0',
          padding: '0.15rem 0.45rem',
          borderRadius: '4px',
          fontSize: '0.85em',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {children}
      </code>
    )
  }

  return (
    <div
      style={{
        margin: '0.85rem 0',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        backgroundColor: '#07090e',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.4rem 0.85rem',
          backgroundColor: '#0e1219',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '0.68rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{language.toUpperCase()}</span>
        <button
          type="button"
          onClick={copyToClipboard}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'transparent',
            color: copied ? 'var(--accent-emerald)' : 'var(--text-secondary)',
            fontSize: '0.7rem',
            padding: '0.15rem 0.45rem',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Copy code snippet to clipboard"
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '0.85rem 1rem',
          overflowX: 'auto',
          fontSize: '0.82rem',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.6,
          color: '#e2e8f0',
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  )
}
