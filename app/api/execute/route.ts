import { NextRequest } from 'next/server'
import { spawn } from 'child_process'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  const { command, args = [], mode = 'command', cwd } = await request.json()

  // Use provided working directory or default to process.cwd()
  const workingDir = cwd || process.cwd()

  const stream = new ReadableStream({
    start(controller) {
      let proc: any
      let isClosed = false

      const emit = (payload: Record<string, unknown>) => {
        if (isClosed) {
          return
        }

        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
        } catch (error) {
          isClosed = true
          console.error('Failed to emit stream payload', error)
        }
      }

      const finalize = (payload?: Record<string, unknown>) => {
        if (!isClosed && payload) {
          emit(payload)
        }

        if (!isClosed) {
          isClosed = true
          try {
            controller.close()
          } catch (error) {
            console.error('Failed to close stream controller', error)
          }
        }
      }

      // Handle different modes
      if (mode === 'gemini' || mode === 'qwen') {
        // For AI CLIs, pass the entire message as input via stdin
        const message = args.join(' ')

        proc = spawn(command, [], {
          shell: false,
          cwd: workingDir,
        })

        // Write the message to stdin
        if (proc.stdin) {
          proc.stdin.write(message + '\n')
          proc.stdin.end()
        }
      } else {
        // For shell commands, use the original behavior
        proc = spawn(command, args, {
          shell: true,
          cwd: workingDir,
        })
      }

      // Send initial message
      emit({
        type: 'start',
        data: `Executing: ${command} ${args.join(' ')}\n`,
      })

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        emit({
          type: 'stdout',
          data: data.toString(),
        })
      })

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        emit({
          type: 'stderr',
          data: data.toString(),
        })
      })

      // Handle process completion
      proc.on('close', (code) => {
        finalize({
          type: 'close',
          data: `Process exited with code ${code}\n`,
          code,
        })
      })

      // Handle errors
      proc.on('error', (error) => {
        finalize({
          type: 'error',
          data: `Error: ${error.message}\n`,
        })
      })
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
