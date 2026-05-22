# Security & Data Isolation Audit — Risk Matrix

**Scope:** `artifacts/api-server/src/routes/` + `lib/db/src/schema/`  
**Date:** May 22, 2026  
**Scanner Results:** 0 Critical / 0 High from automated scanners (dependency: 16 high, 15 moderate; SAST: 148 total, 0 crit/high). Manual audit reveals material issues not caught by automated scanning.

---

## CRITICAL (Immediate — fix before any production launch)

### C-001: Permissive CORS allows any origin with credentials
| | |
|---|---|
| **File** | `artifacts/api-server/src/app.ts` line 113 |
| **Issue** | `app.use(cors({ credentials: true, origin: true }))` reflects the request's `Origin` header back to the client, allowing **any domain** to make cross-origin authenticated requests to your API if they can present valid Clerk session cookies. |
| **Impact** | Cross-origin attacks (CSRF bypass, credential stuffing via malicious sites). |
| **Refactor** | Replace with a whitelist. Replit provides `REPLIT_DOMAINS` env var:
```ts
const ALLOWED_ORIGINS = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",")
  : ["http://localhost:5173"];
app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
}));
```

---

### C-002: Mass assignment — entire `req.body` written to database
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/costAnalyses.ts` lines 64-72 |
| **Issue** | `const body = req.body; ... db.update(costAnalysesTable).set(body)` passes the **entire** request body into the ORM `.set()`. An attacker can inject arbitrary column values (e.g., `companyId`, `projectId`, `createdAt`) if those columns exist on the table. |
| **Impact** | Privilege escalation, data corruption, cross-company data overwrite. |
| **Refactor** | Pick only allowed fields via Zod:
```ts
const UpdateCostAnalysisBody = z.object({
  labourCost: z.number().optional(),
  materialsCost: z.number().optional(),
  equipmentCost: z.number().optional(),
  subcontractorCost: z.number().optional(),
  overheadCost: z.number().optional(),
  notes: z.string().optional(),
});

const parsed = UpdateCostAnalysisBody.safeParse(req.body);
if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

const [analysis] = await db
  .update(costAnalysesTable)
  .set(parsed.data)
  .where(and(eq(costAnalysesTable.id, analysisId), eq(costAnalysesTable.projectId, projectId)))
  .returning();
```

---

### C-003: Member-removal cascade deletes across ALL companies
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/companies.ts` lines 316-378 |
| **Issue** | The `DELETE /companies/:companyId/members/:userId` route performs ~35 database operations (updates, deletes, cascading nullifies) using **only** `userId` without `companyId` filtering. A company owner can remove a user from their company, but the cascade will **also** delete/nullify that user's data in every other company they belong to. |
| **Impact** | Cross-tenant data destruction. One company's owner can corrupt another company's project data. |
| **Refactor** | Every table mutation must include `eq(table.companyId, companyId)`. Example pattern:
```ts
await db.update(quotesTable)
  .set({ assignedToUserId: null })
  .where(and(eq(quotesTable.assignedToUserId, uid), eq(quotesTable.companyId, companyId)));

await db.delete(dailyReportPhotosTable)
  .where(inArray(dailyReportPhotosTable.reportId,
    db.select({ id: dailyReportsTable.id }).from(dailyReportsTable)
      .where(and(eq(dailyReportsTable.submittedByUserId, uid), eq(dailyReportsTable.companyId, companyId)))
  ));
```
Apply this `companyId` guard to **all** ~35 statements in the member-removal handler.

---

