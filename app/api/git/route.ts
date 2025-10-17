import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'

const exec = promisify(execCallback)

export const runtime = 'nodejs'

// Helper to run git commands
async function runGitCommand(command: string, cwd: string): Promise<string> {
  try {
    const { stdout, stderr } = await exec(command, { cwd })
    if (stderr && !stderr.includes('Switched to') && !stderr.includes('Already on')) {
      console.warn('Git stderr:', stderr)
    }
    return stdout.trim()
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, basePath, taskId } = await request.json()

    switch (action) {
      case 'getBranch': {
        // Get current branch name
        const branch = await runGitCommand('git branch --show-current', basePath)
        return NextResponse.json({ success: true, branch })
      }

      case 'createWorktree': {
        // Get current branch
        const baseBranch = await runGitCommand('git branch --show-current', basePath)

        // Generate worktree path and branch name
        const timestamp = Date.now()
        const worktreePath = `/tmp/worktrees/${taskId}-${timestamp}`
        const worktreeBranch = `task/${taskId}-${timestamp}`

        // Create worktree
        await runGitCommand(
          `git worktree add -b ${worktreeBranch} ${worktreePath} ${baseBranch}`,
          basePath
        )

        return NextResponse.json({
          success: true,
          worktreePath,
          worktreeBranch,
          baseBranch,
        })
      }

      case 'getWorktreeStatus': {
        const { worktreePath } = await request.json()

        // Check if there are changes
        const status = await runGitCommand('git status --porcelain', worktreePath)
        const hasChanges = status.length > 0

        // Get commit count
        let commitCount = 0
        try {
          const commits = await runGitCommand('git rev-list --count HEAD ^origin/HEAD', worktreePath)
          commitCount = parseInt(commits) || 0
        } catch {
          // If there's no origin, just check local commits
          try {
            const log = await runGitCommand('git log --oneline', worktreePath)
            commitCount = log.split('\n').filter(l => l.trim()).length
          } catch {
            commitCount = 0
          }
        }

        return NextResponse.json({
          success: true,
          hasChanges,
          commitCount,
          status,
        })
      }

      case 'mergeWorktree': {
        const { worktreePath, worktreeBranch } = await request.json()

        // First, commit any pending changes in worktree
        try {
          const status = await runGitCommand('git status --porcelain', worktreePath)
          if (status.length > 0) {
            await runGitCommand('git add .', worktreePath)
            await runGitCommand(
              `git commit -m "Task completed: Auto-commit"`,
              worktreePath
            )
          }
        } catch (error) {
          console.warn('No changes to commit or commit failed:', error)
        }

        // Switch back to base branch
        await runGitCommand('git checkout -', basePath)

        // Merge the worktree branch
        try {
          await runGitCommand(`git merge ${worktreeBranch} --no-ff -m "Merge task: ${worktreeBranch}"`, basePath)
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            error: 'Merge conflict detected. Please resolve manually.',
            details: error.message,
          })
        }

        // Clean up worktree
        await runGitCommand(`git worktree remove ${worktreePath} --force`, basePath)
        await runGitCommand(`git branch -d ${worktreeBranch}`, basePath)

        return NextResponse.json({
          success: true,
          message: 'Worktree merged and cleaned up successfully',
        })
      }

      case 'cleanupWorktree': {
        const { worktreePath, worktreeBranch } = await request.json()

        // Remove worktree and branch
        try {
          await runGitCommand(`git worktree remove ${worktreePath} --force`, basePath)
          await runGitCommand(`git branch -D ${worktreeBranch}`, basePath)
        } catch (error: any) {
          console.warn('Cleanup warning:', error.message)
        }

        return NextResponse.json({
          success: true,
          message: 'Worktree cleaned up',
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Git API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
