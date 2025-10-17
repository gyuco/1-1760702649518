'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { DetailPanel } from './DetailPanel'

// Type definitions
export type Priority = 'low' | 'medium' | 'high'

export interface Card {
  id: string
  title: string
  description: string
  priority: Priority
  columnId: string
}

export interface Column {
  id: string
  title: string
  cardIds: string[]
}

// Sample data
const initialCards: Card[] = [
  {
    id: '1',
    title: 'Change board title',
    description: 'Change the title Project Kanban Board to Giuseppe Concas Kanban Board',
    priority: 'high',
    columnId: 'todo',
  },
  {
    id: '2',
    title: 'Setup authentication',
    description: 'Implement user login and registration flow',
    priority: 'high',
    columnId: 'todo',
  },
  {
    id: '3',
    title: 'API integration',
    description: 'Connect frontend with backend REST API endpoints',
    priority: 'medium',
    columnId: 'in-progress',
  },
  {
    id: '4',
    title: 'Database schema',
    description: 'Design and implement PostgreSQL database schema',
    priority: 'medium',
    columnId: 'in-progress',
  },
  {
    id: '5',
    title: 'Code review',
    description: 'Review pull requests for authentication module',
    priority: 'low',
    columnId: 'in-review',
  },
  {
    id: '6',
    title: 'Unit tests',
    description: 'Write comprehensive unit tests for core features',
    priority: 'medium',
    columnId: 'in-review',
  },
  {
    id: '7',
    title: 'Project setup',
    description: 'Initialize Next.js project with TypeScript and Tailwind',
    priority: 'low',
    columnId: 'done',
  },
  {
    id: '8',
    title: 'CI/CD pipeline',
    description: 'Setup GitHub Actions for automated testing and deployment',
    priority: 'high',
    columnId: 'done',
  },
]

const initialColumns: Column[] = [
  { id: 'todo', title: 'To Do', cardIds: ['1', '2'] },
  { id: 'in-progress', title: 'In Progress', cardIds: ['3', '4'] },
  { id: 'in-review', title: 'In Review', cardIds: ['5', '6'] },
  { id: 'done', title: 'Done', cardIds: ['7', '8'] },
]

export function KanbanBoard() {
  const [cards, setCards] = useState<Card[]>(initialCards)
  const [columns, setColumns] = useState<Column[]>(initialColumns)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Get active card being dragged
  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeId),
    [activeId, cards]
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveId(null)
      return
    }

    const activeCardId = active.id as string
    const overId = over.id as string

    // Find active card
    const activeCard = cards.find((card) => card.id === activeCardId)
    if (!activeCard) {
      setActiveId(null)
      return
    }

    // Determine the target column
    let targetColumnId: string

    // Check if dropped over a column
    const isOverColumn = columns.some((col) => col.id === overId)
    if (isOverColumn) {
      targetColumnId = overId
    } else {
      // Dropped over a card, find which column that card belongs to
      const overCard = cards.find((card) => card.id === overId)
      if (!overCard) {
        setActiveId(null)
        return
      }
      targetColumnId = overCard.columnId
    }

    // If card is moved to a different column
    if (activeCard.columnId !== targetColumnId) {
      // Update cards
      setCards((prevCards) =>
        prevCards.map((card) =>
          card.id === activeCardId
            ? { ...card, columnId: targetColumnId }
            : card
        )
      )

      // Update columns
      setColumns((prevColumns) => {
        return prevColumns.map((column) => {
          // Remove card from old column
          if (column.id === activeCard.columnId) {
            return {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== activeCardId),
            }
          }
          // Add card to new column
          if (column.id === targetColumnId) {
            // If dropped over a specific card, insert at that position
            if (!isOverColumn && overId !== activeCardId) {
              const overIndex = column.cardIds.indexOf(overId)
              const newCardIds = [...column.cardIds]
              newCardIds.splice(overIndex, 0, activeCardId)
              return { ...column, cardIds: newCardIds }
            }
            // Otherwise, add to end
            return {
              ...column,
              cardIds: [...column.cardIds, activeCardId],
            }
          }
          return column
        })
      })
    } else if (overId !== activeCardId) {
      // Reordering within the same column
      setColumns((prevColumns) => {
        return prevColumns.map((column) => {
          if (column.id === targetColumnId) {
            const oldIndex = column.cardIds.indexOf(activeCardId)
            const newIndex = column.cardIds.indexOf(overId)
            const newCardIds = [...column.cardIds]
            newCardIds.splice(oldIndex, 1)
            newCardIds.splice(newIndex, 0, activeCardId)
            return { ...column, cardIds: newCardIds }
          }
          return column
        })
      })
    }

    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const handleCardClick = (card: Card) => {
    setSelectedCard(card)
    setIsPanelOpen(true)
  }

  const handleClosePanel = () => {
    setIsPanelOpen(false)
    // Small delay before clearing selected card to allow animation to complete
    setTimeout(() => setSelectedCard(null), 300)
  }

  return (
    <div className="w-full h-full p-4 sm:p-6 lg:p-8">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {columns.map((column) => {
            const columnCards = cards.filter(
              (card) => card.columnId === column.id
            )
            return (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={columnCards}
                onCardClick={handleCardClick}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="rotate-3 opacity-90">
              <KanbanCard card={activeCard} isDragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail Panel */}
      {selectedCard && (
        <DetailPanel
          card={selectedCard}
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
        />
      )}
    </div>
  )
}
