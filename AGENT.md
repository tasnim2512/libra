# AGENT.md

AI coding agent guidance for Libra - AI-powered web development platform on Cloudflare Workers.

## Build/Test Commands
- `bun dev` - Start all services in development
- `bun dev:web` - Start only web app (most common for development)
- `bun build` - Build all packages
- `bun typecheck` - Type checking across monorepo
- `bun test` - Run tests at root level
- `cd apps/web && bun test` - Run tests for specific app
- `bun test:watch` - Run tests in watch mode
- `bun lint` / `bun lint:fix` - Lint code using Biome
- `bun format` / `bun format:fix` - Format code using Biome

## Architecture
Turborepo monorepo with apps/ (Next.js web, Hono services), packages/ (shared libs: api/tRPC, auth/better-auth, db/Drizzle ORM, ui/shadcn), tooling/. Dual database: PostgreSQL (business) + D1 (auth). Cloudflare Workers deployment with OpenNext adapter.

## Code Style (Biome Configuration)
- Single quotes, trailing commas (ES5), semicolons as needed
- 2-space indentation, 100 char line width
- Import organization enabled
- Use template literals, const assertions, self-closing elements
- TypeScript with Zod validation for APIs
- React 19 + Next.js 15 patterns
