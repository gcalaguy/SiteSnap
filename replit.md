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

### ✅ Phase 3 — MOBILE APP (Complete)
- Expo mobile app (`artifacts/mobile`) for field crews using Expo Go (SDK 54)
- 6 tabs: Home, Projects, Log (daily reports + AI assist), Ask AI (chat), Tasks, Profile
- Clerk auth with AsyncStorage token cache (SecureStore shimmed for Expo Go compatibility)
- Connected to real Express API with full auth
- Metro shim: `artifacts/mobile/shims/expo-secure-store.ts` redirects expo-secure-store → AsyncStorage (required for Expo Go)
- `@tanstack/react-query` is peerDependency only in `lib/api-client-react` (prevents duplicate QueryClient)

### ✅ Phase 4 — AI CHAT ASSISTANT (Complete)
- `POST /api/ai/assistant` — conversational AI chat for field crew
- Sends company context (active projects, dashboard stats, recent activity) with every message
- Mobile chat tab (`app/(tabs)/ask.tsx`): dark header, message bubbles, quick-start chips, typing indicator
- Backend uses gpt-5.4 with BuildCore-specific system prompt for Canadian construction

### ✅ Phase 5 — PUSH NOTIFICATIONS + BUDGET (Complete)
- **Push notifications**: `pushToken` column on `users` table (nullable); `POST /api/users/push-token` stores device token
- Mobile `_layout.tsx` `AuthSetup` registers for Expo push notifications on sign-in (requests permission, gets token, sends to API)
- `artifacts/api-server/src/lib/push.ts` — fire-and-forget Expo push helper (never throws)
- `artifacts/api-server/src/lib/notify.ts` — unified `notify()` helper: inserts DB record + sends push; never notifies self
- Task creation and re-assignment call `notify()`; RFI creation calls `notify()` when `assignedToUserId` is set
- Notifications show in foreground (alert + sound + badge) via `Notifications.setNotificationHandler`
- `expo-notifications@^0.32.x` installed (SDK-54 compatible); plugin added to `app.json`
- **Notification inbox** (`notifications` table): `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`
- Mobile `app/notifications.tsx` screen: full list with unread indicator (orange dot), type icon (task/RFI), time-ago, "Mark all read" button, tap → project detail
- Mobile home tab header now shows a bell icon with orange badge (unread count); taps open the notifications screen; count polls every 60s
- **Budget on project cards**: `budget` field added to web Create Project dialog (optional CAD amount with `$` icon)
- Project listing cards now show budget in orange with `$` icon when set; detail page already had it

### ⏳ Phase 5 — OFFLINE MODE (Pending)

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
- `POST /api/ai/assistant` — conversational chat assistant for field crew (context-aware)

## Database Schema

Tables: `companies`, `users`, `invitations`, `projects`, `daily_reports`, `cost_analyses`, `rfis`, `tasks`, `daily_report_photos`, `conversations`, `messages`, `notifications`
`users` has `pushToken text` (nullable) for Expo push tokens.
`notifications`: userId, type ("task"|"rfi"), title, body, referenceId, projectId, isRead (boolean, default false), createdAt.
Enums: `user_role`, `project_status`, `rfi_status`, `rfi_priority`, `invitation_status`, `task_status`, `task_priority`

## Auth Architecture

### Web Dashboard
- `ClerkAuthTokenSetter` component in `App.tsx` registers Clerk's `getToken()` as the global auth token getter via `setAuthTokenGetter` (from `@workspace/api-client-react`)
- Uses `useLayoutEffect` (not `useEffect`) so the token getter is set before React Query fires any requests
- All API calls through `customFetch` automatically get `Authorization: Bearer <token>` headers

### Mobile App
- `AuthSetup` component in root `_layout.tsx` registers both the token getter (`setAuthTokenGetter`) and the sign-out function (`setSignOut` from `@/utils/auth`)
- Tab screens MUST NOT import directly from `@clerk/clerk-expo` — doing so crashes Expo Go with `Cannot find native module 'ExpoCryptoAES'`
- Use `customFetch` from `@workspace/api-client-react` for API calls (token is auto-attached)
- Use `signOut()` from `@/utils/auth` for sign-out (wired through `_layout.tsx`)

## Notes

- Orval codegen fix: after running `pnpm --filter @workspace/api-spec run codegen`, manually rewrite `lib/api-zod/src/index.ts` to ONLY `export * from "./generated/api";` — orval regenerates stale exports referencing `api.schemas` that don't exist for zod output. Also fix `lib/api-client-react/src/index.ts` to NOT export `./generated/api.schemas` (the client codegen puts everything in `api.ts`)
- Object storage uses presigned URL flow: client POSTs to `/api/storage/uploads/request-url`, then PUTs file directly to the returned GCS URL
- Expo Go compatibility: `expo-secure-store` shimmed via `artifacts/mobile/metro.config.js` → `artifacts/mobile/shims/expo-secure-store.ts` (uses AsyncStorage). Required because Clerk v2 imports expo-secure-store internally. CRITICAL: Tab screens cannot import from `@clerk/clerk-expo` or the app crashes with `ExpoCryptoAES` — use `@/utils/auth` and `customFetch` instead. If Metro cache is stale, delete `/tmp/metro-cache` and restart the workflow.
- `customFetch` is exported from `lib/api-client-react/src/index.ts` — use it directly for non-generated API calls (e.g., AI chat endpoint) as it automatically attaches the Bearer token
