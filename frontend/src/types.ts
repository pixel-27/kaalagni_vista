export type Role = 'user' | 'assistant' | 'system'

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
  timestamp?: string
}



export interface ChatResponse {
  message: ChatMessage
  provider: string
  model: string
  timestamp: string
  finish_reason?: string
}

export interface HealthData {
  status: string
  project: string
  version: string
  timestamp: string
  environment: string
  ai_provider?: string
}
