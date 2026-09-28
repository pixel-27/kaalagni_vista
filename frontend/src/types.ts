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

export interface ChatResponse {
  message: ChatMessage
  provider: string
  model: string
  timestamp: string
  finish_reason?: string
}

export interface ToolExecuteRequest {
  call_id: string
  tool: string
  arguments: Record<string, unknown>
  user_approved: boolean
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
