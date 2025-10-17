import { KanbanBoardNoSsr } from '@/components/KanbanBoardNoSsr'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            demo board 03bis
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            My Kanban Flow
          </p>
        </header>

        {/* Kanban Board */}
        <main>
          <KanbanBoardNoSsr />
        </main>
      </div>
    </div>
  )
}
