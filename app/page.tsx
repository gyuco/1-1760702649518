import { KanbanBoard } from '@/components/KanbanBoard'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Project Kanban Board
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            Drag and drop cards between columns to manage your workflow
          </p>
        </header>

        {/* Kanban Board */}
        <main>
          <KanbanBoard />
        </main>
      </div>
    </div>
  )
}
