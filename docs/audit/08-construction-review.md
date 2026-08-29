# Phase 8 — Construction-SaaS Domain Review

Site Snap's users are field crews and small-shop owners for Canadian construction firms. That context changes which risks matter: field connectivity is unreliable, photos are the primary record, client approvals are legally meaningful, and safety/compliance data has regulatory weight (COR/IHSA, provincial OHS). Reviewed against the actual feature code.

---

### D1. Offline field usage — three independent queues, no unified guarantee
- **Feature:** Mobile offline sync via `utils/offlineQueue.ts` (safety forms, `safety_form_offline_queue`), `context/MediaQueueContext.tsx` (photos/docs, copies file to app storage), `context/NoteQueueContext.tsx` (notes), plus a generic `context/OfflineQueueContext.tsx`. All AsyncStorage + NetInfo.
- **What's good:** The safety queue is well built — `MAX_RETRIES=3`, a dead-letter queue, `isPermanentFailure()` correctly treats 4xx (except 429/408) as non-retryable, explicit listener lifecycle (`startOfflineQueueListener`), and writes swallow storage errors without crashing. The media queue copies the file into `documentDirectory` so it survives the photo cache being cleared.
- **Risk:** Four separate queue implementations with different retry/DLQ semantics means **no single source of truth for "what is still unsynced."** A worker who submits a daily report with photos + a signed safety form goes through 2–3 queues that can partially succeed independently — the report syncs, a photo dead-letters silently, and the field user has no unified "3 items pending, 1 failed" view. `app/sync-queue.tsx` inspects one queue, not all. There's also no conflict handling if the same entity is edited on two offline devices.
- **Recommendation:** Unify behind one queue abstraction with a single status surface ("N pending / M failed") and a user-visible, actionable dead-letter view. Add idempotency keys on the server (see D3) so retries can't duplicate.

### D2. Photo uploads — the core record, with gaps
- **Feature:** `field-photo.tsx` → compress (max 1920px, q=0.75) → presigned PUT (https-checked) → `FileSystem.uploadAsync` → register objectPath. Reads via signed URLs + `SignedImage`.
- **What's good:** Client-side compression saves bandwidth on-site; https-only guard; company-scoped ACLs (`trySetCompanyReadAcl`).
- **Risk:** (a) No thumbnailing — the portal and galleries fetch full images (`portal.ts` resolves 900 s URLs for up to 30 photos per load), which is slow on field connections and costly at scale (`06-scalability.md`). (b) No EXIF/geotag/timestamp preservation strategy is evident — for construction, photo **provenance** (when/where taken) is often the point; compression may strip EXIF. (c) Virus/type enforcement on the authenticated upload path is a client-controlled deny-list (`03-security.md` V4). (d) Orphan cleanup lists the whole GCS bucket weekly — won't scale.
- **Recommendation:** Generate thumbnails on upload (a queue job); capture and persist capture-time + gelocation as first-class columns (defensible-record value); allow-list upload types; reconcile-based orphan cleanup.

### D3. Client approvals (quotes/invoices signing) — legally meaningful, mostly solid
- **Feature:** Public token pages let clients e-sign quotes and invoices (`routes/public.ts`).
- **What's good:** Signing is an **atomic, idempotent conditional UPDATE** (`public.ts:426-446` — `WHERE signedAt IS NULL AND status IN (...)`), so double-submits and races can't double-sign; it captures signer name, address, IP, user-agent, and timestamp (`getClientInfo`) — a reasonable evidentiary trail; quote acceptance checks expiry (`validUntil`) and wraps invoice auto-creation in a transaction with a concurrency guard.
- **Risk:** The access token itself never expires and isn't rate-limited on the read path (`03-security.md` V3) — a signed quote's link keeps exposing the document indefinitely. For a legal approval artifact, also consider: no signed-document immutability/hash (the stored quote can still be edited by the contractor after signing unless status transitions forbid it — verify), and the signature is free-form data, not a tamper-evident record.
- **Recommendation:** Expire/rotate tokens; snapshot the signed document (or hash it) at signing time so the approved version is immutable and auditable.

### D4. Change orders & COR/compliance — feature-rich, integrity-light
- **Feature:** COR/IHSA safety compliance is the largest subsystem (`cor.ts` 1329 LOC, `schema/cor.ts` 12 tables: worker credentials, audit trail, CAPA, subcontractor docs, policy sign-offs). Change orders exist (`change_orders` table, approval flow). Credential-expiry alerts run daily (`cron.ts:578`).
- **What's good:** The domain modeling is thorough — idempotency key on `cor_audit_trail`, unique constraints on sign-offs/credentials, an evidence-gap monitor every 4h.
- **Risk:** For regulatory data specifically, the **zero-CHECK-constraint / all-Zod-validation** posture (`05-database.md`) and the fail-open RLS (`03-security.md` V1) matter more here than elsewhere — a compliance record must not be silently mutable or cross-tenant visible. Audit-log **read** is Enterprise-gated (`07-saas-readiness.md`), so a mid-tier customer undergoing a COR audit can't self-serve their own action history. Change-order approval authority should be re-verified against the permission model (who can approve is a money + liability question).
- **Recommendation:** Add DB CHECK constraints and immutability (append-only or trigger-guarded) on compliance/audit tables; deploy RLS reliably; make audit-log read available to all paid tiers.

### D5. Daily reports & voice/AI field capture
- **Feature:** Daily reports with photos + AI summaries; voice-to-text for notes/quotes/invoices; voice inspection; AI daily-report summaries; RAG document Q&A.
- **Risk:** All AI runs inline in requests with a non-cancelling timeout (`04-performance.md` P9) — a field user on a slow link waiting 30–120 s for an AI summary is a poor UX and a pool drain. Voice/photo data sent to OpenAI leaves Canadian jurisdiction (PIPEDA data-residency note, `07-saas-readiness.md`). RAG queries bypass tenant context on raw `pool.query` paths (`03-security.md` V1).
- **Recommendation:** Make AI async (queue + push/poll — the offline queue UX already tolerates deferred completion); disclose and, if required, regionalize AI processing; fix RAG tenant scoping.

### D6. Trade communication (TradeHub + Comms Hub + portal messaging)
- **Feature:** TradeHub marketplace/feed/messaging (cross-tenant by design), email Comms Hub (Gmail/Outlook via 5-min polling), client-portal messaging.
- **Risk:** TradeHub feed/messaging N+1s (`04-performance.md` P6) will degrade sharply as the network grows; email is polled not webhook-driven (latency + cost at scale); portal messaging is unauthenticated token access with no rate limit (`03-security.md` V3). TradeHub is the one area explicitly outside tenant isolation, so its own authorization (who can post/report/message whom) deserves a dedicated review pass — the prior audit's H-002 BOLA concerns were in this module.
- **Recommendation:** Batch the feed queries; move email to webhooks + queue; rate-limit portal; dedicated authz review of TradeHub write paths.

---

## Domain risk priorities before production
1. **Client-approval token expiry + signed-document immutability** (D3) — legal exposure.
2. **Compliance-record integrity: RLS + CHECK constraints + audit visibility for all tiers** (D4) — regulatory exposure.
3. **Unified offline sync status + server idempotency keys** (D1) — field-trust and data-loss risk.
4. **Async AI + data-residency disclosure** (D5) — UX + PIPEDA.
5. **Photo provenance + thumbnails + type allow-list** (D2) — record value + cost + security.
