import React, { useState } from 'react'
import type { DiagnosticSession, EvidenceClassification } from '../types'
import {
  IconCheck,
  IconCheckCircle,
  IconScale,
  IconChevronDown,
  IconChevronUp,
  IconFlask,
  IconFileText,
  IconLayers,
} from './Icons'

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
            padding: '0.2rem 0.6rem',
            borderRadius: '9999px',
            backgroundColor: 'var(--accent-emerald-subtle)',
            border: '1px solid var(--accent-emerald-border)',
            color: 'var(--accent-emerald)',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          <IconCheck size={11} />
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
          padding: '0.2rem 0.6rem',
          borderRadius: '9999px',
          backgroundColor: 'var(--accent-amber-subtle)',
          border: '1px solid var(--accent-amber-border)',
          color: 'var(--accent-amber)',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ fontSize: '8px' }}>●</span>
        <span>LIKELY (UNVERIFIED)</span>
      </span>
    )
  }

  const getClassificationStyle = (classification: EvidenceClassification) => {
    switch (classification) {
      case 'VERIFIED':
        return {
          color: 'var(--accent-emerald)',
          bg: 'var(--accent-emerald-subtle)',
          border: 'var(--accent-emerald-border)',
        }
      case 'OBSERVED':
        return {
          color: 'var(--accent-cyan)',
          bg: 'var(--accent-cyan-subtle)',
          border: 'var(--accent-cyan-border)',
        }
      case 'LIKELY':
        return {
          color: 'var(--accent-amber)',
          bg: 'var(--accent-amber-subtle)',
          border: 'var(--accent-amber-border)',
        }
      case 'UNKNOWN':
      default:
        return {
          color: 'var(--text-muted)',
          bg: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
        }
    }
  }

  return (
    <div
      className="glass-card"
      style={{
        padding: '0.95rem 1.15rem',
        marginBottom: '0.85rem',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)',
          paddingBottom: isCollapsed ? 0 : '0.75rem',
          marginBottom: isCollapsed ? 0 : '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary-light)',
            }}
          >
            <IconFlask size={15} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                Diagnostic Telemetry & Evidence
              </span>
              {getStatusBadge()}
            </div>
            {report && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: 1.3 }}>
                {report.diagnosis}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Challenge Diagnosis Button */}
          <button
            type="button"
            onClick={onChallengeDiagnosis}
            disabled={isChallenging}
            title="Ask VISTA to reconsider its current conclusion"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: isChallenging ? 'rgba(139, 92, 246, 0.08)' : 'var(--accent-purple-subtle)',
              border: '1px solid var(--accent-purple-border)',
              color: isChallenging ? 'var(--text-muted)' : '#c084fc',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: isChallenging ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconScale size={13} />
            <span>{isChallenging ? 'Re-evaluating...' : 'Challenge diagnosis'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              color: 'var(--text-muted)',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
            title={isCollapsed ? 'Expand telemetry panel' : 'Collapse telemetry panel'}
          >
            {isCollapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Challenge Report Box if available */}
          {challenge && (
            <div
              style={{
                backgroundColor:
                  challenge.outcome === 'reaffirmed' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                border: `1px solid ${
                  challenge.outcome === 'reaffirmed' ? 'var(--accent-emerald-border)' : 'var(--accent-amber-border)'
                }`,
                borderRadius: '8px',
                padding: '0.75rem 0.95rem',
                marginBottom: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <IconScale size={14} style={{ color: challenge.outcome === 'reaffirmed' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }} />
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: challenge.outcome === 'reaffirmed' ? '#34d399' : '#fbbf24',
                    }}
                  >
                    Challenge Result: {challenge.outcome === 'reaffirmed' ? 'Reaffirmed & Supported' : 'Uncertain — Verification Recommended'}
                  </span>
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(challenge.challenged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.45, marginBottom: '0.35rem' }}>
                {challenge.rationale}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Alternative evaluated: &quot;{challenge.alternative_considered}&quot; — {challenge.alternative_status}
              </div>
            </div>
          )}

          {/* Nav Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '0.35rem',
              marginBottom: '0.75rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              paddingBottom: '0.45rem',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('evidence')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.28rem 0.65rem',
                fontSize: '0.73rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: activeTab === 'evidence' ? 'rgba(59, 130, 246, 0.4)' : 'transparent',
                backgroundColor: activeTab === 'evidence' ? 'var(--accent-primary-subtle)' : 'transparent',
                color: activeTab === 'evidence' ? 'var(--accent-primary-light)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconCheckCircle size={13} />
              <span>Evidence ({session.evidence?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hypotheses')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.28rem 0.65rem',
                fontSize: '0.73rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: activeTab === 'hypotheses' ? 'rgba(59, 130, 246, 0.4)' : 'transparent',
                backgroundColor: activeTab === 'hypotheses' ? 'var(--accent-primary-subtle)' : 'transparent',
                color: activeTab === 'hypotheses' ? 'var(--accent-primary-light)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconLayers size={13} />
              <span>Hypotheses ({session.hypotheses?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plan')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.28rem 0.65rem',
                fontSize: '0.73rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: activeTab === 'plan' ? 'rgba(59, 130, 246, 0.4)' : 'transparent',
                backgroundColor: activeTab === 'plan' ? 'var(--accent-primary-subtle)' : 'transparent',
                color: activeTab === 'plan' ? 'var(--accent-primary-light)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconFileText size={13} />
              <span>Investigation Plan ({session.plan?.steps?.length || 0})</span>
            </button>
          </div>

          {/* Tab 1: Evidence List */}
          {activeTab === 'evidence' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {session.evidence && session.evidence.length > 0 ? (
                session.evidence.map((item) => {
                  const style = getClassificationStyle(item.classification)

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.65rem',
                        padding: '0.45rem 0.75rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          backgroundColor: style.bg,
                          color: style.color,
                          border: `1px solid ${style.border}`,
                          letterSpacing: '0.04em',
                          minWidth: '68px',
                          textAlign: 'center',
                          flexShrink: 0,
                          marginTop: '1px',
                        }}
                      >
                        {item.classification}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.76rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                          {item.claim}
                        </div>
                        {item.tool_name && (
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: 'var(--font-mono)' }}>
                            Source: {item.tool_name} ({item.source})
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.4rem 0' }}>
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
                        padding: '0.6rem 0.85rem',
                        backgroundColor: isLeading ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                        border: isLeading ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {hyp.id}
                          </span>
                          {isLeading && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                padding: '0.1rem 0.4rem',
                                backgroundColor: 'var(--accent-primary)',
                                color: '#ffffff',
                                borderRadius: '4px',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                              }}
                            >
                              LEADING
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '0.66rem',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '4px',
                            backgroundColor: isVerified ? 'var(--accent-emerald-subtle)' : 'rgba(255, 255, 255, 0.06)',
                            color: isVerified ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                            border: `1px solid ${isVerified ? 'var(--accent-emerald-border)' : 'rgba(255, 255, 255, 0.1)'}`,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {hyp.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#f1f5f9', lineHeight: 1.4 }}>
                        {hyp.description}
                      </div>
                      {hyp.verification_needed && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                          Verification needed: {hyp.verification_needed}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.4rem 0' }}>
                  No candidate hypotheses formulated yet.
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Investigation Plan */}
          {activeTab === 'plan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
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
                        padding: '0.5rem 0.8rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            backgroundColor: isDone
                              ? 'var(--accent-emerald)'
                              : isRunning
                              ? 'var(--accent-primary)'
                              : 'rgba(255, 255, 255, 0.1)',
                            color: '#ffffff',
                          }}
                        >
                          {isDone ? <IconCheck size={11} /> : step.step_num}
                        </span>
                        <div>
                          <div style={{ fontSize: '0.76rem', color: isDone ? 'var(--text-secondary)' : '#f1f5f9', fontWeight: 500 }}>
                            {step.action}
                          </div>
                          {step.note && (
                            <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {step.note}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: isDone ? 'var(--accent-emerald)' : isRunning ? 'var(--accent-primary-light)' : 'var(--text-muted)',
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
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.4rem 0' }}>
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
