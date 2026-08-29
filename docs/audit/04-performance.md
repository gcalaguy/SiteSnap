# Phase 4 — Performance Review

Bottleneck · impact · fix · expected improvement. Backend query specifics that overlap with schema are in `05-database.md`.

## Frontend (web dashboard)

### P1. Single 5.09 MB JS bundle — zero code-splitting
- **Bottleneck:** `web-dashboard/src/App.tsx` statically imports ~75 page modules; there is no `React.lazy`, no `Suspense`, no dynamic `import()` (verified by grep). Vite has no `manualChunks`. Built output: `dist/public/assets/index-*.js` = **5,089,668 B raw / 1,425,983 B gzip** in one chunk, plus a 160 KB CSS file.
- **Impact:** Every user — including a worker who only opens Daily Log on a phone — downloads `super-admin.tsx` (1439 LOC), `@react-pdf/renderer`, `jspdf`, `docx`, `xlsx`, `html2canvas`, and `recharts`. On a mid-tier mobile connection that's several seconds of transfer + parse before first paint. The Workbox service worker **precaches** this 5 MB blob (its `maximumFileSizeToCacheInBytes` was raised to 10 MB specifically to allow it — `src/sw.ts`), so the full cost is paid again on every deploy.
- **Fix:** Route-level `React.lazy(() => import('./pages/...'))` for every page in `App.tsx` behind a `Suspense` boundary; `manualChunks` to split vendor libs (`react-pdf`, `jspdf`, `docx`, `xlsx`, `recharts`, `html2canvas`) into async chunks loaded only where used. Add `rollup-plugin-visualizer` to CI to prevent regression.
- **Expected improvement:** Initial JS from ~1.43 MB gzip to a plausible ~200–350 KB gzip for the dashboard shell; heavy libs load on demand. Largest single win in the app.

### P2. Dead dependencies and assets shipped/installed
- **Bottleneck:** `@uppy/*` (×4) and `framer-motion` are declared deps with zero `src/` imports; `public/supersplat-viewer/` is a 2.9 MB static folder with no importers; dead file `src/pages/contacts.tsx.tmp.501.b907f4697893`. Repo root also carries a 31 MB `.mp4`, a 3.4 MB zip, 24 MB `attached_assets/`.
- **Impact:** Install/build weight, larger deploy artifacts, slower CI.
- **Fix:** Remove unused deps and the supersplat folder; delete the temp page file and root media (move to external storage or `.gitignore`).

### P3. Global dashboard invalidation on every mutation
- **Bottleneck:** `queryClient.ts:44-47` refetches the (heavy) dashboard summary + recent activity after every successful mutation app-wide. See `02-code-quality.md` B6.
- **Impact:** 2 extra network round-trips per write, many hitting one of the slowest endpoints.
- **Fix:** Scope invalidation to dashboard-affecting mutations.

### P4. Render-blocking Google Fonts + unminified CSS
- **Bottleneck:** Google Fonts via render-blocking `<link>` in `index.html`; Tailwind built with `optimize: false` in the Vite plugin → 160 KB CSS (23 KB gzip).
- **Impact:** Extra render-blocking round trip; larger CSS than necessary.
- **Fix:** `font-display: swap` (present) + preconnect/preload the primary face; enable Tailwind minification.

## Backend

