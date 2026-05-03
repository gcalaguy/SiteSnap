# Site Snap — Construction AI Assistant

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

### ✅ Phase 3 — DATA & FEATURE LAYER (Complete)
- **Cost bar chart**: Stacked BarChart (recharts) in Cost Analysis tab — Labour/Materials/Equipment/Other per period
- **Document upload/storage**: `project_documents` table; presigned URL upload to object storage; `GET/POST /projects/:id/documents`, `DELETE /projects/:id/documents/:id`
- **OCR + AI extraction**: `POST /projects/:id/documents/:id/extract` — GPT-4 vision reads receipts/photos → extracts vendor, amount, currency, date, line items, invoice #, project ref; images only (JPEG, PNG, WebP, GIF); other file types stored for manual download
- **Documents tab**: New tab on web project detail — upload button, file list with status badges (pending/processing/ready/failed), expandable AI extraction panel with line-item table, download button
- **Voice-to-text notes (web)**: Mic button on New Report page — MediaRecorder captures audio → `/api/ai/transcribe` (OpenAI STT) → transcribed text appended to raw notes field; recording pulse animation, error states
- **Voice-to-text notes (mobile)**: Mic button on Log Report screen — `expo-av` records audio → base64 → `/api/ai/transcribe` → appended to notes field; uses `useVoiceRecorder` hook at `artifacts/mobile/hooks/useVoiceRecorder.ts`; requests microphone permission before first use; haptic feedback on successful transcription
- **Photo capture (mobile)**: Photo strip on Log Report screen — up to 6 photos per report; action sheet offers Camera or Photo Library; `expo-image-picker` handles permissions; photos uploaded via presigned URL (GCS) after report creation; registered via `useAddReportPhoto`; submit button shows photo count and "Uploading…" progress; `expo-image-picker` plugin added to `app.json`
- **Offline queue (mobile)**: Full offline-first report capture using AsyncStorage + NetInfo; `context/OfflineQueueContext.tsx` holds the queue, monitors connectivity, and auto-syncs pending reports when coming back online; Log screen shows contextual banners (offline warning, syncing progress, failed report alert with Retry/Discard); submit button switches label to "Save Offline" and turns amber when disconnected; Log tab shows a red badge dot with pending count; failed items (after 3 attempts) surface an Options alert with Retry or Discard; `@react-native-community/netinfo` added to mobile deps
- **Daily digest email**: Automated morning digest at 7:00 AM ET via `node-cron` + Resend API; "Send Now" button in Settings page; HTML email with budget/RFI/task summary

### ✅ Phase 4 — QUOTES & INVOICES (Complete)
- **DB schema**: `quoteStatusEnum` (draft/pending_approval/approved/rejected/converted), `invoiceStatusEnum` (draft/sent/paid/overdue/cancelled), `quotesTable`, `invoicesTable` with `QuoteLineItem[]` JSON columns, HST tax (13% default), numeric totals. `invoicesTable` has `reminderSentAt timestamp` column.
- **AI quote generation**: `POST /api/ai/quote/generate` — voice/text description → GPT generates structured line items with realistic Canadian pricing + HST; returns title, lineItems, subtotal, taxAmount, total, notes
- **Quotes API**: Full CRUD at `GET/POST /projects/:projectId/quotes`, `GET/PUT/DELETE /projects/:projectId/quotes/:id`; status workflow: submit → approve/reject → convert-to-invoice; flat list at `GET /quotes?status=`
- **Invoices API**: `GET/PUT /invoices`, `GET /invoices/:id`, `POST /invoices/:id/mark-sent`, `POST /invoices/:id/mark-paid`, `POST /invoices/:id/send-email`, `POST /invoices/:id/send-reminder`; created from quote conversion with one-click
- **PDF generation (client-side)**: `jspdf` + `jspdf-autotable`; `buildPdfDoc()` is the shared builder; `downloadInvoicePDF()` saves; `buildPdfBase64()` returns base64 string for email attachment
- **Send via Email**: `POST /invoices/:id/send-email` — accepts base64 PDF from browser, sends HTML email + PDF attachment via Resend; sandbox mode returns `{ ok: false, sandboxWarning }` instead of 500
- **Payment reminders**: `POST /invoices/:id/send-reminder` — sends HTML reminder email (with overdue day count badge); marks `reminderSentAt`; auto-cron at 8:00 AM ET scans all sent/overdue invoices with past due date and `reminderSentAt` null or >7 days ago
- **Quotes web page** (`/quotes`): List with status tabs (All/Draft/Pending/Approved/Rejected/Invoiced), quote number + client + total, link to detail
- **Quote detail** (`/quotes/:id`): AI fill panel with voice input + text → generate line items; inline editable line item table; save, submit, approve, reject, convert to invoice buttons with confirmation dialogs; auto-calculates HST totals
- **New Quote** (`/quotes/new`): Form for title, client name/email, valid until, notes — creates draft then opens editor
- **Invoices web page** (`/invoices`): Outstanding + Collected summary cards, status tabs, list with due dates
- **Invoice detail** (`/invoices/:id`): Full invoice view; Download PDF, Send via Email, Send Reminder, Mark Sent, Mark Paid buttons; shows sentAt/paidAt/reminderSentAt dates
- **Nav**: Quotes + Invoices added to AppLayout sidebar (FileText + Receipt icons)

