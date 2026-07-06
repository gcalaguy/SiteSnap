/**
 * One-off backfill for object-storage ACLs.
 *
 * Historically, most upload-confirmation routes never set an ACL policy on
 * the objects they referenced. Access to those objects only worked because
 * `canAccessObjectEntity` had a fallback that checked whether the requester
 * was a member of *their own* company — which is true for every logged-in
 * user, so it granted cross-tenant access to every ACL-less object. That
 * fallback has been removed (ACL-less objects are now denied by default),
 * so any object referenced by a DB row from before this fix needs its real
 * ACL set here first, or access to it breaks.
 *
 * Safe to re-run: `setObjectAclPolicy` is first-write-wins, so rows already
 * claimed by the correct owner are a harmless no-op, and rows whose object
 * is already claimed by a *different* owner are skipped and logged rather
 * than overwritten.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run backfill-object-acls
 *   pnpm --filter @workspace/api-server run backfill-object-acls -- --dry-run
 */
import {
  db,
  expensesTable,
  projectDocumentsTable,
  projectsTable,
  fileAttachmentsTable,
  dailyReportPhotosTable,
  dailyReportsTable,
  submissionPhotosTable,
  formSubmissionsTable,
  mediaHubPhotosTable,
  clientPortalUploadsTable,
  workerDocumentsTable,
  permitsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage.js";

const DRY_RUN = process.argv.includes("--dry-run");
const objectStorageService = new ObjectStorageService();

let claimed = 0;
let skipped = 0;

async function applyAcl(label: string, path: string | null, ownerId: string, companyId: number) {
  if (!path) return;
  if (DRY_RUN) {
    console.log(`[dry-run] ${label} ${path} -> owner=${ownerId} company=${companyId}`);
    return;
  }
  try {
    await objectStorageService.trySetCompanyReadAcl(path, ownerId, String(companyId));
    claimed++;
  } catch (err) {
    skipped++;
    console.error(`SKIP ${label} ${path}: ${(err as Error).message}`);
  }
}

async function backfillExpenseReceipts() {
  const rows = await db
    .select({
      path: expensesTable.receiptObjectPath,
      ownerId: expensesTable.submittedByUserId,
      companyId: expensesTable.companyId,
    })
    .from(expensesTable);
  for (const r of rows) await applyAcl("expense-receipt", r.path, String(r.ownerId), r.companyId);
}

async function backfillProjectDocuments() {
  const rows = await db
    .select({
      path: projectDocumentsTable.objectPath,
      ownerId: projectDocumentsTable.uploadedByUserId,
      companyId: projectsTable.companyId,
    })
    .from(projectDocumentsTable)
    .innerJoin(projectsTable, eq(projectsTable.id, projectDocumentsTable.projectId));
  for (const r of rows) await applyAcl("project-document", r.path, String(r.ownerId), r.companyId);
}

async function backfillFileAttachments() {
  const rows = await db
    .select({
      path: fileAttachmentsTable.objectPath,
      ownerId: fileAttachmentsTable.uploadedByUserId,
      companyId: fileAttachmentsTable.companyId,
    })
    .from(fileAttachmentsTable);
  for (const r of rows) await applyAcl("file-attachment", r.path, String(r.ownerId), r.companyId);
}

async function backfillDailyReportPhotos() {
  const rows = await db
    .select({
      path: dailyReportPhotosTable.objectPath,
      ownerId: dailyReportsTable.submittedByUserId,
      companyId: dailyReportsTable.companyId,
    })
    .from(dailyReportPhotosTable)
    .innerJoin(dailyReportsTable, eq(dailyReportsTable.id, dailyReportPhotosTable.reportId));
  for (const r of rows) await applyAcl("daily-report-photo", r.path, String(r.ownerId), r.companyId);
}

async function backfillSubmissionPhotos() {
  const rows = await db
    .select({
      path: submissionPhotosTable.objectPath,
      ownerId: formSubmissionsTable.userId,
      companyId: formSubmissionsTable.companyId,
    })
    .from(submissionPhotosTable)
    .innerJoin(formSubmissionsTable, eq(formSubmissionsTable.id, submissionPhotosTable.submissionId));
  for (const r of rows) await applyAcl("submission-photo", r.path, String(r.ownerId), r.companyId);
}

async function backfillMediaHubPhotos() {
  const rows = await db
    .select({
      id: mediaHubPhotosTable.id,
      path: mediaHubPhotosTable.imageUrl,
      ownerId: mediaHubPhotosTable.uploadedById,
      companyId: projectsTable.companyId,
    })
    .from(mediaHubPhotosTable)
    .innerJoin(projectsTable, eq(projectsTable.id, mediaHubPhotosTable.projectId));
  for (const r of rows) {
    await applyAcl("media-hub-photo", r.path, r.ownerId != null ? String(r.ownerId) : `media:${r.id}`, r.companyId);
  }
}

async function backfillClientPortalUploads() {
  const rows = await db
    .select({
      id: clientPortalUploadsTable.id,
      path: clientPortalUploadsTable.objectPath,
      portalTokenId: clientPortalUploadsTable.portalTokenId,
      companyId: projectsTable.companyId,
    })
    .from(clientPortalUploadsTable)
    .innerJoin(projectsTable, eq(projectsTable.id, clientPortalUploadsTable.projectId));
  for (const r of rows) {
    await applyAcl("client-portal-upload", r.path, `portal:${r.portalTokenId}`, r.companyId);
  }
}

async function backfillWorkerDocuments() {
  const rows = await db
    .select({
      path: workerDocumentsTable.filePath,
      ownerId: workerDocumentsTable.workerId,
      companyId: workerDocumentsTable.companyId,
    })
    .from(workerDocumentsTable);
  for (const r of rows) await applyAcl("worker-document", r.path, String(r.ownerId), r.companyId);
}

async function backfillPermits() {
  const rows = await db
    .select({
      id: permitsTable.id,
      path: permitsTable.fileUrl,
      ownerId: permitsTable.createdByUserId,
      companyId: permitsTable.companyId,
    })
    .from(permitsTable);
  for (const r of rows) {
    await applyAcl("permit", r.path, r.ownerId != null ? String(r.ownerId) : `permit:${r.id}`, r.companyId);
  }
}

async function main() {
  if (DRY_RUN) console.log("Running in --dry-run mode — no ACLs will be written.\n");

  await backfillExpenseReceipts();
  await backfillProjectDocuments();
  await backfillFileAttachments();
  await backfillDailyReportPhotos();
  await backfillSubmissionPhotos();
  await backfillMediaHubPhotos();
  await backfillClientPortalUploads();
  await backfillWorkerDocuments();
  await backfillPermits();

  console.log(`\nDone. claimed=${claimed} skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
