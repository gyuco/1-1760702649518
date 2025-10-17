export type CLIType = 'command' | 'gemini' | 'qwen'

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
    staticArgs: ['--experimental-acp', '--approval-mode', 'auto_edit'],
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
}

export const CLI_OPTIONS = Object.values(CLI_STRATEGIES)

export const isAiCli = (mode: string): mode is Exclude<CLIType, 'command'> =>
  mode === 'gemini' || mode === 'qwen'

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

  if (context.cwd) {
    args.push('--include-directories', context.cwd)
  }

  return {
    command,
    args,
    env: strategy.env,
  }
}
