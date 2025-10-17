'use client'

import { useState, useEffect } from 'react'

interface DirectoryPickerProps {
  isOpen: boolean
  currentPath: string
  onSelect: (path: string) => void
  onClose: () => void
}

interface FileSystemItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: Date
  isHidden: boolean
}

export function DirectoryPicker({
  isOpen,
  currentPath,
  onSelect,
  onClose,
}: DirectoryPickerProps) {
  const [path, setPath] = useState(currentPath)
  const [items, setItems] = useState<FileSystemItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [parent, setParent] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Use currentPath if provided, otherwise use current directory
      const startPath = currentPath && currentPath !== '/tmp' ? currentPath : process.cwd?.() || currentPath
      loadDirectory(startPath)
    }
  }, [isOpen])

  const loadDirectory = async (dirPath: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/filesystem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load directory')
      }

      setPath(data.currentPath)
      setItems(data.items)
      setParent(data.parent)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleItemClick = (item: FileSystemItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path)
    }
  }

  const handleSelect = () => {
    onSelect(path)
    onClose()
  }

  const filteredItems = showHidden ? items : items.filter((item) => !item.isHidden)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Select Directory
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-500 dark:text-gray-400"
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

          {/* Current Path */}
          <div className="flex items-center gap-2">
            {parent && (
              <button
                onClick={() => loadDirectory(parent)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                title="Go up"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-900 rounded-lg font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
              {path}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
                className="rounded"
              />
              Show hidden
            </label>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 dark:text-gray-500 text-sm">Empty directory</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  disabled={!item.isDirectory}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
                    transition-colors duration-150
                    ${
                      item.isDirectory
                        ? 'hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    }
                  `}
                >
                  {/* Icon */}
                  <div
                    className={`
                    w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                    ${
                      item.isDirectory
                        ? 'bg-blue-100 dark:bg-blue-950'
                        : 'bg-gray-100 dark:bg-slate-700'
                    }
                  `}
                  >
                    {item.isDirectory ? (
                      <svg
                        className="w-5 h-5 text-blue-600 dark:text-blue-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-gray-400 dark:text-gray-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`
                      text-sm font-medium truncate
                      ${
                        item.isDirectory
                          ? 'text-gray-900 dark:text-gray-100'
                          : 'text-gray-500 dark:text-gray-400'
                      }
                    `}
                    >
                      {item.name}
                    </p>
                  </div>

                  {/* Arrow for directories */}
                  {item.isDirectory && (
                    <svg
                      className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="
              flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300
              dark:bg-slate-700 dark:hover:bg-slate-600
              text-gray-900 dark:text-gray-100
              rounded-lg font-medium transition-colors duration-200
            "
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            className="
              flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700
              text-white rounded-lg font-medium
              transition-colors duration-200
              flex items-center justify-center gap-2
            "
          >
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            Select Directory
          </button>
        </div>
      </div>
    </div>
  )
}
