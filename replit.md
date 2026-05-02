# BuildCore — Construction AI Assistant

## Overview

BuildCore is a Construction AI Assistant MVP for small Canadian construction companies and contractors. It provides multi-tenant project management, team collaboration, and AI-powered tools for daily reports, cost analysis, and RFI generation.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (Replit-managed, multi-tenant)
- **Web frontend**: React + Vite (Tailwind CSS + shadcn/ui)

## Artifacts

- **web-dashboard** — Main web app for owners and foremen (`/`)
- **api-server** — Shared Express 5 backend (`/api`)
- **mockup-sandbox** — Canvas design sandbox (`/__mockup`)

## Phase Status

### ✅ Phase 1 — CORE PLATFORM (Complete)
- Multi-tenancy: companies as DB entities, users belong to one company
- Authentication: Clerk (email/password + OAuth)
- RBAC: Owner, Foreman, Worker roles
- Onboarding: create company OR accept email invitation
- Team management: invite members, change roles, remove members
- Project management: full CRUD (planning/active/on_hold/completed/cancelled)
- Daily Reports: create, view, AI-generated summaries (MOCKED)
- Cost Analysis: create entries, AI analysis (MOCKED)
- RFIs: create, respond, track status, AI draft generation (MOCKED)
- Dashboard: company-wide stats + recent activity feed

### ⏳ Phase 2 — DATA & FEATURE LAYER (Pending)
- Voice-to-text notes (text input placeholder)
- Photo & receipt upload
- OCR placeholder for receipts
- Document upload & storage
- Real AI summaries (replace mocked responses with LLM calls)
- Task management

### ⏳ Phase 3 — MOBILE APP (Pending)
- Expo mobile app for field crews
- Read-only project access
- Voice log submission

### ⏳ Phase 4 — OFFLINE MODE (Pending)

### ⏳ Phase 5 — QUOTING & INVOICING (Pending)

### ⏳ Phase 6 — PRODUCTIZATION / BILLING (Pending)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## AI Agents (Phase 1 — MOCKED)

All three AI agents in Phase 1 return deterministic template-driven responses. They are clearly isolated in `artifacts/api-server/src/routes/ai.ts` for easy replacement with real LLM calls in Phase 2.

- `POST /api/ai/daily-report/generate` — structures raw site notes into a daily report
- `POST /api/ai/cost-analysis/generate` — analyzes cost breakdown and produces recommendations
- `POST /api/ai/rfi/generate` — formalizes RFI description and suggests clarifying questions

## Database Schema

Tables: `companies`, `users`, `invitations`, `projects`, `daily_reports`, `cost_analyses`, `rfis`
Enums: `user_role`, `project_status`, `rfi_status`, `rfi_priority`, `invitation_status`

## Notes

- Orval codegen fix: after running `pnpm --filter @workspace/api-spec run codegen`, manually rewrite `lib/api-zod/src/index.ts` to only export from `./generated/api` (orval regenerates stale exports)
- AI agent responses are mocked in Phase 1 — real LLM integration happens in Phase 2
