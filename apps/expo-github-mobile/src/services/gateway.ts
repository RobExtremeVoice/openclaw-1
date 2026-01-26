export type GatewayFrame =
  | { type: 'hello-ok'; protocol: number; server: { version: string; host?: string }; features?: { methods: string[]; events: string[] } }
  | { type: 'res'; id: string; ok: boolean; payload?: unknown; error?: { code: string; message: string } }
  | { type: 'event'; event: string; payload?: unknown; seq?: number }

export type AgentRequestParams = {
  message: string
  agentId?: string
  sessionId?: string
  sessionKey?: string
  thinking?: string
  timeout?: number
  idempotencyKey: string
  repoContext?: {
    owner: string
    name: string
    branch: string
  }
}

export type AgentEventPayload = {
  runId: string
  seq: number
  stream: string
  ts: number
  data: Record<string, unknown>
}

export type AgentFinalResult = {
  runId: string
  status: 'ok' | 'error'
  summary?: string
  error?: string
  result?: unknown
}

// Protocol version must match gateway (see src/gateway/protocol/schema/protocol-schemas.ts)
const PROTOCOL_VERSION = 3

// Valid client IDs from gateway
const CLIENT_ID = 'clawdbot-ios'
const CLIENT_MODE = 'webchat'

export class GatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, {
    resolve: (value: unknown) => void
    reject: (err: Error) => void
  }>()
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>()
  private agentCallbacks = new Map<string, (result: AgentFinalResult) => void>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private messageQueue: string[] = []
  private handshakeComplete = false
  private authToken?: string

  constructor(private url: string, authToken?: string) {
    this.authToken = authToken
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.handshakeComplete = false
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('[Gateway] WebSocket opened, sending connect handshake...')
          // Send connect handshake as first message
          this.sendConnectHandshake()
            .then(() => {
              console.log('[Gateway] Handshake complete')
              this.handshakeComplete = true
              // Send queued messages
              for (const msg of this.messageQueue) {
                this.ws?.send(msg)
              }
              this.messageQueue = []
              this.reconnectDelay = 1000 // Reset on successful connect
              resolve()
            })
            .catch((err) => {
              console.error('[Gateway] Handshake failed', err)
              reject(err)
            })
        }

        this.ws.onmessage = (event) => this.handleMessage(event.data as string)

        this.ws.onclose = (event) => {
          console.log('[Gateway] Disconnected', event.code, event.reason)
          this.handshakeComplete = false
          this.scheduleReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('[Gateway] Error', error)
          reject(error)
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  private async sendConnectHandshake(): Promise<void> {
    const connectParams = {
      client: {
        id: CLIENT_ID,
        displayName: 'Clawdbot Mobile',
        version: '1.0.0',
        mode: CLIENT_MODE,
        platform: 'ios',
      },
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      ...(this.authToken ? { auth: { token: this.authToken } } : {}),
    }

    const result = await this.sendRaw('connect', connectParams)

    // Check if we got hello-ok
    const payload = result as { type?: string; protocol?: number }
    if (payload?.type !== 'hello-ok') {
      throw new Error('Expected hello-ok response from gateway')
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.handshakeComplete = false
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      console.log('[Gateway] Reconnecting...')
      this.reconnectTimer = null
      this.connect().catch((e) => {
        console.error('[Gateway] Reconnect failed', e)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
      })
    }, this.reconnectDelay)
  }

  private handleMessage(data: string) {
    try {
      const frame: GatewayFrame = JSON.parse(data)
      console.log('[Gateway] <<< Received frame:', frame.type, 'event' in frame ? (frame as { event?: string }).event : '')

      if (frame.type === 'res') {
        const pending = this.pending.get(frame.id)
        if (pending) {
          this.pending.delete(frame.id)
          if (frame.ok) {
            console.log('[Gateway] Response OK:', JSON.stringify(frame.payload).slice(0, 200))
            pending.resolve(frame.payload)
          } else {
            console.log('[Gateway] Response ERROR:', frame.error?.message)
            pending.reject(new Error(frame.error?.message || 'Request failed'))
          }
        } else {
          // This is a follow-up response (e.g., agent completion/error)
          const payload = frame.payload as { runId?: string; status?: string; summary?: string; error?: unknown } | undefined
          console.log('[Gateway] Follow-up response:', frame.ok ? 'OK' : 'ERROR', JSON.stringify(payload).slice(0, 300))

          if (payload?.runId) {
            const callback = this.agentCallbacks.get(payload.runId)
            if (callback) {
              this.agentCallbacks.delete(payload.runId)
              callback({
                runId: payload.runId,
                status: payload.status === 'error' || !frame.ok ? 'error' : 'ok',
                summary: payload.summary,
                error: frame.error?.message || (payload.error ? String(payload.error) : undefined),
                result: payload,
              })
            }
          }
        }
      } else if (frame.type === 'event') {
        console.log('[Gateway] Event received:', frame.event, JSON.stringify(frame.payload).slice(0, 200))
        const handlers = this.eventHandlers.get(frame.event)
        if (handlers) {
          console.log('[Gateway] Found', handlers.size, 'handlers for event:', frame.event)
          for (const handler of handlers) {
            try {
              handler(frame.payload)
            } catch (e) {
              console.error('[Gateway] Event handler error', e)
            }
          }
        } else {
          console.log('[Gateway] No handlers for event:', frame.event)
        }
      }
    } catch (e) {
      console.error('[Gateway] Failed to parse message', e)
    }
  }

  // Send without waiting for handshake (used for connect handshake itself)
  private sendRaw(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const frame = { type: 'req', method, params, id }
    const message = JSON.stringify(frame)

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(message)
      } else {
        reject(new Error('WebSocket not open'))
      }
    })
  }

  // Send after handshake complete
  private send(frame: Record<string, unknown>): Promise<unknown> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const message = JSON.stringify({ ...frame, id })

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      if (this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete) {
        this.ws.send(message)
      } else {
        this.messageQueue.push(message)
      }
    })
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.send({ type: 'req', method, params })
  }

  async startAgent(
    params: AgentRequestParams,
    onFinalResult?: (result: AgentFinalResult) => void
  ): Promise<{ status: string; runId: string }> {
    // Default to "main" agent if not specified
    const agentId = params.agentId || 'main'
    const fullParams = { ...params, agentId }
    console.log('[Gateway] >>> Sending agent request:', params.message.slice(0, 50), 'agentId:', agentId)
    const result = await this.call('agent', fullParams) as { status: string; runId: string }
    console.log('[Gateway] <<< Agent accepted:', JSON.stringify(result))

    // Register callback for final result
    if (onFinalResult && result.runId) {
      this.agentCallbacks.set(result.runId, onFinalResult)
    }

    return result
  }

  onEvent(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
    return () => {
      this.eventHandlers.get(event)?.delete(handler)
    }
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN && this.handshakeComplete
  }
}
