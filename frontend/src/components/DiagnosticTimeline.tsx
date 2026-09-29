import React from 'react'
import type { TimelineEvent, DiagnosticStateName } from '../types'

interface DiagnosticTimelineProps {
  timeline: TimelineEvent[]
  currentState: DiagnosticStateName
}

export const DiagnosticTimeline: React.FC<DiagnosticTimelineProps> = ({ timeline, currentState }) => {
  if (!timeline || timeline.length === 0) {
    return null
  }

  const getStateColor = (state: DiagnosticStateName) => {
    switch (state) {
      case 'RESOLVED':
      case 'VERIFYING':
        return 'var(--accent-emerald, #10b981)'
      case 'AWAITING_APPROVAL':
        return '#f59e0b'
      case 'INVESTIGATING':
      case 'PLANNING_INVESTIGATION':
      case 'ANALYZING':
        return 'var(--accent-cyan, #06b6d4)'
      case 'INCONCLUSIVE':
        return '#f43f5e'
      default:
        return 'var(--accent-blue, #3b82f6)'
    }
  }

  return (
    <div
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        padding: '0.85rem 1.1rem',
        marginBottom: '1rem',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem' }}>🧭</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em', color: '#94a3b8', textTransform: 'uppercase' }}>
            Investigation Timeline
          </span>
        </div>
        <span
          style={{
            fontSize: '0.72rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '12px',
            backgroundColor: 'rgba(6, 182, 212, 0.12)',
            color: getStateColor(currentState),
            border: `1px solid ${getStateColor(currentState)}40`,
            fontWeight: 600,
          }}
        >
          {currentState.replace(/_/g, ' ')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', position: 'relative' }}>
        {timeline.map((evt, idx) => {
          const isLast = idx === timeline.length - 1
          const isVerified = evt.description.toLowerCase().includes('verified') || evt.stage.toLowerCase().includes('verified')
          const isAwaiting = evt.state === 'AWAITING_APPROVAL'

          return (
            <div key={evt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', position: 'relative' }}>
              {/* Timeline marker */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '16px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    fontSize: '0.65rem',
                    backgroundColor: isVerified
                      ? '#10b981'
                      : isAwaiting
                      ? '#f59e0b'
                      : isLast
                      ? 'var(--accent-cyan)'
                      : '#334155',
                    color: '#ffffff',
                    fontWeight: 700,
                    boxShadow: isLast ? '0 0 8px rgba(6, 182, 212, 0.5)' : 'none',
                  }}
                >
                  {isVerified ? '✓' : isAwaiting ? '!' : '●'}
                </span>
                {!isLast && (
                  <div
                    style={{
                      width: '2px',
                      height: '16px',
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      marginTop: '2px',
                    }}
                  />
                )}
              </div>

              {/* Event content */}
              <div style={{ flex: 1, paddingBottom: isLast ? 0 : '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isVerified ? '#34d399' : isAwaiting ? '#fcd34d' : '#e2e8f0',
                    }}
                  >
                    {evt.stage}
                  </span>
                  <span style={{ fontSize: '0.66rem', color: '#64748b' }}>
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.1rem', lineHeight: 1.35 }}>
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
