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
      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            type: 'start',
            data: `Executing: ${command} ${args.join(' ')}\n`,
          }) + '\n'
        )
      )

      // Handle stdout
      proc.stdout.on('data', (data) => {
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
      proc.stderr.on('data', (data) => {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'stderr',
              data: data.toString(),
            }) + '\n'
          )
        )
      })

      // Handle process completion
      proc.on('close', (code) => {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'close',
              data: `Process exited with code ${code}\n`,
              code,
            }) + '\n'
          )
        )
        controller.close()
      })

      // Handle errors
      proc.on('error', (error) => {
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
