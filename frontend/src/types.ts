export type Role = 'user' | 'assistant' | 'system'

export interface ImageAttachment {
  mime_type: string
  data: string // Base64 data or data URI
  filename?: string
  size_bytes?: number
}

export interface ChatMessage {
  role: Role
  content: string
  attachments?: ImageAttachment[]
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
