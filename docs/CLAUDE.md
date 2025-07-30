# CLAUDE.md - Yupp Chat AI Chatbot

## Project Overview
Yupp Chat is a Next.js 15 AI chatbot application built with the AI SDK, featuring real-time chat, document artifacts, and multi-model AI integration. It uses xAI Grok models by default with PostgreSQL for persistence and NextAuth.js for authentication.

## Quick Start Commands
- **Dev**: `pnpm dev` (Next.js with Turbo)
- **Build**: `pnpm build` (runs migrations + build)
- **Lint**: `pnpm lint` (ESLint + Biome)
- **Format**: `pnpm format` (Biome formatter)
- **Test**: `pnpm test` (Playwright e2e tests)
- **Test Single**: `pnpm exec playwright test --project=e2e tests/e2e/specific.test.ts`
- **DB Migrate**: `pnpm db:migrate`
- **DB Studio**: `pnpm db:studio`

## Architecture Overview

### Core Technologies
- **Frontend**: Next.js 15 App Router with React 19 RC
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js v5
- **AI**: AI SDK with xAI Grok models
- **UI**: Radix UI + Tailwind CSS
- **Testing**: Playwright for e2e tests
- **Code Quality**: Biome for formatting/linting

### Directory Structure
```
app/
├── (auth)/           # Authentication routes and logic
│   ├── auth.ts       # NextAuth configuration
│   ├── login/        # Login page
│   └── register/     # Registration page
├── (chat)/           # Main chat application
│   ├── api/          # API routes for chat, documents, files
│   ├── chat/[id]/    # Individual chat pages
│   └── page.tsx      # Main chat interface
└── layout.tsx        # Root layout

lib/
├── ai/               # AI integration and models
│   ├── models.ts     # Chat model definitions
│   ├── providers.ts  # AI provider configuration
│   ├── prompts.ts    # System prompts
│   └── tools/        # AI tools (weather, documents, etc.)
├── db/               # Database schema and queries
│   ├── schema.ts     # Drizzle database schema
│   ├── queries.ts    # Database query helpers
│   └── migrations/   # Database migrations
├── editor/           # Code editor functionality
└── artifacts/        # Document artifact system

components/           # React components
├── ui/              # Base UI components (Radix + Tailwind)
├── chat.tsx         # Main chat interface
├── artifact.tsx     # Document artifact display
├── code-editor.tsx  # Code editing component
└── ...              # Other chat components

artifacts/           # Artifact type implementations
├── code/            # Code artifact handling
├── text/            # Text document handling
├── image/           # Image artifact handling
└── sheet/           # Spreadsheet handling
```

## Database Schema (lib/db/schema.ts)

### Core Tables
- **User**: User accounts with email/password
- **Chat**: Chat sessions with visibility settings
- **Message_v2**: Chat messages with parts and attachments
- **Vote_v2**: Message voting system
- **Document**: Artifacts (text, code, image, sheet)
- **Suggestion**: Document editing suggestions
- **Stream**: Chat streaming sessions

### Key Relationships
- Users have many Chats
- Chats have many Messages
- Messages can have Votes
- Users can create Documents
- Documents can have Suggestions

## AI Integration (lib/ai/)

### Models (lib/ai/models.ts:9-21)
```typescript
export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Chat model',
    description: 'Primary model for all-purpose chat',
  },
  {
    id: 'chat-model-reasoning',
    name: 'Reasoning model', 
    description: 'Uses advanced reasoning',
  },
];
```

### Providers (lib/ai/providers.ts:24-37)
- **Production**: xAI Grok models
  - `chat-model`: grok-2-vision-1212
  - `chat-model-reasoning`: grok-3-mini-beta with reasoning middleware
  - `title-model`: grok-2-1212
  - `artifact-model`: grok-2-1212
  - `small-model`: grok-2-image (image generation)
- **Test**: Mock models for testing

### AI Tools (lib/ai/tools/)
- **get-weather.ts**: Weather information tool
- **create-document.ts**: Create new artifacts
- **update-document.ts**: Update existing artifacts
- **request-suggestions.ts**: Generate document suggestions

## Key Components

### Chat Interface (components/chat.tsx)
Main chat component handling message display, input, and real-time streaming.

### Artifacts (components/artifact.tsx)
Document display system supporting:
- **Text**: Rich text documents with editing
- **Code**: Syntax-highlighted code with execution
- **Image**: Image generation and editing
- **Sheet**: Spreadsheet data with CSV support

### Authentication Flow
1. Middleware checks for auth token (middleware.ts:20-24)
2. Guest users get temporary access via `/api/auth/guest`
3. Registered users can login/register
4. Protected routes redirect to auth if needed

## API Routes (app/(chat)/api/)

### Chat System
- **POST /api/chat**: Create new chat
- **POST /api/chat/[id]/stream**: Stream chat responses
- **GET /api/history**: Get chat history

### Document System
- **POST /api/document**: Create/update documents
- **POST /api/files/upload**: File upload handling
- **POST /api/suggestions**: Generate document suggestions
- **POST /api/vote**: Vote on messages

## Development Workflow

### Code Style (AGENT.md:21-27)
- **Formatting**: Biome (2 spaces, 80 chars, single quotes for JS, double for JSX)
- **Files**: kebab-case for files, PascalCase for components
- **Types**: Explicit TypeScript types, Zod for validation
- **Imports**: TypeScript path resolution

### Testing
- **E2E Tests**: Playwright in `tests/e2e/`
- **Test Files**: `*.test.ts` pattern
- **Fixtures**: Reusable test data in `tests/fixtures.ts`

### Database Operations
- **Schema**: Defined in `lib/db/schema.ts`
- **Migrations**: Auto-generated in `lib/db/migrations/`
- **Queries**: Helper functions in `lib/db/queries.ts`
- **Studio**: `pnpm db:studio` for GUI management

## Environment Variables
Required environment variables (see `.env.example`):
- `POSTGRES_URL`: Database connection string
- `AUTH_SECRET`: NextAuth secret key
- `XAI_API_KEY`: xAI API key for Grok models

## Key Features

### Real-time Chat
- Streaming responses with AI SDK
- Message parts and attachments
- Vote system for message quality
- Chat history persistence

### Document Artifacts
- Live code execution and editing
- Rich text documents with suggestions
- Image generation and manipulation
- Spreadsheet data handling

### Authentication
- Email/password registration
- Guest access for demos
- Protected routes with middleware
- Session management with NextAuth

### Multi-modal AI
- Text generation and reasoning
- Image generation capabilities
- Code analysis and generation
- Weather data integration

## Performance Optimizations
- Next.js App Router with RSCs
- Turbo dev mode for fast rebuilds
- Streaming responses for real-time feel
- Optimized database queries with Drizzle
- Component-level code splitting

## Security Features
- CSRF protection via NextAuth
- SQL injection prevention with Drizzle
- Secure cookie handling
- Environment variable validation
- Input sanitization with Zod schemas