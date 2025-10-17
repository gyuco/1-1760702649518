export type CLIType = 'command' | 'gemini' | 'qwen' | 'amp' | 'claude' | 'codex'

export interface CliStrategy {
  id: CLIType
  name: string
  description: string
  /**
   * Command parts where index 0 is the executable and the remaining parts are
   * initial arguments. Only required for AI CLIs; shell commands are handled
   * separately by the caller.
   */
  baseCommand?: string[]
  /**
   * Arguments that should always be appended after the base command.
   */
  staticArgs?: string[]
  /**
   * Tool identifiers to pass through `--allowed-tools`.
   */
  allowedTools?: string[]
  /**
   * Additional environment variables required by the CLI.
   */
  env?: Record<string, string>
  /**
   * Human readable tool names exposed to the operator.
   */
  displayTools?: string[]
  /**
   * Guidance bullets rendered in the UI for contributors.
   */
  guidance?: string[]
}

export interface CliInvocation {
  command: string
  args: string[]
  env?: Record<string, string>
}

const GEMINI_ALLOWED_TOOLS = [
  'read_file',
  'read_many_files',
  'search_file_content',
  'list_directory',
  'glob',
  'run_shell_command',
  'replace',
  'write_file',
  'web_fetch',
  'google_web_search',
  'save_memory',
  'write_todos_list',
] as const

const QWEN_ALLOWED_TOOLS = [
  'read_file',
  'read_many_files',
  'search_file_content',
  'list_directory',
  'glob',
  'run_shell_command',
  'edit',
  'write_file',
  'web_fetch',
  'web_search',
  'save_memory',
  'todo_write',
  'task',
  'exit_plan_mode',
] as const

