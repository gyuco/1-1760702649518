'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const KanbanBoardLazy = dynamic(
  () => import('./KanbanBoard').then((mod) => mod.KanbanBoard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full py-24 text-center text-sm text-gray-500">
        Loading Kanban board…
      </div>
    ),
  }
)

export function KanbanBoardNoSsr(props: ComponentProps<typeof KanbanBoardLazy>) {
  return <KanbanBoardLazy {...props} />
}
