import { NextRequest } from 'next/server'
import { spawn, ChildProcess } from 'child_process'

export const runtime = 'nodejs'

// Store active sessions
const sessions = new Map<string, {
  process: ChildProcess
  mode: string
  cwd: string
}>()

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  const { action, sessionId, command, args = [], mode = 'command', cwd } = await request.json()

  switch (action) {
    case 'start': {
      // Start a new session
      if (sessions.has(sessionId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Session already exists'
        }), { status: 400 })
      }

      const stream = new ReadableStream({
        start(controller) {
          let proc: ChildProcess

          // For AI CLIs, start interactive mode (most CLIs drop into REPL when no args)
          if (mode === 'gemini' || mode === 'qwen') {
            const interactiveArgs = Array.isArray(args) ? args : []

            proc = spawn(command, interactiveArgs, {
              shell: false,
              cwd: cwd || process.cwd(),
              env: {
                ...process.env,
                // Force interactive mode
                TERM: 'xterm',
              }
            })

            // Store the session
            sessions.set(sessionId, { process: proc, mode, cwd })

            // Send initial message
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'start',
                  data: `Started ${mode} session\n`,
                }) + '\n'
              )
            )

            // Handle stdout
            proc.stdout?.on('data', (data) => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'stdout',
                    data: data.toString(),
                  }) + '\n'
                )
              )
            })

            // Handle stderr
            proc.stderr?.on('data', (data) => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'stderr',
                    data: data.toString(),
                  }) + '\n'
                )
              )
            })

            // Handle process exit
            proc.on('close', (code) => {
              sessions.delete(sessionId)
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'close',
                    data: `Session ended with code ${code}\n`,
                    code,
                  }) + '\n'
                )
              )
              controller.close()
            })

            // Handle errors
            proc.on('error', (error) => {
              sessions.delete(sessionId)
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'error',
                    data: `Error: ${error.message}\n`,
                  }) + '\n'
                )
              )
              controller.close()
            })
          } else {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'error',
                  data: 'Sessions only supported for AI CLIs\n',
                }) + '\n'
              )
            )
            controller.close()
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
      // Send message to existing session
      const session = sessions.get(sessionId)

      if (!session) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Session not found'
        }), { status: 404 })
      }

      const message = args.join(' ')

      if (session.process.stdin && !session.process.stdin.destroyed) {
        try {
          const written = session.process.stdin.write(message + '\n')
          console.log('[Session] Sent message:', message.substring(0, 50), 'written:', written)
          return new Response(JSON.stringify({ success: true }))
        } catch (error: any) {
          console.error('[Session] Write error:', error)
          return new Response(JSON.stringify({
            success: false,
            error: `Write failed: ${error.message}`
          }), { status: 500 })
        }
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: 'Session stdin not available or closed'
        }), { status: 500 })
      }
    }

    case 'end': {
      // End session
      const session = sessions.get(sessionId)

      if (session) {
        session.process.kill()
        sessions.delete(sessionId)
      }

      return new Response(JSON.stringify({ success: true }))
    }

    default:
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid action'
      }), { status: 400 })
  }
}
