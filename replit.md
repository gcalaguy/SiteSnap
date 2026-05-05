# Site Snap

Site Snap is a multi-tenant AI-powered project management and collaboration tool for Canadian construction companies.

## Run & Operate

To run the application:
- **Run**: `pnpm run start` (starts both API and web dashboard in dev mode)
- **Build All**: `pnpm run build`
- **Typecheck All**: `pnpm run typecheck`
- **Codegen API**: `pnpm --filter @workspace/api-spec run codegen`
- **Push DB Schema (dev)**: `pnpm --filter @workspace/db run push`
- **Migrate Production DB (after deploy)**: `DATABASE_URL=<prod_url> pnpm --filter @workspace/db run migrate`

Required Environment Variables:
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `SESSION_SECRET` (random 32+ char string)
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY` (if billing is active)
- `STRIPE_WEBHOOK_SECRET` (if billing is active)
- `QB_CLIENT_ID`, `QB_CLIENT_SECRET` (for QuickBooks integration)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (for Twilio SMS)

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (Replit-managed, multi-tenant)
- **Web Frontend**: React + Vite (Tailwind CSS + shadcn/ui)
- **Mobile Frontend**: Expo SDK 54 React Native

## Where things live

- `artifacts/web-dashboard/` — Main web application
- `artifacts/api-server/` — Shared Express backend
  - `artifacts/api-server/src/lib/errors.ts` — API error class hierarchy
  - `artifacts/api-server/src/middlewares/errorHandler.ts` — Global error handler
  - `artifacts/api-server/src/routes/` — API endpoints
- `artifacts/mobile/` — Expo React Native application
  - `artifacts/mobile/shims/expo-secure-store.ts` — Expo Go compatibility shim
- `lib/api-spec/openapi.yaml` — OpenAPI specification (source of truth for API contracts)
- `lib/db/schema.ts` — Drizzle ORM database schema (source of truth for DB schema)
- `lib/api-zod/` — Zod schemas generated from OpenAPI
- `lib/api-client-react/` — React Query hooks and API client generated from OpenAPI
- `scripts/src/seed-products.ts` — Stripe product seeding

## Architecture decisions

- **Async Error Handling**: All API route handlers use `asyncHandler` to centralize error management and reduce boilerplate.
- **Unified API Error Structure**: Custom error classes (`BadRequestError`, `NotFoundError`, etc.) ensure consistent API error responses with `HTTP` status, `code`, and optional `details`.
- **Pre-signed URL for File Uploads**: Client-side direct uploads to GCS using pre-signed URLs offload the API server from handling large file streams.
- **Offline-First Mobile with Sync Queue**: Mobile app uses `AsyncStorage` and `NetInfo` to queue daily reports when offline, syncing automatically when connectivity is restored.
- **Centralized Notification System**: A `notify()` helper consolidates DB record insertion and push notification sending, ensuring consistency and preventing self-notifications.
- **AI RAG for Document Q&A**: Utilizes `pgvector` for semantic search on document chunks, providing contextual answers via GPT-4o, with fallbacks to keyword search.

## Product

- Multi-tenant project management for small Canadian construction companies.
- Team collaboration tools (tasks, daily reports, RFIs).
- AI-powered features:
    - Daily report summaries
    - Cost analysis and recommendations
    - RFI draft generation
    - Smart Estimator (hybrid AI + rule-based)
    - Conversational AI assistant (context-aware)
    - AI-generated quotes and invoices
    - OCR + AI extraction from documents (receipts, invoices)
    - Voice-to-text for notes, quotes, and invoices
    - AI Document Q&A (RAG)
- Financial tracking: quotes, invoices, payments, change orders.
- CRM: lead management (Kanban board), contact management.
- Safety forms with file attachments.
- Push notifications for tasks and RFIs.
- Admin panel for plan/feature management and Stripe billing integration.
- Referral system for company growth.
- Mobile application for field crews (iOS/Android).

## User preferences

- _Populate as you build_

## Gotchas

- **Orval Codegen for `lib/api-zod`**: After codegen, `lib/api-zod/src/index.ts` should *only* contain `export * from "./generated/api";`. If other exports appear, manually correct it.
- **Stripe/`stripe-replit-sync` Bundling**: These libraries must be externalized in `esbuild` configuration as they rely on `__dirname` for loading migration files.
- **Stripe Migration Conflict**: Ensure `stripe.invoice_status` enum is pre-created in the database before `stripe-replit-sync` migrations run to avoid conflicts with the public schema's `invoice_status`.
- **Expo Go Compatibility**: Tab screens in the mobile app must *not* directly import from `@clerk/clerk-expo` due to `ExpoCryptoAES` native module issues. Use `@/utils/auth` and `customFetch` instead. Clear `/tmp/metro-cache` if Metro issues persist.
- **`customFetch` Usage**: For non-generated API calls (e.g., AI chat), use the `customFetch` exported from `lib/api-client-react/src/index.ts` to ensure the Bearer token is automatically attached.

## Pointers

- **Clerk Documentation**: [https://clerk.com/docs](https://clerk.com/docs)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/docs](https://orm.drizzle.team/docs)
- **React Query Documentation**: [https://tanstack.com/query/latest/docs](https://tanstack.com/query/latest/docs)
- **OpenAPI Specification**: [https://swagger.io/specification/](https://swagger.io/specification/)
- **Expo Documentation**: [https://docs.expo.dev/](https://docs.expo.dev/)
- **Stripe Documentation**: [https://stripe.com/docs](https://stripe.com/docs)
- **Resend Documentation**: [https://resend.com/docs](https://resend.com/docs)
- **pgvector Documentation**: [https://github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)