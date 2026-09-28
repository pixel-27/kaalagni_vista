import { useState, type ReactNode } from 'react'

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
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          color: 'var(--accent-blue)',
          padding: '0.15rem 0.4rem',
          borderRadius: '4px',
          fontSize: '0.85em',
          border: '1px solid rgba(56, 189, 248, 0.2)',
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
        backgroundColor: '#070a10',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.35rem 0.85rem',
          backgroundColor: '#101622',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}
      >
        <span>{language.toUpperCase()}</span>
        <button
          onClick={copyToClipboard}
          style={{
            background: 'transparent',
            color: copied ? 'var(--accent-emerald)' : 'var(--text-secondary)',
            fontSize: '0.72rem',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'color 0.2s',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '0.85rem 1rem',
          overflowX: 'auto',
          fontSize: '0.82rem',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.55,
          color: '#e2e8f0',
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  )
}
