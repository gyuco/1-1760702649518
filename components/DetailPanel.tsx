'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, Priority } from './KanbanBoard'

interface DetailPanelProps {
  card: Card
  isOpen: boolean
  onClose: () => void
}

interface Message {
  id: string
  type: 'user' | 'system' | 'stdout' | 'stderr' | 'error'
  content: string
  timestamp: Date
}

type CLIType = 'gemini' | 'qwen' | 'command'

interface CLIOption {
  id: CLIType
  name: string
  command: string
  description: string
}

// Priority badge styles
const priorityStyles: Record<Priority, { bg: string; text: string; label: string }> = {
  high: {
    bg: 'bg-red-100 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
    label: 'High',
  },
  medium: {
    bg: 'bg-yellow-100 dark:bg-yellow-950',
    text: 'text-yellow-700 dark:text-yellow-300',
    label: 'Medium',
  },
  low: {
    bg: 'bg-green-100 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
    label: 'Low',
  },
}

const CLI_OPTIONS: CLIOption[] = [
  {
    id: 'command',
    name: 'Shell Command',
    command: 'sh',
    description: 'Execute shell commands',
  },
  {
    id: 'gemini',
    name: 'Gemini AI',
    command: 'gemini',
    description: 'Google Gemini AI assistant',
  },
  {
    id: 'qwen',
    name: 'Qwen AI',
    command: 'qwen',
    description: 'Qwen AI assistant',
  },
]

// Helper to check if CLI is AI-based
const isAICLI = (cliType: CLIType) => cliType === 'gemini' || cliType === 'qwen'