export const CLI_STRATEGIES: Record<CLIType, CliStrategy> = {
  command: {
    id: 'command',
    name: 'Shell Command',
    description: 'Execute arbitrary shell commands in the workspace',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini AI',
    description: 'Google Gemini CLI with ACP support',
    baseCommand: ['npx', '-y', '@google/gemini-cli@0.8.1'],
    staticArgs: ['--experimental-acp', '--approval-mode', 'auto_edit'],
    allowedTools: [...GEMINI_ALLOWED_TOOLS],
    env: {
      NODE_NO_WARNINGS: '1',
    },
    displayTools: [
      'read_file',
      'read_many_files',
      'search_file_content',
      'list_directory',
      'glob',
      'run_shell_command',
      'replace',
      'write_file',
      'web_fetch',
      'google_web_search',
      'save_memory',
      'write_todos_list',
    ],
    guidance: [
      'Inspect files with read_file / read_many_files before editing.',
      'Use replace for targeted modifications or write_file for full rewrites.',
      'Paths must be absolute; combine the workspace root with relative paths.',
      'run_shell_command executes project scripts—record meaningful output.',
      'Avoid legacy tool names like write_file (snake_case already expected).',
    ],
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen AI',
    description: 'Qwen Code CLI with ACP support',
    baseCommand: ['npx', '-y', '@qwen-code/qwen-code@0.0.14'],
    staticArgs: ['--experimental-acp', '--approval-mode', 'auto-edit'],
    allowedTools: [...QWEN_ALLOWED_TOOLS],
    env: {
      NODE_NO_WARNINGS: '1',
    },
    displayTools: [
      'read_file',
      'read_many_files',
      'search_file_content',
      'list_directory',
      'glob',
      'run_shell_command',
      'edit',
      'write_file',
      'web_fetch',
      'web_search',
      'save_memory',
      'todo_write',
      'task',
      'exit_plan_mode',
    ],
    guidance: [
      'Use read_file / read_many_files and search_file_content to gather context.',
      'Prefer edit for patch-style changes; fall back to write_file for full replacements.',
      'Maintain TODO updates with todo_write and close loops with exit_plan_mode.',
      'Leverage run_shell_command for validations and capture output highlights.',
      'All tool invocations operate on absolute paths within the trusted workspace.',
    ],
  },
  amp: {
    id: 'amp',
    name: 'AMP AI',
    description: 'Sourcegraph AMP CLI with ACP support',
    baseCommand: ['npx', '-y', '@sourcegraph/amp@0.0.1759507289-g3e67fa'],
    staticArgs: ['--execute', '--stream-json'],
    allowedTools: [...QWEN_ALLOWED_TOOLS], // Using similar tools as Qwen
    env: {
      NODE_NO_WARNINGS: '1',
    },
    displayTools: [
      'read_file',
      'read_many_files',
      'search_file_content',
      'list_directory',
      'glob',
      'run_shell_command',
      'edit',
      'write_file',
      'web_fetch',
      'web_search',
      'save_memory',
      'todo_write',
      'task',
      'exit_plan_mode',
    ],
    guidance: [
      'Use read_file and search_file_content to gather context before making changes.',
      'Prefer edit for precise modifications; use write_file for complete file overwrites.',
      'Leverage run_shell_command to execute project commands and validate changes.',
      'All paths are relative to the workspace root unless specified as absolute.',
      'Use task for complex multi-step operations and todo_write to track progress.',
    ],
  },
  claude: {
    id: 'claude',
    name: 'Claude AI',
    description: 'Anthropic Claude Code CLI with ACP support',
    baseCommand: ['npx', '-y', '@anthropic-ai/claude-code@2.0.17'],
    staticArgs: ['-p', '--verbose', '--output-format=stream-json', '--include-partial-messages'],
    allowedTools: [...QWEN_ALLOWED_TOOLS], // Using similar tools as Qwen
    env: {
      NODE_NO_WARNINGS: '1',
    },
    displayTools: [
      'read_file',
      'read_many_files',
      'search_file_content',
      'list_directory',
      'glob',
      'run_shell_command',
      'edit',
      'write_file',
      'web_fetch',
      'web_search',
      'save_memory',
      'todo_write',
      'task',
      'exit_plan_mode',
    ],
    guidance: [
      'Start with read_file and search_file_content to understand the codebase.',
      'Use edit for targeted changes and write_file for complete rewrites.',
      'Run shell commands to test and validate your changes interactively.',
      'Use web_fetch for external research and documentation lookup.',
      'Track your task progress with todo_write and exit_plan_mode when complete.',
    ],
  },
  codex: {
    id: 'codex',
    name: 'Codex AI',
    description: 'OpenAI Codex CLI with ACP support',
    baseCommand: ['npx', '-y', '@openai/codex@0.46.0', 'app-server'],
    allowedTools: [...QWEN_ALLOWED_TOOLS], // Using similar tools as Qwen
    env: {
      NODE_NO_WARNINGS: '1',
      NO_COLOR: '1',
      RUST_LOG: 'error',
    },
    displayTools: [
      'read_file',
      'read_many_files',
      'search_file_content',
      'list_directory',
      'glob',
      'run_shell_command',
      'edit',
      'write_file',
      'web_fetch',
      'web_search',
      'save_memory',
      'todo_write',
      'task',
      'exit_plan_mode',
    ],
    guidance: [
      'Use read_file to examine existing code before making modifications.',
      'Use search_file_content to find related implementations across the codebase.',
      'Prefer edit for precise changes, and write_file for creating new files.',
      'Execute run_shell_command to test your changes and run project scripts.',
      'Use todo_write to maintain progress tracking and exit_plan_mode to complete tasks.',
    ],
  },
}

export const CLI_OPTIONS = Object.values(CLI_STRATEGIES)

export const isAiCli = (mode: string): mode is Exclude<CLIType, 'command'> =>
  mode === 'gemini' || mode === 'qwen' || mode === 'amp' || mode === 'claude' || mode === 'codex'

// CLIs that support ACP protocol (can use /api/session with persistent sessions)
export const supportsAcp = (mode: string): boolean =>
  mode === 'gemini' || mode === 'qwen' || mode === 'amp' || mode === 'codex'

// CLIs that use stdin/stdout directly (use /api/execute)
export const usesStdinStdout = (mode: string): boolean =>
  mode === 'claude'

export const getCliStrategy = (mode: CLIType): CliStrategy => CLI_STRATEGIES[mode]

export function buildCliInvocation(
  strategy: CliStrategy,
  context: { cwd?: string }
): CliInvocation {
  if (!strategy.baseCommand || strategy.baseCommand.length === 0) {
    throw new Error(`CLI strategy "${strategy.id}" does not define a base command`)
  }

  const [command, ...baseArgs] = strategy.baseCommand
  const args: string[] = [...baseArgs]

  if (strategy.staticArgs?.length) {
    args.push(...strategy.staticArgs)
  }

  if (strategy.allowedTools?.length) {
    for (const tool of strategy.allowedTools) {
      args.push('--allowed-tools', tool)
    }
  }

  // Note: Claude Code CLI operates in the current working directory by default
  // The --include-directories option is not supported and has been removed

  return {
    command,
    args,
    env: strategy.env,
  }
}