### ✅ Phase 4 — MOBILE APP (Complete)
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

### ✅ Phase 7 — REFERRAL SYSTEM (Complete)
- **DB**: `referral_code` (unique, 8-char hex auto-generated on company creation) + `referred_by_code` columns added to `companies` table via direct SQL migration
- **`POST /companies`**: auto-generates `referralCode` via `crypto.randomBytes(4).toString("hex").toUpperCase()`; accepts optional `referredByCode` in request body
- **`GET /api/referrals`**: returns `{ referralCode, referralLink, referralCount }` — link is `https://<domain>/onboarding?ref=<code>`; count is companies whose `referredByCode` matches
- **`GET /api/referrals/validate/:code`**: public endpoint to verify a referral code + returns referring company name
- **Web onboarding**: reads `?ref=` query param and passes `referredByCode` to company creation
- **Web admin panel**: "Refer a Contractor" card with monospace link + copy button (2s "Copied!" flash) + referral count
- **Mobile profile tab**: "Referrals" section with referral count + link preview + "Share with a Contractor" button (native Share sheet)

### ✅ Phase 6 — ADMIN PANEL + STRIPE BILLING (Complete)
- **Stripe integration**: `stripe` + `stripe-replit-sync` at workspace root; connected via Replit Stripe integration; `stripeClient.ts` in api-server + scripts dirs
- **DB columns**: `stripeCustomerId` + `stripeSubscriptionId` added to `companiesTable` (billing per company/tenant)
- **Stripe schema init**: `runMigrations()` at server startup with pre-flight creation of `stripe.invoice_status` type (avoids enum conflict with `public.invoice_status`); `stripe` and `stripe-replit-sync` externalized in esbuild so migration files resolve correctly
- **Webhook**: registered BEFORE `express.json()` in app.ts at `/api/stripe/webhook`; managed webhook created via `findOrCreateManagedWebhook()`; backfill runs in background
- **3 subscription plans** seeded via `scripts/src/seed-products.ts`:
  - BuildCore Starter: $49 CAD/mo or $490/yr — up to 3 seats
  - BuildCore Pro: $99 CAD/mo or $990/yr — up to 10 seats (most popular)
  - BuildCore Business: $199 CAD/mo or $1990/yr — unlimited seats
- **Billing API routes** (`artifacts/api-server/src/routes/billing.ts`):
  - `GET /api/billing/plans` — products + prices from `stripe` schema (public)
  - `GET /api/billing/subscription` — current company subscription
  - `POST /api/billing/checkout` — create Stripe checkout session (owner only); creates Stripe customer on first use
  - `POST /api/billing/portal` — create Stripe billing portal session (owner only)
