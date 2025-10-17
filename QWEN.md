# Next.js Kanban Board Application with Coding Assistant Executors

## Project Overview

This is a Next.js 15 application that includes:
1. A fully interactive Kanban board with drag-and-drop functionality
2. A set of Rust-based executor modules for various coding assistants
3. Modern UI built with React 19, Tailwind CSS, and TypeScript

The application serves as both a project management tool (Kanban board) and a platform for integrating with various AI coding assistants through Model Context Protocol (MCP).

## Architecture

### Frontend (Next.js App)
- **Framework**: Next.js 15 with App Router and React 19
- **Styling**: Tailwind CSS with Geist font integration
- **State Management**: React hooks with client-side state
- **Drag & Drop**: @dnd-kit/core library for sophisticated drag-and-drop interactions
- **Structure**:
  - `app/` - Next.js App Router routes and API handlers
  - `components/` - Reusable UI components for the Kanban board
  - `public/` - Static assets
  - `executors/` - Rust modules for coding assistant integration

### Backend/Executors (Rust)
- **Language**: Rust with async support
- **Purpose**: Executor modules for various coding assistants (Qwen, Claude, Copilot, etc.)
- **Features**: MCP (Model Context Protocol) integration, session management, command execution
- **Structure**: 
  - Individual modules for each coding assistant (Claude, Qwen, Copilot, etc.)
  - Centralized executor management in `mod.rs`

### Key Components

#### Kanban Board
- Interactive drag-and-drop board with columns (To Do, In Progress, In Review, Done)
- Card details panel with priority indicators
- Client-side state management for card positions
- Responsive design for different screen sizes

#### Coding Assistant Executors
- Support for multiple AI coding assistants (Qwen, Claude, Copilot, Gemini, etc.)
- MCP (Model Context Protocol) configuration and integration
- Session management and follow-up capabilities
- Command execution and output handling

## Building and Running

### Prerequisites
- Node.js 18+ (recommended)
- pnpm package manager
- Rust compiler (for executor modules)

### Setup Commands
```bash
pnpm install      # Install dependencies
pnpm dev          # Start development server with Turbopack
pnpm build        # Create production build
pnpm start        # Run production build locally
```

### Development Workflow
- The development server runs on `http://localhost:3000`
- Hot module replacement enabled via Turbopack
- TypeScript type checking integrated
- Tailwind CSS JIT compilation

## Development Conventions

### Code Style
- TypeScript with React 19 functional components and hooks
- 2-space indentation
- Single quotes for strings
- No semicolons
- PascalCase for components, camelCase for functions
- Lowercase hyphenated for Next.js route segments

### File Organization
- `app/` - Next.js routes and API handlers
- `components/` - Reusable UI components
- `executors/` - Rust modules for coding assistants
- `public/` - Static assets
- Root-level config files for build settings

### Styling
- Tailwind CSS utility-first approach
- Global styles in `app/globals.css`
- Responsive design using Tailwind's breakpoints
- Dark mode support built-in

## Testing Guidelines

- Automated tests not yet configured (TODO: Setup Vitest and React Testing Library)
- Manual testing required for drag-and-drop functionality
- Test on multiple browsers before merging
- Accessibility considerations to be added

## Security Considerations

- Environment variables stored in `.env.local` (not committed)
- Public variables prefixed with `NEXT_PUBLIC_`
- Dependency review required before adding new packages
- MCP configuration paths handled securely

## Special Features

### MCP (Model Context Protocol) Integration
- Rust executors support MCP for AI assistant communication
- Session management for follow-up conversations
- Configurable endpoints for different AI providers

### Drag-and-Drop Functionality
- Advanced drag-and-drop using @dnd-kit
- Keyboard navigation support
- Touch-friendly interactions
- Visual feedback during drag operations

### Dynamic Component Loading
- SSR-safe component loading using Next.js `dynamic`
- Loading states for better UX
- Client-only component rendering where needed

This project combines a modern web application with sophisticated AI assistant integration through Rust-based executors, making it a unique hybrid of frontend productivity tools and backend AI integration capabilities.