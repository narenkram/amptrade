export interface SessionData {
  sessionId: string
  timestamp: number | null
  lastUpdate: number | null
}

export interface SessionError {
  code: string
  message: string
}
