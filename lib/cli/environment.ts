'use server'

import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { CliStrategy, CLIType, getCliStrategy, isAiCli } from './strategies'

async function ensureTrustedFolder(configDir: string, workspaceDir: string) {
  const trustFile = path.join(configDir, 'trustedFolders.json')
  const current = await (async () => {
    try {
      const raw = await fs.readFile(trustFile, 'utf8')
      return raw.trim() ? JSON.parse(raw) : {}
    } catch (error: any) {
      if (error && error.code === 'ENOENT') {
        return {}
      }
      throw error
    }
  })()
  if (current[workspaceDir] === 'TRUST_FOLDER') {
    return
  }
  current[workspaceDir] = 'TRUST_FOLDER'
  await fs.mkdir(path.dirname(trustFile), { recursive: true })
  await fs.writeFile(trustFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 })
}

async function ensureSettings(strategy: CliStrategy, workspaceDir: string) {
  const home = os.homedir()

  switch (strategy.id) {
    case 'gemini': {
      const geminiDir = path.join(home, '.gemini')
      await ensureTrustedFolder(geminiDir, workspaceDir)
      break
    }
    case 'qwen': {
      const qwenDir = path.join(home, '.qwen')
      await ensureTrustedFolder(qwenDir, workspaceDir)
      break
    }
    default:
      break
  }
}

export async function prepareCliEnvironment(mode: CLIType, cwd: string) {
  if (!isAiCli(mode)) {
    return
  }

  const strategy = getCliStrategy(mode)
  await ensureSettings(strategy, cwd)
}
