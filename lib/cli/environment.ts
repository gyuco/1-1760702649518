'use server'

import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { CliStrategy, CLIType, getCliStrategy, isAiCli } from './strategies'

type JsonRecord = Record<string, any>

async function readJson(filePath: string): Promise<JsonRecord> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    if (!raw.trim()) {
      return {}
    }
    return JSON.parse(raw)
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

async function writeJson(filePath: string, data: JsonRecord) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

async function ensureTrustedFolder(configDir: string, workspaceDir: string) {
  const trustFile = path.join(configDir, 'trustedFolders.json')
  const current = await readJson(trustFile)
  if (current[workspaceDir] === 'TRUST_FOLDER') {
    return
  }
  current[workspaceDir] = 'TRUST_FOLDER'
  await writeJson(trustFile, current)
}

function mergeAllowedTools(existing: unknown, required: readonly string[]) {
  const current = Array.isArray(existing) ? new Set(existing as string[]) : new Set<string>()
  for (const tool of required) {
    current.add(tool)
  }
  return Array.from(current)
}

async function ensureSettings(strategy: CliStrategy, workspaceDir: string) {
  const home = os.homedir()

  switch (strategy.id) {
    case 'gemini': {
      const geminiDir = path.join(home, '.gemini')
      const settingsPath = path.join(geminiDir, 'settings.json')
      const settings = await readJson(settingsPath)

      settings.security = settings.security || {}
      settings.security.folderTrust = settings.security.folderTrust || {}
      settings.security.folderTrust.featureEnabled = true
      settings.security.folderTrust.enabled = true

      if (strategy.allowedTools?.length) {
        settings.tools = settings.tools || {}
        settings.tools.allowed = mergeAllowedTools(settings.tools.allowed, strategy.allowedTools)
      }

      await writeJson(settingsPath, settings)
      await ensureTrustedFolder(geminiDir, workspaceDir)
      break
    }
    case 'qwen': {
      const qwenDir = path.join(home, '.qwen')
      const settingsPath = path.join(qwenDir, 'settings.json')
      const settings = await readJson(settingsPath)

      settings.security = settings.security || {}
      settings.security.folderTrust = settings.security.folderTrust || {}
      settings.security.folderTrust.featureEnabled = true
      settings.security.folderTrust.enabled = true

      if (strategy.allowedTools?.length) {
        settings.tools = settings.tools || {}
        settings.tools.allowed = mergeAllowedTools(settings.tools.allowed, strategy.allowedTools)
      }

      await writeJson(settingsPath, settings)
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
