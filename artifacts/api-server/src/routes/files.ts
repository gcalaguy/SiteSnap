import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, fileAttachmentsTable, usersTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod";

const router = Router();
const objectStorageService = new ObjectStorageService();

const VALID_ENTITY_TYPES = ["project", "contact", "task", "form_submission"] as const;

// GET /files?entityType=X&entityId=Y
router.get("/files", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.query as Record<string, string>;

  const conditions: any[] = [eq(fileAttachmentsTable.companyId, req.companyId!)];
  if (entityType) conditions.push(eq(fileAttachmentsTable.entityType, entityType));
  if (entityId && !isNaN(parseInt(entityId))) {
    conditions.push(eq(fileAttachmentsTable.entityId, parseInt(entityId)));
  }

  const files = await db
    .select({
      file: fileAttachmentsTable,
      uploaderFirstName: usersTable.firstName,
      uploaderLastName: usersTable.lastName,
    })
    .from(fileAttachmentsTable)
    .leftJoin(usersTable, eq(fileAttachmentsTable.uploadedByUserId, usersTable.id))
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(fileAttachmentsTable.createdAt));

  res.json(files.map((f) => ({
    ...f.file,
    uploaderName: `${f.uploaderFirstName ?? ""} ${f.uploaderLastName ?? ""}`.trim(),
  })));
}))

// POST /files — register a file after presigned upload
const RegisterFileBody = z.object({
  entityType: z.enum(VALID_ENTITY_TYPES),
  entityId: z.coerce.number().int().positive(),
  fileName: z.string().min(1),
  fileSize: z.coerce.number().int().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  objectPath: z.string().min(1),
});

router.post("/files", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const parsed = RegisterFileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    await objectStorageService.trySetCompanyReadAcl(
      parsed.data.objectPath,
      String(req.userId!),
      String(req.companyId!),
    );
  } catch (err) {
    req.log.warn({ err }, "Rejected file with invalid or already-owned object path");
    res.status(400).json({ error: "Invalid file reference" });
    return;
  }

  const [file] = await db
    .insert(fileAttachmentsTable)
    .values({
      companyId: req.companyId!,
      uploadedByUserId: req.userId!,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      fileName: parsed.data.fileName,
      fileSize: parsed.data.fileSize ?? null,
      mimeType: parsed.data.mimeType ?? null,
      objectPath: parsed.data.objectPath,
    })
    .returning();

  res.status(201).json(file);
}))

// DELETE /files/:id
router.delete("/files/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(fileAttachmentsTable)
    .where(and(eq(fileAttachmentsTable.id, id), eq(fileAttachmentsTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "File not found" }); return; }
  res.status(204).send();
}))

export default router;
