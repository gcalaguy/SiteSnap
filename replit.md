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

### ✅ Phase 2 — DATA & FEATURE LAYER (Complete)
- Real OpenAI GPT calls replacing mocked AI agents (daily report, cost analysis, RFI)
- Photo upload on daily reports (presigned URL flow via object storage)
- Task management: kanban board per project (Todo / In Progress / Done), CRUD
- DB tables: `tasks`, `daily_report_photos`, `conversations`, `messages`
- New API routes: `GET/POST /projects/:id/tasks`, `PATCH/DELETE /projects/:id/tasks/:taskId`
- New API routes: `GET/POST /projects/:id/daily-reports/:rid/photos`, `DELETE .../photos/:photoId`
- New API routes: `POST /storage/uploads/request-url`, `GET /storage/public-objects/*`
- Project detail now has 5 tabs: Overview, Tasks, Daily Reports, Cost Analysis, RFIs

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

## AI Agents (Phase 2 — REAL OpenAI)

All three AI agents now make real OpenAI `gpt-5.4` calls via the Replit AI Integration proxy (`@workspace/integrations-openai-ai-server`). Responses are JSON-structured by the model.

- `POST /api/ai/daily-report/generate` — structures raw site notes into a daily report
- `POST /api/ai/cost-analysis/generate` — analyzes cost breakdown and produces recommendations
- `POST /api/ai/rfi/generate` — formalizes RFI description and suggests clarifying questions

## Database Schema

Tables: `companies`, `users`, `invitations`, `projects`, `daily_reports`, `cost_analyses`, `rfis`, `tasks`, `daily_report_photos`, `conversations`, `messages`
Enums: `user_role`, `project_status`, `rfi_status`, `rfi_priority`, `invitation_status`, `task_status`, `task_priority`

## Notes

- Orval codegen fix: after running `pnpm --filter @workspace/api-spec run codegen`, manually rewrite `lib/api-zod/src/index.ts` to only export from `./generated/api` (orval regenerates stale exports referencing `api.schemas` which doesn't exist for zod output)
- `lib/api-client-react/src/generated/` has BOTH `api.ts` and `api.schemas.ts` — its barrel is correct
- Object storage uses presigned URL flow: client POSTs to `/api/storage/uploads/request-url`, then PUTs file directly to the returned GCS URL
