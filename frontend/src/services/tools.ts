import type { ToolDefinition, ToolExecuteRequest, ToolExecuteResponse, ToolResult } from '../types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

/**
 * Fetch available diagnostic tools and their specifications from the backend.
 */
export async function listAvailableTools(): Promise<ToolDefinition[]> {
  const response = await fetch(`${BACKEND_URL}/api/tools`)
  if (!response.ok) {
    throw new Error(`Failed to fetch tools catalog (HTTP ${response.status})`)
  }
  return response.json()
}

/**
 * Execute a diagnostic tool on the backend within sandboxed boundaries.
 */
export async function executeTool(request: ToolExecuteRequest): Promise<ToolResult> {
  const response = await fetch(`${BACKEND_URL}/api/tools/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Tool execution request failed (HTTP ${response.status})`)
  }

  const data: ToolExecuteResponse = await response.json()
  return data.result
}
