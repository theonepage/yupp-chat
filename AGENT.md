# AGENT.md - Yupp Chat AI Chatbot

## Commands
- **Dev**: `pnpm dev` (Next.js with Turbo)
- **Build**: `pnpm build` (runs migrations + build)
- **Lint**: `pnpm lint` (ESLint + Biome)
- **Format**: `pnpm format` (Biome formatter)
- **Test**: `pnpm test` (Playwright e2e tests)
- **Test Single**: `pnpm exec playwright test --project=e2e tests/e2e/specific.test.ts`
- **DB Migrate**: `pnpm db:migrate`
- **DB Studio**: `pnpm db:studio`

## Architecture
- Next.js 15 App Router with `app/` directory structure
- PostgreSQL database with Drizzle ORM (`lib/db/`)
- NextAuth.js v5 for authentication (`app/(auth)/`)
- AI SDK integration in `lib/ai/` with multiple providers
- UI components in `components/` (Radix UI + Tailwind)
- Code editor and artifacts functionality in `lib/editor/` and `lib/artifacts/`

## Code Style
- **Formatting**: Biome (2 spaces, 80 chars, single quotes for JS, double for JSX)
- **Imports**: TypeScript path resolution, no organize imports
- **Types**: Prefer explicit types, zod for validation
- **Components**: Functional components with TypeScript
- **Files**: kebab-case for files, PascalCase for components
- **Database**: Drizzle schema in `lib/db/schema.ts`
