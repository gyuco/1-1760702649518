'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, Priority } from './KanbanBoard'
import { DirectoryPicker } from './DirectoryPicker'
import {
  CLI_OPTIONS,
  CLIType,
  isAiCli,
} from '@/lib/cli/strategies'

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

// Generate unique ID for messages
let messageIdCounter = 0
const generateMessageId = () => {
  messageIdCounter++
  return `${Date.now()}-${messageIdCounter}-${Math.random().toString(36).substring(2, 9)}`
}

export function DetailPanel({ card, isOpen, onClose }: DetailPanelProps) {
  const priorityStyle = priorityStyles[card.priority]
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [selectedCLI, setSelectedCLI] = useState<CLIType>('command')
  const [contextSent, setContextSent] = useState(false)
  const [workingDirectory, setWorkingDirectory] = useState(process.cwd ? process.cwd() : '/tmp')
  const [baseDirectory, setBaseDirectory] = useState(process.cwd ? process.cwd() : '/tmp') // Original directory
  const [taskStarted, setTaskStarted] = useState(false)
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [worktreeInfo, setWorktreeInfo] = useState<{
    path: string
    branch: string
    baseBranch: string
    basePath: string
  } | null>(null)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false)
  const [aiSessionId, setAiSessionId] = useState<string | null>(null)
  const [aiSessionActive, setAiSessionActive] = useState(false)
  const [pendingContext, setPendingContext] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send pending context when session becomes active
  useEffect(() => {
    if (aiSessionActive && pendingContext && !contextSent) {
      const sendPendingContext = async () => {
        const sent = await sendToAISession(pendingContext, { silent: true, force: true })
        if (sent) {
          const contextMsg: Message = {
            id: generateMessageId(),
            type: 'system',
            content: '📋 Context sent to AI',
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, contextMsg])
          setContextSent(true)
          setPendingContext(null)
        }
      }
      sendPendingContext()
    }
  }, [aiSessionActive, pendingContext, contextSent])

  // Reset context when CLI changes
  useEffect(() => {
    setContextSent(false)
    setMessages([])
    setTaskStarted(false)
    setPendingContext(null)
  }, [selectedCLI])

  // Fetch current branch when panel opens
  useEffect(() => {
    if (isOpen && workingDirectory) {
      fetchCurrentBranch()
    }
  }, [isOpen, workingDirectory])

  const fetchCurrentBranch = async () => {
    try {
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getBranch',
          basePath: workingDirectory,
        }),
      })
      const data = await response.json()
      if (data.success) {
        setCurrentBranch(data.branch)
      }
    } catch (error) {
      console.error('Failed to fetch branch:', error)
    }
  }

  const startAISession = async (targetCwd?: string): Promise<string | null> => {
    const sessionId = `${card.id}-${Date.now()}`
    setAiSessionId(sessionId)

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          sessionId,
          mode: selectedCLI,
          cwd: targetCwd || (worktreeInfo ? worktreeInfo.path : workingDirectory),
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.status}`)
      }

      setAiSessionActive(true)

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No reader available')
      }

      // Read session output in background
      const readLoop = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n').filter((line) => line.trim())

            for (const line of lines) {
              try {
                const data = JSON.parse(line)

                if (data.type === 'stdout') {
                  try {
                    const structured = JSON.parse(data.data)
                    if (structured?.event === 'prompt_result') {
                      const stopReason = structured?.payload?.stopReason || 'unknown'
                      const completionMsg: Message = {
                        id: generateMessageId(),
                        type: 'system',
                        content: `✅ AI task completed (stop reason: ${stopReason}). Review changes and merge when ready.`,
                        timestamp: new Date(),
                      }
                      setMessages((prev) => [...prev, completionMsg])
                      setTaskStarted(false)
                      setAiSessionActive(false)
                      setPendingContext(null)
                      setShowMergeDialog(true)
                      continue
                    }
                  } catch {
                    // Ignore JSON parse errors and treat as regular output
                  }
                }

                // Filter out unwanted system messages
                const shouldSkip =
                  data.type === 'start' ||
                  data.data.includes('Process exited with code 0') ||
                  data.data.includes('Executing:')

                if (data.type === 'close') {
                  const isClean = data.data.includes('code 0')
                  const closeMessage: Message = {
                    id: generateMessageId(),
                    type: isClean ? 'system' : 'error',
                    content: isClean
                      ? 'Session closed by the agent.'
                      : `Session ended unexpectedly: ${data.data}`,
                    timestamp: new Date(),
                  }
                  setMessages((prev) => [...prev, closeMessage])
                  continue
                }

                if (!shouldSkip && data.data.trim()) {
                  const message: Message = {
                    id: generateMessageId(),
                    type:
                      data.type === 'stdout'
                        ? 'stdout'
                        : data.type === 'stderr'
                        ? 'stderr'
                        : 'system',
                    content: data.data,
                    timestamp: new Date(),
                  }
                  setMessages((prev) => [...prev, message])
                }
              } catch (e) {
                console.error('Failed to parse message:', e)
              }
            }
          }
        } catch (error) {
          console.error('Session read error:', error)
        } finally {
          setAiSessionActive(false)
          setAiSessionId(null)
          setTaskStarted(false)
          setContextSent(false)
        }
      }

      readLoop()
      return sessionId
    } catch (error: any) {
      const errorMessage: Message = {
        id: generateMessageId(),
        type: 'error',
        content: error.message || 'Failed to start AI session',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
      setAiSessionActive(false)
      setTaskStarted(false)
      return null
    }
  }

  const sendToAISession = async (
    message: string,
    options: { silent?: boolean; sessionIdOverride?: string; force?: boolean } = {}
  ): Promise<boolean> => {
    const targetSessionId = options.sessionIdOverride ?? aiSessionId
    const isActive = options.force ? true : aiSessionActive

    if (!targetSessionId || !isActive) {
      if (!options.silent) {
        const errorMessage: Message = {
          id: generateMessageId(),
          type: 'error',
          content:
            'AI session is not running. Review the latest logs and press "Start Task" to reconnect.',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
      return false
    }

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          sessionId: targetSessionId,
          args: [message],
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const errorText =
          (payload && payload.error) || `Request failed with status ${response.status}`
        throw new Error(errorText)
      }
      return true
    } catch (error: any) {
      if (!options.silent) {
        const errorMessage: Message = {
          id: generateMessageId(),
          type: 'error',
          content: error?.message || 'Failed to send message',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
      return false
    }
  }

  const buildContextMessage = (worktree: {
    path: string
    branch: string
    baseBranch: string
    basePath: string
  }) => {
    const activeCLIOption = CLI_OPTIONS.find((opt) => opt.id === selectedCLI)

    const toolSection = activeCLIOption?.displayTools?.length
      ? `Available tools:\n- ${activeCLIOption.displayTools.join('\n- ')}`
      : null

    const guidanceSection = activeCLIOption?.guidance?.length
      ? `Usage guidelines:\n- ${activeCLIOption.guidance.join('\n- ')}`
      : null

    const contextParts: Array<string | null> = [
      `Task: ${card.title}`,
      `Description: ${card.description}`,
      `Priority: ${card.priority}`,
      `Status: ${card.columnId.replace('-', ' ')}`,
      `Working in: ${worktree.path}`,
      toolSection,
      guidanceSection,
      'Please propose a short plan before making changes, then execute it step by step. Confirm when the task is complete.',
    ]

    return contextParts.filter((part): part is string => Boolean(part)).join('\n\n')
  }

  const handleSendPendingContext = async () => {
    if (!pendingContext) {
      return
    }

    const sent = await sendToAISession(pendingContext)
    if (sent) {
      const contextMsg: Message = {
        id: generateMessageId(),
        type: 'system',
        content: '📋 Context sent to AI',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, contextMsg])
      setContextSent(true)
      setPendingContext(null)
    }
  }

  const executeCommand = async (command: string, skipUserMessage = false) => {
    if (!command.trim() || isExecuting) return

    // Add user message (unless skipped for context initialization)
    if (!skipUserMessage) {
      const userMessage: Message = {
        id: generateMessageId(),
        type: 'user',
        content: command,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
    }
    setInputValue('')
    setIsExecuting(true)

    // For AI CLIs ensure we have an active session
    if (isAiCli(selectedCLI)) {
      if (aiSessionActive && aiSessionId) {
        await sendToAISession(command)
      } else {
        const errorMessage: Message = {
          id: generateMessageId(),
          type: 'error',
          content:
            'AI session is not running. Review the latest logs and press "Start Task" to reconnect.',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
      setIsExecuting(false)
      return
    }

    // Prepare command based on CLI type
    // Direct shell command path
    const parts = command.trim().split(' ')
    const cmd = parts[0]
    const args = parts.slice(1)

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          args,
          mode: selectedCLI,
          // Use worktree path if active, otherwise use working directory
          cwd: worktreeInfo ? worktreeInfo.path : workingDirectory
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

            // Filter out unwanted system messages
            const shouldSkip =
              data.type === 'start' ||
              (data.type === 'close' && data.data.includes('code 0')) ||
              data.data.includes('Process exited with code 0') ||
              data.data.includes('Executing:')

            if (!shouldSkip && data.data.trim()) {
              const message: Message = {
                id: generateMessageId(),
                type: data.type === 'stdout' ? 'stdout' : data.type === 'stderr' ? 'stderr' : 'system',
                content: data.data,
                timestamp: new Date(),
              }
              setMessages((prev) => [...prev, message])
            }
          } catch (e) {
            console.error('Failed to parse message:', e)
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorMessage: Message = {
          id: generateMessageId(),
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

  const handleStartTask = async () => {
    try {
      let currentWorktree = worktreeInfo

      if (!currentWorktree) {
        setBaseDirectory(workingDirectory)

        const response = await fetch('/api/git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'createWorktree',
            basePath: workingDirectory,
            taskId: card.id,
          }),
        })

        const data = await response.json()
        if (!data.success) {
          throw new Error(data.error || 'Failed to create worktree')
        }

        currentWorktree = {
          path: data.worktreePath,
          branch: data.worktreeBranch,
          baseBranch: data.baseBranch,
          basePath: workingDirectory,
        }

        setWorktreeInfo(currentWorktree)

        const systemMsg: Message = {
          id: generateMessageId(),
          type: 'system',
          content: `🌿 Created worktree for task:\n\nWorktree: ${data.worktreePath}\nBranch: ${data.worktreeBranch}\nBase: ${data.baseBranch}\n\nWorking directory: ${workingDirectory}\n\n✨ All commands will run in the worktree. When done, merge back to ${data.baseBranch}.`,
          timestamp: new Date(),
        }
        setMessages([systemMsg])
      } else {
        const resumeMsg: Message = {
          id: generateMessageId(),
          type: 'system',
          content: '🔄 Resuming AI session in existing worktree...',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, resumeMsg])
      }

      if (!currentWorktree) {
        throw new Error('Worktree information is unavailable')
      }

      setTaskStarted(true)

      if (isAiCli(selectedCLI)) {
        const aiMsg: Message = {
          id: generateMessageId(),
          type: 'system',
          content: '🤖 Starting AI session...',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])

        const contextMessage = buildContextMessage(currentWorktree)
        setPendingContext(contextMessage)

        const startedSessionId = await startAISession(currentWorktree.path)
        if (!startedSessionId) {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 500))

        const sent = await sendToAISession(contextMessage, {
          silent: true,
          sessionIdOverride: startedSessionId,
          force: true,
        })

        if (sent) {
          const contextMsg: Message = {
            id: generateMessageId(),
            type: 'system',
            content: '📋 Context sent to AI',
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, contextMsg])
          setContextSent(true)
          setPendingContext(null)
        } else {
          // Even if initial send fails, try to send the context as soon as the session is active
          setPendingContext(contextMessage)
          setContextSent(false)
        }
      }
    } catch (error: any) {
      const errorMsg: Message = {
        id: generateMessageId(),
        type: 'error',
        content: `Failed to start task: ${error.message}`,
        timestamp: new Date(),
      }
      setMessages([errorMsg])
      setTaskStarted(false)
      setPendingContext(null)
    }
  }

  const handleStopTask = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsExecuting(false)
    setTaskStarted(false)
    setContextSent(false)
    setPendingContext(null)

    // End AI session if active
    if (aiSessionId && aiSessionActive) {
      try {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'end',
            sessionId: aiSessionId,
          }),
        })
      } catch (error) {
        console.error('Failed to end AI session:', error)
      }
      setAiSessionId(null)
      setAiSessionActive(false)
    }

    const stopMsg: Message = {
      id: generateMessageId(),
      type: 'system',
      content: '⚠️ Task stopped by user',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, stopMsg])

    // Show merge dialog if worktree exists
    if (worktreeInfo) {
      setShowMergeDialog(true)
    }
  }

  const handleMergeWorktree = async () => {
    if (!worktreeInfo) return

    try {
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mergeWorktree',
          basePath: worktreeInfo.basePath, // Use the stored original path
          worktreePath: worktreeInfo.path,
          worktreeBranch: worktreeInfo.branch,
          baseBranch: worktreeInfo.baseBranch,
        }),
      })

      const data = await response.json()
      if (data.success) {
        const mergeMsg: Message = {
          id: generateMessageId(),
          type: 'system',
          content: '✅ Worktree merged successfully!',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, mergeMsg])
      } else {
        throw new Error(data.error || 'Merge failed')
      }
    } catch (error: any) {
      const errorMsg: Message = {
        id: generateMessageId(),
        type: 'error',
        content: `Merge failed: ${error.message}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setShowMergeDialog(false)
      setWorktreeInfo(null)
    }
  }

  const handleCleanupWorktree = async () => {
    if (!worktreeInfo) return

    try {
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cleanupWorktree',
          basePath: worktreeInfo.basePath, // Use the stored original path
          worktreePath: worktreeInfo.path,
          worktreeBranch: worktreeInfo.branch,
        }),
      })

      const data = await response.json()
      const cleanupMsg: Message = {
        id: generateMessageId(),
        type: 'system',
        content: '🧹 Worktree cleaned up (changes discarded)',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, cleanupMsg])
    } catch (error: any) {
      console.error('Cleanup error:', error)
    } finally {
      setShowMergeDialog(false)
      setWorktreeInfo(null)
    }
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
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 font-mono truncate">
                  {workingDirectory || '/path/to/working/directory'}
                  {worktreeInfo && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                      (working in worktree)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowDirectoryPicker(true)}
                  disabled={isExecuting || taskStarted}
                  className="
                    px-4 py-2 bg-blue-600 hover:bg-blue-700
                    text-white rounded-lg text-sm font-medium
                    transition-colors duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center gap-2 whitespace-nowrap
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
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  Browse
                </button>
                {currentBranch && (
                  <span className="flex items-center gap-1 px-3 py-2 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-medium whitespace-nowrap">
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                    >
                      <path
                        fillRule="evenodd"
                        d="M11.5 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM9.05 3a2.5 2.5 0 014.9 0H16v1h-2.05a2.5 2.5 0 01-4.9 0H0V3h9.05zM4.5 7a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM2.05 8a2.5 2.5 0 014.9 0H16v1H6.95a2.5 2.5 0 01-4.9 0H0V8h2.05z"
                      />
                    </svg>
                    {currentBranch}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {worktreeInfo ? (
                <>
                  <button
                    onClick={handleStopTask}
                    className="
                      flex-1 px-4 py-2 bg-red-600 hover:bg-red-700
                      text-white rounded-lg text-sm font-medium
                      transition-colors duration-200
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
                  {isAiCli(selectedCLI) && (
                    <button
                      onClick={handleStartTask}
                      disabled={isExecuting || aiSessionActive}
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
                      {aiSessionActive ? 'Session Active' : 'Resume Session'}
                    </button>
                  )}
                </>
              ) : (
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
                  {isAiCli(selectedCLI) ? (
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
                  {isAiCli(selectedCLI)
                    ? `${CLI_OPTIONS.find((opt) => opt.id === selectedCLI)?.name} is ready`
                    : "Type a command to get started"}
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                  {isAiCli(selectedCLI) ? (
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
                  <pre className="text-sm font-mono whitespace-pre-wrap">
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
                : isAiCli(selectedCLI)
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
          {pendingContext && taskStarted && (
            <div className="mt-4 flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2">
              <span className="text-blue-700 dark:text-blue-200">
                Initial context not delivered. Send it now?
              </span>
              <button
                type="button"
                onClick={handleSendPendingContext}
                disabled={isExecuting || !aiSessionActive}
                className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Context
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Merge Dialog */}
      {showMergeDialog && worktreeInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Dialog Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMergeDialog(false)}
          />

          {/* Dialog Content */}
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Merge Worktree?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Do you want to merge the changes from the worktree back to the base branch?
                </p>
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-3 space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Branch:</span>
                    <span className="text-gray-900 dark:text-gray-100">{worktreeInfo.branch}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Base:</span>
                    <span className="text-gray-900 dark:text-gray-100">{worktreeInfo.baseBranch}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Path:</span>
                    <span className="text-gray-900 dark:text-gray-100 truncate">{worktreeInfo.path}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleMergeWorktree}
                className="
                  flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700
                  text-white rounded-lg font-medium
                  transition-colors duration-200
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Merge Changes
              </button>
              <button
                onClick={handleCleanupWorktree}
                className="
                  flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700
                  text-white rounded-lg font-medium
                  transition-colors duration-200
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Directory Picker */}
      <DirectoryPicker
        isOpen={showDirectoryPicker}
        currentPath={workingDirectory}
        onSelect={(selectedPath) => {
          setWorkingDirectory(selectedPath)
          fetchCurrentBranch()
          setShowDirectoryPicker(false)
        }}
        onClose={() => setShowDirectoryPicker(false)}
      />
    </>
  )
}
