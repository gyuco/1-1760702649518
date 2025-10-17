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
      let listenersCleaned = false
      let handleStdout: ((data: Buffer) => void) | null = null
      let handleStderr: ((data: Buffer) => void) | null = null
      let handleClose: ((code: number) => void) | null = null
      let handleError: ((error: Error) => void) | null = null

      const cleanupListeners = () => {
        if (listenersCleaned) {
          return
        }
        listenersCleaned = true

        if (proc?.stdout) {
          if (handleStdout) {
            proc.stdout.removeListener('data', handleStdout)
          }
        }
        if (proc?.stderr) {
          if (handleStderr) {
            proc.stderr.removeListener('data', handleStderr)
          }
        }
        if (proc) {
          if (handleClose) {
            proc.removeListener('close', handleClose)
          }
          if (handleError) {
            proc.removeListener('error', handleError)
          }
        }
      }

      const emit = (payload: Record<string, unknown>) => {
        if (isClosed) {
          return
        }

        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'))
        } catch (error) {
          isClosed = true
          cleanupListeners()

          if (error instanceof TypeError && String(error.message).includes('Invalid state')) {
            console.debug('Stream already closed; skipping payload emission')
          } else {
            console.error('Failed to emit stream payload', error)
          }
        }
      }

      const finalize = (payload?: Record<string, unknown>) => {
        if (!isClosed) {
          if (payload) {
            emit(payload)
          }

          isClosed = true
          cleanupListeners()

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
      handleStdout = (data: Buffer) => {
        emit({
          type: 'stdout',
          data: data.toString(),
        })
      }
      proc.stdout?.on('data', handleStdout)

      // Handle stderr
      handleStderr = (data: Buffer) => {
        emit({
          type: 'stderr',
          data: data.toString(),
        })
      }
      proc.stderr?.on('data', handleStderr)

      // Handle process completion
      handleClose = (code: number) => {
        finalize({
          type: 'close',
          data: `Process exited with code ${code}\n`,
          code,
        })
      }
      proc.on('close', handleClose)

      // Handle errors
      handleError = (error: Error) => {
        finalize({
          type: 'error',
          data: `Error: ${error.message}\n`,
        })
      }
      proc.on('error', handleError)
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
