export type Role = 'user' | 'assistant' | 'system' | 'tool'

export type ToolPermissionLevel = 'read_only' | 'execution'

export interface ToolDefinition {
  name: string
  description: string
  permission_level: ToolPermissionLevel
  requires_confirmation: boolean
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  tool: string
  arguments: Record<string, unknown>
  approval_token?: string
}

export interface ToolResult {
  call_id: string
  tool: string
  status: 'success' | 'error' | 'denied'
  output?: unknown
  error?: string
  permission_level?: ToolPermissionLevel
  duration_seconds?: number
}

export interface ImageAttachment {
  mime_type: string
  data: string // Base64 data or data URI
  filename?: string
  size_bytes?: number
  source?: 'upload' | 'screen'
}

export type InputMode = 'text' | 'voice'

export type VoiceRecognitionState = 'idle' | 'listening' | 'processing' | 'error' | 'unsupported'
export type VoicePlaybackState = 'idle' | 'speaking' | 'paused' | 'unsupported'

export type ScreenCaptureState =
  | 'idle'
  | 'requesting_permission'
  | 'active'
  | 'capturing'
  | 'permission_denied'
  | 'unsupported'

export interface ChatMessage {
  role: Role
  content: string
  attachments?: ImageAttachment[]
  input_mode?: InputMode
  tool_calls?: ToolCall[]
  tool_call_id?: string
  tool_result?: ToolResult
  timestamp?: string
}

// Phase 7 Diagnostic Types
export type DiagnosticStateName =
  | 'IDLE'
  | 'OBSERVING'
  | 'ANALYZING'
  | 'FORMING_HYPOTHESES'
  | 'PLANNING_INVESTIGATION'
  | 'INVESTIGATING'
  | 'AWAITING_APPROVAL'
  | 'VERIFYING'
  | 'DIAGNOSING'
  | 'RESOLVED'
  | 'INCONCLUSIVE'

export type EvidenceClassification = 'OBSERVED' | 'VERIFIED' | 'LIKELY' | 'UNKNOWN'
export type EvidenceSource = 'user_input' | 'screenshot' | 'screen_context' | 'tool_output' | 'inference'
export type HypothesisStatus = 'candidate' | 'supported' | 'contradicted' | 'verified' | 'unresolved'
export type StepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'
export type DiagnosisStatus = 'verified' | 'likely' | 'unresolved' | 'inconclusive'
export type ChallengeOutcome = 'reaffirmed' | 'revised' | 'uncertain'

export interface EvidenceItem {
  id: string
  claim: string
  classification: EvidenceClassification
  source: EvidenceSource
  tool_call_id?: string
  tool_name?: string
  details?: string
  timestamp: string
}

export interface Hypothesis {
  id: string
  description: string
  status: HypothesisStatus
  supporting_evidence: string[]
  contradicting_evidence: string[]
  verification_needed?: string
  likelihood?: string
}

export interface InvestigationStep {
  step_num: number
  action: string
  tool_needed?: string
  target?: string
  status: StepStatus
  note?: string
}

export interface InvestigationPlan {
  goal: string
  steps: InvestigationStep[]
}

export interface DiagnosticReport {
  diagnosis: string
  summary: string
  status: DiagnosisStatus
  observed_facts: string[]
  verified_facts: string[]
  explanation: string
  recommended_fix: string[]
  verification_step?: string
}

export interface ChallengeReport {
  challenged_at: string
  previous_diagnosis: string
  new_diagnosis: string
  outcome: ChallengeOutcome
  rationale: string
  alternative_considered: string
  alternative_status: string
}

export interface TimelineEvent {
  id: string
  stage: string
  state: DiagnosticStateName
  description: string
  timestamp: string
  status: 'completed' | 'active' | 'pending' | 'failed'
}

export interface DiagnosticSession {
  session_id: string
  current_state: DiagnosticStateName
  observations: string[]
  evidence: EvidenceItem[]
  hypotheses: Hypothesis[]
  leading_hypothesis_id?: string
  plan?: InvestigationPlan
  timeline: TimelineEvent[]
  report?: DiagnosticReport
  challenge?: ChallengeReport
  updated_at: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  model?: string
  challenge_diagnosis?: boolean
  diagnostic_session?: DiagnosticSession
}

export interface ChatResponse {
  message: ChatMessage
  provider: string
  model: string
  timestamp: string
  finish_reason?: string
  diagnostic_session?: DiagnosticSession
}

export interface ToolExecuteRequest {
  call_id: string
  tool: string
  arguments: Record<string, unknown>
  user_approved: boolean
  approval_token?: string
}

export interface ToolExecuteResponse {
  result: ToolResult
}

export interface HealthData {
  status: string
  project: string
  version: string
  timestamp: string
  environment: string
  ai_provider?: string
}