- **Admin panel** (`/admin`): owner-only; subscription status card, plan cards with monthly/annual toggle, team seats card, company details card; "Manage Billing" opens Stripe portal; "Get Started"/"Switch Plan" redirects to Stripe checkout
- **Sidebar**: "Admin & Billing" link (ShieldCheck icon) visible only to owners under a separate "Admin" section

### ✅ Sprint — VOICE INVOICES/QUOTES + EXPORT (Complete)
- **AI invoice generation**: `POST /api/ai/invoice/generate` — voice/text description → GPT generates structured invoice line items with realistic Canadian pricing + HST; mirrors quote generate endpoint
- **Mobile Finance hub** (`artifacts/mobile/app/finance.tsx`): tabbed Invoices / Quotes list with voice FAB, AI modal (uses `useVoiceRecorder` callback pattern), voice→AI→preview→create flow for both invoices and quotes
- **Mobile invoice detail** (`artifacts/mobile/app/invoice/[id].tsx`): PDF export (expo-print HTML→PDF→expo-sharing), Excel export (xlsx), send email (PDF base64 → `/api/invoices/:id/send-email`), mark sent/paid, send reminder
- **Mobile quote detail** (`artifacts/mobile/app/quote/[id].tsx`): PDF export, Excel export, submit/approve/reject/convert-to-invoice actions
- **Finance card on mobile home**: Quick-access card on home screen navigates to `/finance`
- **Web invoice detail Excel export**: Excel button added using `xlsx` (`XLSX.writeFile`), `FileSpreadsheet` icon; icon changed from non-existent `Sheet` → `FileSpreadsheet`
- **Web quote detail PDF + Excel export**: jsPDF dynamic import for PDF (client-side), xlsx for Excel; `QuoteForExport` type defined for type-safe export function
- **Installed packages**: `expo-print`, `expo-sharing`, `xlsx` (mobile); `xlsx` (web-dashboard)

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

### ✅ Sprint — VOICE QUOTES ON PROJECT DETAIL (Complete)
- **Web `QuotesTab` component** (`artifacts/web-dashboard/src/components/QuotesTab.tsx`): Embeds inside project detail "Quotes" tab; "New Voice Quote" button opens a 3-step dialog (describe job by voice/type → AI fills materials & pricing → create quote); quote list shows project-specific quotes with status badges; inline approval workflow action bar on each card — Draft→Submit, Pending→Approve/Reject, Approved→Convert to Invoice (one-click with confirmation), Converted→"Invoice created" badge; all cards link to full `/quotes/:id` editor
- **Mobile `QuotesTab` component** (`artifacts/mobile/components/QuotesTab.tsx`): Same flow but mobile-native RN; voice FAB (orange circle mic button) opens modal; step 1 — type/record description; step 2 — AI preview table with line items + HST totals; step 3 — create quote; quote cards show inline action buttons (Submit / Approve / Reject / Convert to Invoice) with `Alert` confirmations; `useVoiceRecorder` hook for mic; haptic feedback
- **Web project detail** (`project-detail.tsx`): Added "Quotes" tab as 8th tab (grid-cols-8); `<QuotesTab projectId={projectId} />` in TabsContent
- **Mobile project detail** (`project/[id].tsx`): Added "Quotes" to TABS array; renders `<QuotesTab projectId={projectId} />` in the tab switcher
- **Approval step**: All status transitions (draft→pending→approved→converted) are available inline on the card without navigating to the detail page; reject uses AlertDialog/Alert confirmation; convert sends user to the new invoice immediately