export function DetailPanel({ card, isOpen, onClose }: DetailPanelProps) {
  const priorityStyle = priorityStyles[card.priority]
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [selectedCLI, setSelectedCLI] = useState<CLIType>('command')
  const [contextSent, setContextSent] = useState(false)
  const [workingDirectory, setWorkingDirectory] = useState(process.cwd ? process.cwd() : '/tmp')
  const [taskStarted, setTaskStarted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset context when CLI changes
  useEffect(() => {
    setContextSent(false)
    setMessages([])
    setTaskStarted(false)
  }, [selectedCLI])

  const executeCommand = async (command: string, skipUserMessage = false) => {
    if (!command.trim() || isExecuting) return

    // Add user message (unless skipped for context initialization)
    if (!skipUserMessage) {
      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: command,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
    }
    setInputValue('')
    setIsExecuting(true)

    // Get selected CLI option
    const cliOption = CLI_OPTIONS.find((opt) => opt.id === selectedCLI)

    // Prepare command based on CLI type
    let cmd: string
    let args: string[]

    if (selectedCLI === 'command') {
      // Direct shell command
      const parts = command.trim().split(' ')
      cmd = parts[0]
      args = parts.slice(1)
    } else {
      // AI CLI (gemini or qwen)
      cmd = cliOption?.command || 'echo'
      args = [command]
    }

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          args,
          mode: selectedCLI,
          cwd: workingDirectory
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No reader available')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter((line) => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            const message: Message = {
              id: `${Date.now()}-${Math.random()}`,
              type: data.type === 'stdout' ? 'stdout' : data.type === 'stderr' ? 'stderr' : 'system',
              content: data.data,
              timestamp: new Date(),
            }
            setMessages((prev) => [...prev, message])
          } catch (e) {
            console.error('Failed to parse message:', e)
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorMessage: Message = {
          id: Date.now().toString(),
          type: 'error',
          content: error.message || 'Unknown error occurred',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } finally {
      setIsExecuting(false)
      abortControllerRef.current = null
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    executeCommand(inputValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand(inputValue)
    }
  }

  const handleStartTask = () => {
    if (isAICLI(selectedCLI)) {
      const contextMessage = `Task: ${card.title}\n\nDescription: ${card.description}\n\nPriority: ${card.priority}\nStatus: ${card.columnId.replace('-', ' ')}\n\nPlease help me with this task. What would you suggest?`

      // Add system message showing context was sent
      const systemMsg: Message = {
        id: Date.now().toString(),
        type: 'system',
        content: '📋 Task started - Context sent to AI',
        timestamp: new Date(),
      }
      setMessages([systemMsg])
      setContextSent(true)
      setTaskStarted(true)

      // Execute with context
      executeCommand(contextMessage, false)
    } else {
      setTaskStarted(true)
    }
  }

  const handleStopTask = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsExecuting(false)

    const stopMsg: Message = {
      id: Date.now().toString(),
      type: 'system',
      content: '⚠️ Task stopped by user',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, stopMsg])
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`
          fixed inset-0 bg-black/20 z-40 transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-full sm:w-[600px] lg:w-[700px] bg-white dark:bg-slate-800
          shadow-2xl z-50 transform transition-transform duration-300 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2
                id="panel-title"
                className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2"
              >
                {card.title}
              </h2>
              <span
                className={`
                  text-xs font-medium px-3 py-1 rounded-full inline-block
                  ${priorityStyle.bg} ${priorityStyle.text}
                `}
              >
                {priorityStyle.label} Priority
              </span>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="
                ml-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700
                transition-colors duration-200 group
              "
              aria-label="Close panel"
            >
              <svg
                className="w-6 h-6 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* CLI Selector */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">
                Mode:
              </label>
              <select
                value={selectedCLI}
                onChange={(e) => setSelectedCLI(e.target.value as CLIType)}
                disabled={isExecuting || taskStarted}
                className="
                  flex-1 px-3 py-2 bg-white dark:bg-slate-900
                  border border-gray-300 dark:border-slate-600
                  rounded-lg text-sm text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {CLI_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} - {option.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Working Directory */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">
                Dir:
              </label>
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                disabled={isExecuting || taskStarted}
                placeholder="/path/to/working/directory"
                className="
                  flex-1 px-3 py-2 bg-white dark:bg-slate-900
                  border border-gray-300 dark:border-slate-600
                  rounded-lg text-sm text-gray-900 dark:text-gray-100
                  font-mono
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!taskStarted ? (
                <button
                  onClick={handleStartTask}
                  disabled={isExecuting}
                  className="
                    flex-1 px-4 py-2 bg-green-600 hover:bg-green-700
                    text-white rounded-lg text-sm font-medium
                    transition-colors duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2
                  "
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Start Task
                </button>
              ) : (
                <button
                  onClick={handleStopTask}
                  disabled={!isExecuting}
                  className="
                    flex-1 px-4 py-2 bg-red-600 hover:bg-red-700
                    text-white rounded-lg text-sm font-medium
                    transition-colors duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2
                  "
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                    />
                  </svg>
                  Stop Task
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50 dark:bg-slate-900">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  {isAICLI(selectedCLI) ? (
                    <svg
                      className="w-8 h-8 text-blue-600 dark:text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-8 h-8 text-blue-600 dark:text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {isAICLI(selectedCLI)
                    ? `${CLI_OPTIONS.find((opt) => opt.id === selectedCLI)?.name} is ready`
                    : "Type a command to get started"}
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                  {isAICLI(selectedCLI) ? (
                    <>The AI will automatically receive the task context</>
                  ) : (
                    <>
                      Try: <code className="bg-gray-200 dark:bg-slate-800 px-2 py-1 rounded">ls -la</code> or{' '}
                      <code className="bg-gray-200 dark:bg-slate-800 px-2 py-1 rounded">echo "Hello World"</code>
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`
                  flex gap-3 animate-in slide-in-from-bottom-2 duration-300
                  ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}
                `}
              >
                {/* Avatar */}
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                    ${
                      message.type === 'user'
                        ? 'bg-blue-600'
                        : message.type === 'error' || message.type === 'stderr'
                        ? 'bg-red-600'
                        : 'bg-gray-600 dark:bg-slate-700'
                    }
                  `}
                >
                  {message.type === 'user' ? (
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>

                {/* Message Content */}
                <div
                  className={`
                    flex-1 max-w-[80%] rounded-lg px-4 py-2
                    ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : message.type === 'error' || message.type === 'stderr'
                        ? 'bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200'
                        : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100'
                    }
                  `}
                >
                  <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                    {message.content}
                  </pre>
                  <p
                    className={`
                      text-xs mt-1
                      ${
                        message.type === 'user'
                          ? 'text-blue-200'
                          : 'text-gray-400 dark:text-gray-500'
                      }
                    `}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <div className="p-6 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <form onSubmit={handleSubmit} className="flex gap-3 items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !taskStarted
                  ? "Click 'Start Task' to begin..."
                  : isAICLI(selectedCLI)
                  ? "Ask a question or give instructions..."
                  : "Type a command (e.g. ls -la, echo hello)..."
              }
              disabled={isExecuting || !taskStarted}
              className="
                flex-1 px-4 py-3 bg-gray-50 dark:bg-slate-900
                border border-gray-300 dark:border-slate-600
                rounded-lg text-gray-900 dark:text-gray-100
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                font-mono text-sm
              "
            />
            <button
              type="submit"
              disabled={isExecuting || !inputValue.trim() || !taskStarted}
              className="
                px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white
                rounded-lg font-medium transition-colors duration-200
                flex items-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600
              "
            >
              {isExecuting ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Running
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  Send
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
