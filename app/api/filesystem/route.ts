import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json()

    // Default to home directory if no path provided
    const targetPath = path || homedir()

    // Read directory contents
    const entries = await readdir(targetPath, { withFileTypes: true })

    // Get info for each entry
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(targetPath, entry.name)
        try {
          const stats = await stat(fullPath)
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats.size,
            modified: stats.mtime,
            isHidden: entry.name.startsWith('.'),
          }
        } catch (error) {
          // Skip entries we can't access
          return null
        }
      })
    )

    // Filter out null entries and sort (directories first, then alphabetically)
    const validItems = items
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

    // Get parent directory
    const parent = targetPath === '/' ? null : join(targetPath, '..')

    return NextResponse.json({
      success: true,
      currentPath: targetPath,
      parent,
      items: validItems,
    })
  } catch (error: any) {
    console.error('Filesystem API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to read directory',
      },
      { status: 500 }
    )
  }
}
