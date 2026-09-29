import React, { useState } from 'react'
import type { DiagnosticSession } from '../types'

interface EvidencePanelProps {
  session: DiagnosticSession
  onChallengeDiagnosis: () => void
  isChallenging?: boolean
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  session,
  onChallengeDiagnosis,
  isChallenging = false,
}) => {
  const [activeTab, setActiveTab] = useState<'evidence' | 'hypotheses' | 'plan'>('evidence')
  const [isCollapsed, setIsCollapsed] = useState(false)

  const report = session.report
  const challenge = session.challenge
  const isVerified = report?.status === 'verified' || session.current_state === 'RESOLVED'

  const getStatusBadge = () => {
    if (isVerified) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.65rem',
            borderRadius: '12px',
            backgroundColor: 'rgba(16, 185, 129, 0.18)',
            border: '1px solid #10b981',
            color: '#34d399',
            fontSize: '0.74rem',
            fontWeight: 700,
          }}
        >
          <span>✓</span>
          <span>VERIFIED</span>
        </span>
      )
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          padding: '0.2rem 0.65rem',
          borderRadius: '12px',
          backgroundColor: 'rgba(245, 158, 11, 0.18)',
          border: '1px solid #f59e0b',
          color: '#fbbf24',
          fontSize: '0.74rem',
          fontWeight: 700,
        }}
      >
        <span>●</span>
        <span>LIKELY (UNVERIFIED)</span>
      </span>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: isCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: isCollapsed ? 0 : '0.75rem',
          marginBottom: isCollapsed ? 0 : '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '1rem' }}>🔬</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                Diagnostic Telemetry & Evidence
              </span>
              {getStatusBadge()}
            </div>
            {report && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                {report.diagnosis}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Challenge Diagnosis Button */}
          <button
            type="button"
            onClick={onChallengeDiagnosis}
            disabled={isChallenging}
            title="Perform a second diagnostic pass to test this diagnosis against alternative explanations"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(168, 85, 247, 0.16)',
              border: '1px solid rgba(168, 85, 247, 0.45)',
              color: '#c084fc',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isChallenging ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span>⚖️</span>
            <span>{isChallenging ? 'Re-evaluating...' : 'Challenge diagnosis'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '0.9rem',
              cursor: 'pointer',
              padding: '0.2rem 0.4rem',
            }}
            title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Challenge Report Box if available */}
          {challenge && (
            <div
              style={{
                backgroundColor: challenge.outcome === 'reaffirmed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.12)',
                border: `1px solid ${challenge.outcome === 'reaffirmed' ? '#10b981' : '#f59e0b'}`,
                borderRadius: '8px',
                padding: '0.75rem 0.95rem',
                marginBottom: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>⚖️</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: challenge.outcome === 'reaffirmed' ? '#34d399' : '#fbbf24' }}>
                    Challenge Result: {challenge.outcome === 'reaffirmed' ? '✓ Reaffirmed & Strongly Supported' : '⚠️ Uncertain — Verification Recommended'}
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  {new Date(challenge.challenged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.4, marginBottom: '0.35rem' }}>
                {challenge.rationale}
              </div>
              <div style={{ fontSize: '0.73rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Alternative evaluated: &quot;{challenge.alternative_considered}&quot; — {challenge.alternative_status}
              </div>
            </div>
          )}

          {/* Nav Tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('evidence')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'evidence' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'evidence' ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Evidence ({session.evidence?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hypotheses')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'hypotheses' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'hypotheses' ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Hypotheses ({session.hypotheses?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plan')}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'plan' ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'plan' ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Investigation Plan ({session.plan?.steps?.length || 0})
            </button>
          </div>

          {/* Tab 1: Evidence List */}
          {activeTab === 'evidence' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {session.evidence && session.evidence.length > 0 ? (
                session.evidence.map((item) => {
                  const isVer = item.classification === 'VERIFIED'
                  const isObs = item.classification === 'OBSERVED'
                  const color = isVer ? '#34d399' : isObs ? 'var(--accent-cyan)' : '#fbbf24'
                  const bg = isVer
                    ? 'rgba(16, 185, 129, 0.12)'
                    : isObs
                    ? 'rgba(6, 182, 212, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)'

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.55rem',
                        padding: '0.45rem 0.7rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          backgroundColor: bg,
                          color: color,
                          border: `1px solid ${color}40`,
                          letterSpacing: '0.04em',
                          minWidth: '65px',
                          textAlign: 'center',
                        }}
                      >
                        {item.classification}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.35 }}>
                          {item.claim}
                        </div>
                        {item.tool_name && (
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>
                            Source: {item.tool_name} {item.source}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ fontSize: '0.76rem', color: '#64748b', fontStyle: 'italic', padding: '0.4rem 0' }}>
                  No evidence items recorded yet.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Hypotheses */}
          {activeTab === 'hypotheses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {session.hypotheses && session.hypotheses.length > 0 ? (
                session.hypotheses.map((hyp) => {
                  const isLeading = hyp.id === session.leading_hypothesis_id
                  const isVerified = hyp.status === 'verified'

                  return (
                    <div
                      key={hyp.id}
                      style={{
                        padding: '0.55rem 0.8rem',
                        backgroundColor: isLeading ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 0, 0, 0.25)',
                        border: isLeading ? '1px solid var(--accent-blue)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
                            {hyp.id}
                          </span>
                          {isLeading && (
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: 'var(--accent-blue)', color: '#ffffff', borderRadius: '4px', fontWeight: 700 }}>
                              LEADING
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            backgroundColor: isVerified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                            color: isVerified ? '#34d399' : '#cbd5e1',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {hyp.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#f1f5f9', lineHeight: 1.35 }}>
                        {hyp.description}
                      </div>
                      {hyp.verification_needed && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          Needed: {hyp.verification_needed}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div style={{ fontSize: '0.76rem', color: '#64748b', fontStyle: 'italic', padding: '0.4rem 0' }}>
                  No candidate hypotheses formulated yet.
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Investigation Plan */}
          {activeTab === 'plan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {session.plan?.steps && session.plan.steps.length > 0 ? (
                session.plan.steps.map((step) => {
                  const isDone = step.status === 'completed'
                  const isRunning = step.status === 'running'

                  return (
                    <div
                      key={step.step_num}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.75rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: isDone ? '#10b981' : isRunning ? 'var(--accent-cyan)' : '#334155',
                            color: '#ffffff',
                          }}
                        >
                          {isDone ? '✓' : step.step_num}
                        </span>
                        <div>
                          <div style={{ fontSize: '0.78rem', color: isDone ? '#94a3b8' : '#f1f5f9', fontWeight: 500 }}>
                            {step.action}
                          </div>
                          {step.note && (
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                              {step.note}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          color: isDone ? '#34d399' : isRunning ? 'var(--accent-cyan)' : '#64748b',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {step.status}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div style={{ fontSize: '0.76rem', color: '#64748b', fontStyle: 'italic', padding: '0.4rem 0' }}>
                  No investigation plan initialized.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
