import React from 'react'
import type { TimelineEvent, DiagnosticStateName } from '../types'
import { IconCompass, IconCheck, IconAlertTriangle } from './Icons'

interface DiagnosticTimelineProps {
  timeline: TimelineEvent[]
  currentState: DiagnosticStateName
}

export const DiagnosticTimeline: React.FC<DiagnosticTimelineProps> = ({ timeline, currentState }) => {
  if (!timeline || timeline.length === 0) {
    return null
  }

  const getStateTheme = (state: DiagnosticStateName) => {
    switch (state) {
      case 'RESOLVED':
      case 'VERIFYING':
        return {
          color: 'var(--accent-emerald)',
          bg: 'var(--accent-emerald-subtle)',
          border: 'var(--accent-emerald-border)',
        }
      case 'AWAITING_APPROVAL':
        return {
          color: 'var(--accent-amber)',
          bg: 'var(--accent-amber-subtle)',
          border: 'var(--accent-amber-border)',
        }
      case 'INVESTIGATING':
      case 'PLANNING_INVESTIGATION':
      case 'ANALYZING':
        return {
          color: 'var(--accent-primary-light)',
          bg: 'var(--accent-primary-subtle)',
          border: 'rgba(59, 130, 246, 0.3)',
        }
      case 'INCONCLUSIVE':
        return {
          color: 'var(--accent-rose)',
          bg: 'var(--accent-rose-subtle)',
          border: 'var(--accent-rose-border)',
        }
      default:
        return {
          color: 'var(--accent-cyan)',
          bg: 'var(--accent-cyan-subtle)',
          border: 'var(--accent-cyan-border)',
        }
    }
  }

  const currentTheme = getStateTheme(currentState)

  return (
    <div
      className="glass-card"
      style={{
        padding: '0.85rem 1.15rem',
        marginBottom: '0.85rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <IconCompass size={15} style={{ color: 'var(--accent-primary-light)' }} />
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            Investigation Timeline
          </span>
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            padding: '0.15rem 0.55rem',
            borderRadius: '9999px',
            backgroundColor: currentTheme.bg,
            color: currentTheme.color,
            border: `1px solid ${currentTheme.border}`,
            fontWeight: 600,
            letterSpacing: '0.03em',
          }}
        >
          {currentState.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Vertical Stepper */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative' }}>
        {timeline.map((evt, idx) => {
          const isLast = idx === timeline.length - 1
          const isVerified =
            evt.description.toLowerCase().includes('verified') || evt.stage.toLowerCase().includes('verified')
          const isAwaiting = evt.state === 'AWAITING_APPROVAL'

          return (
            <div
              key={evt.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                position: 'relative',
              }}
            >
              {/* Connector Column */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '16px',
                  paddingTop: '2px',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    fontSize: '0.65rem',
                    backgroundColor: isVerified
                      ? 'var(--accent-emerald)'
                      : isAwaiting
                      ? 'var(--accent-amber)'
                      : isLast
                      ? 'var(--accent-primary)'
                      : 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontWeight: 700,
                    boxShadow: isLast ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isVerified ? (
                    <IconCheck size={10} />
                  ) : isAwaiting ? (
                    <IconAlertTriangle size={10} />
                  ) : (
                    <span style={{ fontSize: '7px' }}>●</span>
                  )}
                </div>
                {!isLast && (
                  <div
                    style={{
                      width: '1px',
                      height: '18px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      margin: '2px 0',
                    }}
                  />
                )}
              </div>

              {/* Event Content */}
              <div style={{ flex: 1, paddingBottom: isLast ? 0 : '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isVerified
                        ? '#34d399'
                        : isAwaiting
                        ? '#fbbf24'
                        : isLast
                        ? '#f8fafc'
                        : '#94a3b8',
                    }}
                  >
                    {evt.stage}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {evt.timestamp
                      ? new Date(evt.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.1rem', lineHeight: 1.4 }}>
                  {evt.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
