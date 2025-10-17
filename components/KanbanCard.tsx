'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Priority } from './KanbanBoard'

interface KanbanCardProps {
  card: Card
  isDragging?: boolean
  onClick?: () => void
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

export function KanbanCard({ card, isDragging = false, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const priorityStyle = priorityStyles[card.priority]

  // Show dragging state
  const isBeingDragged = isDragging || isSortableDragging

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only trigger onClick if not dragging
        if (!isBeingDragged && onClick) {
          onClick()
        }
      }}
      className={`
        group relative bg-white dark:bg-slate-800 rounded-lg p-4
        shadow-sm hover:shadow-md border border-gray-200 dark:border-slate-700
        cursor-grab active:cursor-grabbing
        transition-all duration-200
        ${isBeingDragged ? 'opacity-50 ring-2 ring-blue-400' : 'opacity-100'}
      `}
      role="button"
      tabIndex={0}
      aria-label={`${card.title}. Priority: ${priorityStyle.label}. ${card.description}`}
      onKeyDown={(e) => {
        // Handle keyboard interactions
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (onClick) {
            onClick()
          }
        }
      }}
    >
      {/* Priority Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex-1 leading-tight">
          {card.title}
        </h3>
        <span
          className={`
            text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap
            ${priorityStyle.bg} ${priorityStyle.text}
          `}
          aria-label={`Priority: ${priorityStyle.label}`}
        >
          {priorityStyle.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        {card.description}
      </p>

      {/* Drag Indicator */}
      <div
        className="absolute top-2 left-2 opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none"
        aria-hidden="true"
      >
        <svg
          className="w-4 h-4 text-gray-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
        </svg>
      </div>
    </div>
  )
}