### P5. Dashboard endpoint fires 5+ sequential `COUNT(*)` queries
- **Bottleneck:** `routes/dashboard.ts` runs individual `count(*)` queries against `quotes` (×2), `invoices`, `form_submissions`, `timesheets` largely sequentially (`:283-328`; only 2 `Promise.all` in the 820-line file).
- **Impact:** Dashboard latency = sum of 5+ round trips, each a filtered count; compounded by P3 (every mutation re-triggers it) and B1 (each runs inside the request's held transaction).
- **Fix:** Collapse into one query with conditional aggregates, or at minimum `Promise.all` the independent counts.
```sql
SELECT
  count(*) FILTER (WHERE t='quote'  AND status='pending_approval') AS pending_quotes,
  count(*) FILTER (WHERE t='invoice' AND status='draft')          AS draft_invoices, ...
-- or a UNION ALL of per-table grouped counts in a single round trip
```
- **Expected improvement:** ~5 round trips → 1; dashboard TTFB down proportionally.

### P6. N+1 in TradeHub feed and messaging
- **Bottleneck:** `services/tradehub/feedService.ts:28-45` (`enrichPost`) issues up to **7 queries per post** (author, profile, media, commentCount, reactionCount, + reaction state + job-application count), called via `Promise.all(posts.map(...))` from `routes/tradehub.ts:130,150,351,722`. `services/tradehub/messagingService.ts:72-92` issues **5 sequential awaits per conversation**. Compounded by `tradehub_comments.post_id` having no index (`05-database.md`).
- **Impact:** A 20-post feed = up to 140 queries; a 20-conversation list = 100 sequential queries.
- **Fix:** Batch — fetch all posts' authors/profiles/media/counts in set-based queries keyed by `inArray(postIds)`, then assemble in memory (the pattern `tradeReviews.ts:187-203` already uses correctly). For messaging, a single windowed query with joins + `count(*) FILTER` for unread.
- **Expected improvement:** 140 queries → ~6; feed latency roughly 10–20×.

### P7. Unpaginated tenant-wide list endpoints
- **Bottleneck:** `routes/contacts.ts:58-62` returns the tenant's entire contacts table ordered by name, and its search branch (`:41-51`) is `ILIKE '%term%'` on three columns (unindexable → sequential scan per keystroke). Same unbounded pattern in `routes/psi.ts:155`, `routes/projects.ts:83-140` (which then fans out compliance/cover-photo/financial-summary work per project), `forms.ts`, `inspections.ts`, `accounting.ts`.
- **Impact:** Fine at 100 users; at a tenant with thousands of contacts/projects it's a full-table read per request and a growing payload.
- **Fix:** Keyset pagination (`limit`/`cursor`) on all list endpoints; for contact search, a `pg_trgm` GIN index (`05-database.md`) or a `search_vector` column to replace `ILIKE '%…%'`.

### P8. RAG full-text search builds a tsvector at query time over the whole chunk table
- **Bottleneck:** `repositories/documents.ts:158-176` (`ftsWebsearchQuery`) computes `to_tsvector('english', dc.content)` in both `WHERE` and `ORDER BY` — no GIN index on `document_chunks.content` exists (`05-database.md`).
- **Impact:** Sequential scan + per-row tsvector build on every keyword-search fallback; scales linearly with total chunks across the tenant's documents.
- **Fix:** Add a generated `tsvector` column + GIN index (the pattern already used for `email_messages.search_vector`), or a `pg_trgm`/GIN index; see `05-database.md` for SQL.

### P9. In-request AI/PDF/OCR with a non-cancelling timeout
- **Bottleneck:** OpenAI, `pdfkit`, and Playwright/chromium (`lib/documentTemplateRenderer.ts`) run synchronously in handlers; the 120 s timeout (`app.ts:203-217`) only stops the client waiting, not the work — and each holds a DB connection (B1).
- **Impact:** Tail-latency and pool pressure under concurrency; a chromium OOM kills the instance.
- **Fix:** Move to the job queue (`01-architecture.md` A2). Until then, cap concurrent Playwright renders with the existing `lib/concurrencyLimiter.ts` semaphore and shrink the tenant transaction (B1).

## Mobile
- Query-cache persister is capped at 2 MB and excludes secret-shaped keys (`utils/queryPersister.ts`) — good. Photo compression before upload (max width 1920, q=0.75 — `utils/compressPhoto.ts`) — good. New Architecture + React Compiler enabled. No major perf red flags; the three offline queues are correctness-sensitive (see `08-construction-review.md`) rather than slow.

## Summary table

| # | Bottleneck | Layer | Expected win |
|---|-----------|-------|--------------|
| P1 | 5 MB single bundle, no splitting | Web | ~4–7× smaller initial JS |
| P2 | Dead deps/assets | Web | smaller build/deploy |
| P3 | Global dashboard invalidation | Web | fewer refetches |
| P4 | Render-blocking fonts, unmin CSS | Web | faster first paint |
| P5 | 5+ sequential dashboard counts | API | ~5 round trips → 1 |
| P6 | TradeHub N+1 (feed/messaging) | API | ~10–20× on feed |
| P7 | Unpaginated tenant-wide lists | API | bounded payloads/scans |
| P8 | Query-time tsvector on RAG FTS | API | seq-scan → index |
| P9 | In-request AI/PDF/OCR | API | tail latency, pool relief |
