export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: Role
  content: string
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
