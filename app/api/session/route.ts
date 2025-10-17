import { NextRequest } from 'next/server'
import {
  ChildProcessWithoutNullStreams,
  spawn,
} from 'child_process'

import {
  CLIType,
  buildCliInvocation,
  getCliStrategy,
  isAiCli,
} from '@/lib/cli/strategies'
import { prepareCliEnvironment } from '@/lib/cli/environment'
import {
  AcpClient,
  AcpNotification,
  AcpResponseEvent,
} from '@/lib/cli/acpClient'

export const runtime = 'nodejs'

interface SessionState {
  process: ChildProcessWithoutNullStreams
  mode: CLIType
  cwd: string
  acp?: AcpClient
  agentSessionId?: string
  pendingPrompt?: Promise<unknown>
}

const sessions = new Map<string, SessionState>()

const encoder = new TextEncoder()

function formatNotification(notification: AcpNotification): string {
  switch (notification.type) {
    case 'session_update':
      return JSON.stringify({
        event: 'session_update',
        payload: notification.payload,
      })
    case 'request_permission':
      return JSON.stringify({
        event: 'request_permission',
        payload: notification.payload,
      })
    case 'log':
    default:
      return notification.payload
  }
}

function safeStringify(input: unknown) {
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

function createSseChunk(payload: Record<string, unknown>) {
  return encoder.encode(JSON.stringify(payload) + '\n')
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const action = body.action as string
  const sessionId = body.sessionId as string
  const mode = (body.mode ?? 'command') as CLIType
  const cwd = (body.cwd as string) || process.cwd()
  const args: string[] = Array.isArray(body.args) ? body.args : []

  if (!sessionId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing sessionId' }), {
      status: 400,
    })
  }

  switch (action) {
    case 'start': {
      if (!isAiCli(mode)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Sessions are only supported for AI CLIs (received "${mode}")`,
          }),
          { status: 400 }
        )
      }

      if (sessions.has(sessionId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Session already exists' }),
          { status: 400 }
        )
      }

      try {
        await prepareCliEnvironment(mode, cwd)
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to prepare CLI environment: ${error?.message ?? error}`,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
      const strategy = getCliStrategy(mode)
      const invocation = buildCliInvocation(strategy, { cwd })

      const proc = spawn(invocation.command, invocation.args, {
        cwd,
        stdio: 'pipe',
        env: {
          ...process.env,
          TERM: 'xterm',
          ...invocation.env,
        },
      })

      const child = proc as ChildProcessWithoutNullStreams
      const acp = new AcpClient(child)

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let isControllerClosed = false

          const safeEnqueue = (payload: Record<string, unknown>) => {
            if (isControllerClosed) {
              return
            }

            try {
              controller.enqueue(createSseChunk(payload))
            } catch (error) {
              if (
                error instanceof TypeError &&
                String(error?.message ?? '').includes('Invalid state')
              ) {
                isControllerClosed = true
                return
              }
              console.error('Failed to enqueue SSE payload', error)
            }
          }

          const safeClose = () => {
            if (isControllerClosed) {
              return
            }
            isControllerClosed = true
            try {
              controller.close()
            } catch (error) {
              if (
                !(error instanceof TypeError) ||
                !String(error?.message ?? '').includes('Invalid state')
              ) {
                console.error('Failed to close SSE controller', error)
              }
            }
          }

          const send = (payload: Record<string, unknown>) => {
            safeEnqueue(payload)
          }

          const sessionState: SessionState = {
            process: child,
            mode,
            cwd,
            acp,
          }
          sessions.set(sessionId, sessionState)

          const handleNotification = (notification: AcpNotification) => {
            send({
              type: 'stdout',
              data: formatNotification(notification),
            })
          }

          const handleStderr = (data: string) => {
            send({
              type: 'stderr',
              data,
            })
          }

          const handleResponse = (event: AcpResponseEvent) => {
            if (event.method === 'session/prompt') {
              send({
                type: 'stdout',
                data: JSON.stringify({
                  event: 'prompt_result',
                  payload: event.result,
                }),
              })
            }
          }

          const cleanup = () => {
            acp.off('notification', handleNotification)
            acp.off('stderr', handleStderr)
            acp.off('response', handleResponse)
          }

          acp.on('notification', handleNotification)
          acp.on('stderr', handleStderr)
          acp.on('response', handleResponse)

          child.on('close', (code) => {
            cleanup()
            sessions.delete(sessionId)
            send({
              type: 'close',
              data: `Session ended with code ${code}\n`,
              code,
            })
            safeClose()
          })

          child.on('error', (error) => {
            cleanup()
            sessions.delete(sessionId)
            send({
              type: 'error',
              data: `Process error: ${error.message}`,
            })
            safeClose()
          })

          send({
            type: 'start',
            data: `Starting ${mode} session...\n`,
          })

          ;(async () => {
            try {
              await acp.initialize()
              const response = await acp.newSession(cwd)
              const agentSessionId =
                response?.sessionId ??
                response?.session_id ??
                response?.sessionID

              if (!agentSessionId || typeof agentSessionId !== 'string') {
                throw new Error('Agent session id missing from response')
              }

              sessionState.agentSessionId = agentSessionId
              send({
                type: 'stdout',
                data: `Session ready. Agent session ID: ${agentSessionId}\n`,
              })
            } catch (error: any) {
              cleanup()
              sessions.delete(sessionId)
              send({
                type: 'error',
                data: `Failed to initialize session: ${error?.message ?? error}`,
              })
              child.kill()
              safeClose()
            }
          })()
        },
        cancel() {
          const entry = sessions.get(sessionId)
          if (entry) {
            entry.process.kill()
            sessions.delete(sessionId)
          } else {
            child.kill()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    case 'send': {
      const session = sessions.get(sessionId)
      if (!session) {
        return new Response(
          JSON.stringify({ success: false, error: 'Session not found' }),
          { status: 404 }
        )
      }

      if (!isAiCli(session.mode) || !session.acp || !session.agentSessionId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Session is not ready to receive messages',
          }),
          { status: 409 }
        )
      }

      const message = args.join(' ').trim()
      if (!message) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Message text is required',
          }),
          { status: 400 }
        )
      }

      if (session.pendingPrompt) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Previous prompt still running. Please wait for completion.',
          }),
          { status: 409 }
        )
      }

      const promptPromise = session.acp
        .prompt(session.agentSessionId, message)
        .catch((error: any) => {
          throw new Error(error?.message ?? String(error))
        })

      session.pendingPrompt = promptPromise

      try {
        const result = await promptPromise
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
        })
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error?.message ?? 'Prompt failed',
          }),
          { status: 500 }
        )
      } finally {
        session.pendingPrompt = undefined
      }
    }

    case 'end': {
      const session = sessions.get(sessionId)
      if (session) {
        if (session.agentSessionId && session.acp) {
          try {
            await session.acp.cancel(session.agentSessionId)
          } catch (error: any) {
            console.warn('Failed to cancel ACP session gracefully:', error?.message ?? error)
          }
        }
        session.process.kill()
        sessions.delete(sessionId)
      }
      return new Response(JSON.stringify({ success: true }))
    }

    default:
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unknown action "${safeStringify(action)}"`,
        }),
        { status: 400 }
      )
  }
}