### C-004: Private object storage serves files without authentication
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/storage.ts` lines 118-140 |
| **Issue** | `GET /storage/objects/*path` has no `requireAuth` middleware. The auth check is literally commented out with a note "uncomment when using replit-auth". Right now, any unauthenticated request can download any private file by guessing its object path. |
| **Impact** | Full data exfiltration of all uploaded files (invoices, safety forms, photos, RFIs). |
| **Refactor** | Add authentication and authorization. This route must:
1. Use `requireAuth` middleware.
2. Look up the file in `fileAttachmentsTable` or `projectDocumentsTable` by `objectPath`.
3. Verify the requesting user's `companyId` matches the record's `companyId`.
4. Only then serve the file.
```ts
router.get("/storage/objects/*path", requireAuth, requireCompany, async (req, res) => {
  const raw = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${wildcardPath}`;

  const [record] = await db.select()
    .from(fileAttachmentsTable)
    .where(and(eq(fileAttachmentsTable.objectPath, objectPath), eq(fileAttachmentsTable.companyId, req.companyId!)))
    .limit(1);

  if (!record) {
    // fallback: check projectDocumentsTable
    const [doc] = await db.select()
      .from(projectDocumentsTable)
      .where(and(eq(projectDocumentsTable.objectPath, objectPath), eq(projectDocumentsTable.companyId, req.companyId!)))
      .limit(1);
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  }

  const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
  // serve...
});
```

---

### C-005: Document mutations lack companyId — cross-company doc access
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/documents.ts` lines 329, 342, 359, 381, 387, 688, 867, 926, 970, 1021, 1048 |
| **Issue** | Multiple `update`, `delete`, `insert` operations on `projectDocumentsTable` use `docId` or `projectId` only — never `companyId`. The `DELETE` route (line 329) also uses raw SQL on `document_chunks`, bypassing the ORM entirely. If a user guesses a `docId` from another company, they can delete/analyze/modify it. |
| **Impact** | Cross-company document tampering, deletion, AI analysis of competitor documents. |
| **Refactor** | Add `companyId` to `projectDocumentsTable` schema if missing, then apply to every mutation:
```ts
// DELETE
await db.delete(projectDocumentsTable)
  .where(and(
    eq(projectDocumentsTable.id, docId),
    eq(projectDocumentsTable.projectId, projectId),
    eq(projectDocumentsTable.companyId, req.companyId!)
  ));

// For raw SQL on document_chunks, join back to projectDocuments:
await pool.query(
  "DELETE FROM document_chunks WHERE doc_id=$1 AND EXISTS (SELECT 1 FROM project_documents pd WHERE pd.id=$1 AND pd.company_id=$2)",
  [docId, req.companyId!]
);
```

---

## HIGH (Fix before general availability)

### H-001: Multiple update/delete routes lack companyId guard
| | |
|---|---|
| **Files & Lines** | `invoices.ts:171,360` ; `quotes.ts:256,275` ; `superAdmin.ts:113,209,373` ; `conversations.ts:754` ; `workerVault.ts:123` ; `scans.ts:151` ; `tradehub.ts:256,783` ; `fieldAutomation.ts:189,334,482` ; `timesheets.ts:317` |
| **Issue** | These update/delete operations use only `eq(table.id, id)` with no `companyId` filter. Even when a pre-check exists, the actual mutation should enforce the tenant boundary in the query itself (defense-in-depth). |
| **Impact** | ID-guessing attacks can modify or delete resources in other companies. |
| **Refactor** | Standard pattern for all:
```ts
const [updated] = await db
  .update(invoicesTable)
  .set(updates)
  .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
  .returning();
```
If `companyId` column doesn't exist on the table, add it via migration first.

---

### H-002: TradeHub critical BOLA and mass assignment
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/tradehub.ts` lines 161, 199, 256, 267, 305, 376, 416, 441, 502, 783 |
| **Issue** | (a) Job postings and applications filtered by `id` only, not `companyId` — any company owner can mutate another company's job posts. (b) Most POST/PATCH routes use raw `req.body` without Zod, enabling mass assignment. (c) Raw SQL used for counts/inequalities instead of Drizzle helpers. |
| **Impact** | Cross-company job post hijacking, mass assignment of arbitrary fields. |
| **Refactor** | (a) Add `eq(table.companyId, req.companyId!)` to all `jobPostingsTable` and `tradehubPostsTable` mutations. (b) Create Zod schemas for all TradeHub request bodies. (c) Replace `sql` counts with `count()` helper.

---

### H-003: QuickBooks manual string interpolation
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/quickbooks.ts` lines 103-105 |
| **Issue** | Manual `replace(/'/g, "\\'")` on `displayName` then interpolated into a QuickBooks Query string. While this is for an external API, it's a dangerous anti-pattern — a crafted name could break the QBO query syntax or cause data leakage. |
| **Impact** | Query injection into QuickBooks Online API. |
| **Refactor** | Use the QuickBooks SDK's query builder or proper parameterized QBO queries. If manual, use a robust escaping library rather than regex.

---

### H-004: SuperAdmin routes mass-assign arbitrary body
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/superAdmin.ts` lines 113, 365 |
| **Issue** | `db.update(plansTable).set(body)` and `db.update(featuresTable).set(body)` pass the entire request body without Zod. Even though these are admin routes, mass assignment is still a bug if an admin account is compromised. |
| **Impact** | Arbitrary column overwrite on billing plans/features. |
| **Refactor** | Define strict Zod schemas for plan/feature updates and only pass parsed data to `.set()`.

---

### H-005: MediaHub saves photos to unverified project
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/mediaHub.ts` line 63 |
| **Issue** | `POST /media/save-photo` inserts a photo record with a `projectId` from the request body without verifying the project belongs to the requesting user's `companyId`. |
| **Impact** | Cross-company photo injection. |
| **Refactor** | Call `verifyProjectAccess(projectId, req.companyId!)` before the insert, or add `eq(projectsTable.companyId, req.companyId!)` to the query.

---

## MEDIUM (Fix during next sprint)

### M-001: Missing Zod validation on mutation routes
| | |
|---|---|
| **Files** | `companies.ts:112,208,457` ; `projects.ts:334,443` ; `schedule.ts:139,212` ; `scheduleEvents.ts:46,68,194,396` ; `tradehub.ts:161,267,305,376,416,502` ; `superAdmin.ts:40,98,409` ; `notifications.ts:36,46` ; `conversations.ts:570,667` ; `companyTimeEntries.ts:11` ; `billing.ts:71` ; `forms.ts:153,216` ; `documents.ts:1038` |
| **Issue** | Manual field checking, `req.body as Record<string, unknown>`, or loose `z.record(z.unknown())` instead of strict Zod schemas. This leads to malformed data, silent field drops, and inconsistent error formats. |
| **Impact** | Data quality issues, support tickets, inconsistent API behavior. |
| **Refactor** | Define and use Zod schemas for every POST/PUT/PATCH body. Standardize on `{ error: "Malformed request payload", details: parsed.error.issues }` for validation failures.

---

### M-002: Raw SQL for vector/FTS search bypasses ORM safety
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/documents.ts` lines 77, 103, 141, 166, 185, 204 |
| **Issue** | `pool.query()` used for pgvector similarity search and full-text search. While parameters are bound (`$1, $2`), raw SQL bypasses Drizzle's compile-time safety and makes refactoring harder. |
| **Impact** | Maintenance risk; subtle SQL injection if a future dev concatenates user input. |
| **Refactor** | Use Drizzle's `sql` template tag with proper escaping, or encapsulate in a service layer with strict parameter binding.

---

### M-003: Missing foreign key constraints in schema
| | |
|---|---|
| **File** | `lib/db/src/schema/workerDocuments.ts:17-18` ; `lib/db/src/schema/conversations.ts:7-8` |
| **Issue** | `workerId` and `companyId` in `workerDocuments`, and `userId`/`companyId` in `conversations`, are plain integers without `.references()` to their parent tables. |
| **Impact** | Orphaned records, data integrity issues during user/company deletion. |
| **Refactor** | Add `.references(() => usersTable.id)` and `.references(() => companiesTable.id)` to the foreign key columns. Note: if rows already exist with invalid IDs, run a cleanup migration first.

---

### M-004: `sql` template literal for `IN` clauses instead of `inArray`
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/safety.ts:565` ; `artifacts/api-server/src/routes/dashboard.ts:112` ; `artifacts/api-server/src/routes/documents.ts:460,528,653` |
| **Issue** | `sql\`${table.role} IN ('owner', 'foreman')\`` works but is less safe and harder to type-check than Drizzle's `inArray()` helper. |
| **Impact** | Low immediate risk, but brittle if the enum values change. |
| **Refactor** | Replace with `inArray(userMembershipsTable.role, ['owner', 'foreman'])`.

---

### M-005: Leads fetch contact without company verification
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/leads.ts` lines 74-77 |
| **Issue** | `getLeadWithContact` fetches a contact using `contactId` only, without `eq(contactsTable.companyId, companyId)`. |
| **Impact** | Contact data from other companies could leak via lead lookups. |
| **Refactor** | Add company filter: `.where(and(eq(contactsTable.id, lead.contactId), eq(contactsTable.companyId, companyId)))`.

---

### M-006: RFIs fetch user without company membership check
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/rfis.ts` lines 42-44 |
| **Issue** | `GET` route fetches user by `userIds[0]` without verifying the user is a member of the current company. |
| **Impact** | Low — user details are basic (name/email) from Clerk, but could leak names. |
| **Refactor** | Join with `userMembershipsTable` to verify `companyId` membership before returning user data.

---

## LOW (Nice-to-haves)

### L-001: Hardcoded AI model names
| | |
|---|---|
| **File** | `documents.ts:460,528,653` ; `safety.ts:376` |
| **Issue** | Model names like `"gpt-5.4"` and `"gpt-4.1-mini"` are hardcoded. If OpenAI deprecates or renames these, the app breaks. |
| **Refactor** | Move to env vars: `process.env.OPENAI_MODEL_LARGE`, `process.env.OPENAI_MODEL_SMALL`.

---

### L-002: Hardcoded fallback domain in invitations
| | |
|---|---|
| **File** | `artifacts/api-server/src/routes/invitations.ts` line 105 |
| **Issue** | `"your-app.replit.app"` as a fallback invitation URL. |
| **Refactor** | Remove fallback or use only `process.env.REPLIT_DOMAINS`.

---

### L-003: Helmet CSP disabled in non-production
| | |
|---|---|
| **File** | `artifacts/api-server/src/app.ts` lines 26-36 |
| **Issue** | `contentSecurityPolicy: false` in dev/testing. While intentional for Vite HMR, it means you're testing with a weaker security posture. |
| **Refactor** | Use a dev-specific CSP that allows `ws://localhost:*` and `http://localhost:*` instead of fully disabling it.

---

## Remediation Priority Roadmap

| Phase | Items | Effort |
|---|---|---|
| **Phase 1 (This week)** | C-001 (CORS), C-002 (mass assignment costAnalyses), C-004 (storage auth), H-001 (add companyId to all update/delete) | ~2 days |
| **Phase 2 (Next week)** | C-003 (member removal cascade), C-005 (documents companyId), H-002 (TradeHub BOLA), H-003 (QuickBooks interpolation) | ~3 days |
| **Phase 3 (Sprint)** | M-001 (Zod everywhere), M-002 (raw SQL refactoring), M-003 (foreign keys), M-004 (inArray), L-001 (env model names) | ~4 days |
| **Phase 4 (Ongoing)** | L-003 (dev CSP), automated regression testing for BOLA | Ongoing |

---

## Appendix: BOLA Pattern Checklist for Future Routes

Every route handler that modifies a specific resource must follow:
```ts
.where(and(
  eq(table.id, id),
  eq(table.companyId, req.companyId!)   // or via parent join
))
```

For child tables (items, comments, photos) that lack `companyId`:
```ts
// Verify parent ownership first, then mutate child
const parent = await db.select().from(parentTable)
  .where(and(eq(parentTable.id, parentId), eq(parentTable.companyId, req.companyId!)))
  .limit(1);
if (!parent) { res.status(404).json({ error: "Not found" }); return; }
await db.update(childTable).set(data).where(eq(childTable.parentId, parentId));
```