### ✅ Sprint — AI DOCUMENT Q&A (RAG) (Complete)
- **pgvector**: `CREATE EXTENSION IF NOT EXISTS vector` enabled; `document_chunks` table with `vector(1536)` embedding column and `ivfflat` cosine index
- **PDF text extraction**: `pdf-parse` v2.x (`PDFParse` class API, `new PDFParse({ data: buffer }).getText()`) extracts full text from PDFs — replaces filename-only profiling
- **Word text extraction**: `mammoth` extracts raw text from `.docx` / `.doc` files for analysis and embedding
- **Chunking**: `chunkText()` splits text into ~900-char chunks with 150-char overlap, splitting by paragraphs then sentences
- **Embeddings**: `text-embedding-3-small` (1536 dims, OpenAI) embedded in batches of 20; stored in `document_chunks` via `embedAndStoreChunks()` — auto-triggered after any document analysis
- **Semantic search**: `semanticSearch()` embeds the query, runs `<=> vector_cosine_ops` pgvector search for top-8 chunks with similarity > 0.15
- **`POST /api/projects/:id/documents/qa`**: RAG path — embed query → cosine search → GPT-4o with chunk context + multi-turn history; fallback to extractedText stuffing when no embeddings exist
- **`POST /api/projects/:id/documents/:id/embed`**: manual re-embed endpoint for already-analyzed docs
- **`GET /api/projects/:id/documents`**: now returns `chunkCount` per document (from `document_chunks` table)
- **`POST /api/projects/:id/documents/search`**: tries semantic chunk search first; falls back to LLM keyword search
- **Multi-turn chat**: both web and mobile QAPanel send last-10 messages as `history` to `/qa` for real conversation context
- **RAG status badges**: web shows orange "RAG" badge on docs with embeddings; chat panel shows "Semantic RAG active" banner when embeddings are used
- **Mobile Metro fix**: `config.resolver.blockList` in `metro.config.js` excludes `pdf-parse_tmp_*` directories that Metro was trying to watch (causing ENOENT crash)
- **Construction starters**: both web + mobile Ask AI panels updated with construction-specific question prompts (invoices, vendors, scope, change orders, RFIs)

## Database Schema

Tables: `companies`, `users`, `invitations`, `projects`, `daily_reports`, `cost_analyses`, `rfis`, `tasks`, `daily_report_photos`, `conversations`, `messages`, `notifications`, `project_documents`, `document_chunks`, `quotes`, `invoices`
`users` has `pushToken text` (nullable) for Expo push tokens.
`notifications`: userId, type ("task"|"rfi"), title, body, referenceId, projectId, isRead (boolean, default false), createdAt.
Enums: `user_role`, `project_status`, `rfi_status`, `rfi_priority`, `invitation_status`, `task_status`, `task_priority`, `document_status`

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

- Orval codegen: `lib/api-zod` uses `mode: "single"` with an absolute `target` path (no `workspace:`) so orval does NOT regenerate `index.ts`. After codegen, `lib/api-zod/src/index.ts` must only contain `export * from "./generated/api";` — if it gains a second line, rewrite it. `lib/api-client-react` uses `mode: "split"` with `workspace:` and generates both `api.ts` + `api.schemas.ts` (both real files); its `index.ts` exports all four things correctly.
- Cron jobs: 7:00 AM ET — daily digest email; 8:00 AM ET — overdue invoice reminders (resend every 7 days)
- esbuild externals: `stripe` and `stripe-replit-sync` must be in the `external` array in `build.mjs` — they use `__dirname` to load migration files and cannot be bundled
- Stripe migration conflict: `stripe-replit-sync`'s invoices migration checks `pg_type WHERE typname = 'invoice_status'` without schema filter; our public enum is found first so `stripe.invoice_status` is skipped. Fixed by pre-creating `stripe.invoice_status` via pool before `runMigrations()` in index.ts
- Object storage uses presigned URL flow: client POSTs to `/api/storage/uploads/request-url`, then PUTs file directly to the returned GCS URL
- Expo Go compatibility: `expo-secure-store` shimmed via `artifacts/mobile/metro.config.js` → `artifacts/mobile/shims/expo-secure-store.ts` (uses AsyncStorage). Required because Clerk v2 imports expo-secure-store internally. CRITICAL: Tab screens cannot import from `@clerk/clerk-expo` or the app crashes with `ExpoCryptoAES` — use `@/utils/auth` and `customFetch` instead. If Metro cache is stale, delete `/tmp/metro-cache` and restart the workflow.
- `customFetch` is exported from `lib/api-client-react/src/index.ts` — use it directly for non-generated API calls (e.g., AI chat endpoint) as it automatically attaches the Bearer token
