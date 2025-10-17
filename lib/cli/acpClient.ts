import { EventEmitter } from 'node:events'
import { ChildProcessWithoutNullStreams } from 'node:child_process'

type JsonValue = Record<string, unknown>

type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  method: string
}

export type AcpNotification =
  | { type: 'session_update'; payload: JsonValue }
  | { type: 'request_permission'; payload: JsonValue }
  | { type: 'log'; payload: string }

export type AcpResponseEvent = {
  method: string
  result: any
}

/**
 * Minimal ACP client capable of talking to Gemini/Qwen CLI instances over stdio.
 */
export class AcpClient extends EventEmitter {
  private readonly proc: ChildProcessWithoutNullStreams
  private buffer = ''
  private requestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private closed = false

  constructor(proc: ChildProcessWithoutNullStreams) {
    super()
    this.proc = proc
    proc.stdout.on('data', (chunk) => this.handleStdout(chunk))
    proc.stderr.on('data', (chunk) =>
      this.emit('stderr', chunk instanceof Buffer ? chunk.toString() : String(chunk))
    )
    proc.on('close', (code, signal) => {
      this.closed = true
      const error = new Error(`ACP process exited (code=${code ?? 'unknown'} signal=${signal ?? 'none'})`)
      for (const pending of this.pending.values()) {
        pending.reject(error)
      }
      this.pending.clear()
      this.emit('close', code)
    })
  }

  async initialize() {
    return this.sendRequest('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
      },
    })
  }

  async newSession(cwd: string) {
    return this.sendRequest('session/new', {
      cwd,
      mcpServers: [],
    })
  }

  async prompt(sessionId: string, text: string) {
    return this.sendRequest('session/prompt', {
      sessionId,
      prompt: [
        {
          type: 'text',
          text,
        },
      ],
    })
  }

  async cancel(sessionId: string) {
    return this.sendNotification('session/cancel', {
      sessionId,
    })
  }

  private async handleStdout(chunk: Buffer) {
    this.buffer += chunk.toString()
    while (true) {
      const newlineIndex = this.buffer.indexOf('\n')
      if (newlineIndex === -1) break
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (!line) continue
      try {
        const message = JSON.parse(line)
        await this.processMessage(message)
      } catch (error: any) {
        this.emit('stderr', `Failed to parse ACP message: ${error?.message ?? error}`)
      }
    }
  }

  private async processMessage(message: any) {
    if (message?.method && typeof message.id !== 'undefined') {
      await this.handleAgentRequest(message)
    } else if (message?.method) {
      this.handleNotification(message.method, message.params)
    } else if (typeof message?.id !== 'undefined') {
      this.handleResponse(message)
    }
  }

  private handleResponse(message: any) {
    const entry = this.pending.get(message.id)
    if (!entry) {
      return
    }
    const { method } = entry
    this.pending.delete(message.id)
    if (message.error) {
      entry.reject(
        new Error(
          message.error?.message ||
            `ACP request failed (code ${message.error?.code ?? 'unknown'})`
        )
      )
    } else {
      entry.resolve(message.result)
      this.emit('response', { method, result: message.result })
    }
  }

  private handleNotification(method: string, params: any) {
    if (method === 'session/update') {
      this.emit('notification', {
        type: 'session_update',
        payload: params ?? {},
      } satisfies AcpNotification)
    } else {
      this.emit('notification', {
        type: 'log',
        payload: JSON.stringify({ method, params }),
      } satisfies AcpNotification)
    }
  }

  private async handleAgentRequest(message: any) {
    const { method, params, id } = message

    if (method === 'session/request_permission') {
      this.emit('notification', {
        type: 'request_permission',
        payload: params ?? {},
      } satisfies AcpNotification)

      const options: any[] = Array.isArray(params?.options) ? params.options : []
      const allowAlways = options.find((option) => option.kind === 'allow_always')
      const allowOnce = options.find((option) => option.kind === 'allow_once')
      const selected = allowAlways || allowOnce || options[0]

      const response = selected
        ? {
            outcome: {
              outcome: 'selected',
              optionId: selected.optionId ?? selected.name ?? 'allow',
            },
          }
        : {
            outcome: {
              outcome: 'cancelled',
            },
          }

      this.sendMessage({ jsonrpc: '2.0', id, result: response })
      return
    }

    // For other agent-originated requests (fs operations, etc.) respond with method not found.
    this.sendMessage({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not implemented on client: ${method}`,
      },
    })
  }

  private async sendRequest(method: string, params: Record<string, unknown>) {
    if (this.closed) {
      throw new Error('Cannot send request: ACP process already closed')
    }
    const id = this.requestId++
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
    })
    this.sendMessage({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })
    return promise
  }

  private async sendNotification(method: string, params: Record<string, unknown>) {
    if (this.closed) {
      return
    }
    this.sendMessage({
      jsonrpc: '2.0',
      method,
      params,
    })
  }

  private sendMessage(message: JsonValue) {
    const payload = JSON.stringify(message) + '\n'
    this.proc.stdin.write(payload, 'utf8')
  }
}
