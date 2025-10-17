'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanCard } from './KanbanCard'
import type { Card, Column } from './KanbanBoard'

interface KanbanColumnProps {
  column: Column
  cards: Card[]
  onCardClick: (card: Card) => void
}

// Column color schemes
const columnStyles: Record<string, { bg: string; header: string; border: string }> = {
  'todo': {
    bg: 'bg-slate-50 dark:bg-slate-900/50',
    header: 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100',
    border: 'border-slate-300 dark:border-slate-700',
  },
  'in-progress': {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    header: 'bg-blue-500 text-white',
    border: 'border-blue-300 dark:border-blue-800',
  },
  'in-review': {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    header: 'bg-amber-500 text-white',
    border: 'border-amber-300 dark:border-amber-800',
  },
  'done': {
    bg: 'bg-green-50 dark:bg-green-950/30',
    header: 'bg-green-600 text-white',
    border: 'border-green-300 dark:border-green-800',
  },
}

export function KanbanColumn({ column, cards, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  const style = columnStyles[column.id] || columnStyles['todo']

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-lg border-2 transition-all duration-200
        ${style.border}
        ${isOver ? 'ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-slate-950' : ''}
      `}
    >
      {/* Column Header */}
      <div
        className={`
          px-4 py-3 rounded-t-md font-semibold text-sm uppercase tracking-wide
          flex items-center justify-between
          ${style.header}
        `}
      >
        <span>{column.title}</span>
        <span className="text-xs font-normal bg-white/20 px-2 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>

      {/* Cards Container */}
      <div
        className={`
          flex-1 p-3 space-y-3 min-h-[200px] sm:min-h-[300px] lg:min-h-[500px]
          ${style.bg}
          rounded-b-md
        `}
      >
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.length > 0 ? (
            cards.map((card) => <KanbanCard key={card.id} card={card} onClick={() => onCardClick(card)} />)
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-gray-600 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-md">
              Drop cards here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}
