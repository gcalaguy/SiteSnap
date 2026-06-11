import { Router } from "express";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  workerDocumentsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod/v4";

const router = Router();
const objectStorageService = new ObjectStorageService();

const DOC_TYPES = [
  "Driver License",
  "OSHA 10",
  "OSHA 30",
  "Working at Heights",
  "WHMIS",
  "First Aid",
  "Fall Protection",
  "Confined Space",
  "Electrical Safety",
  "Other",
] as const;

const uploadBodySchema = z.object({
  documentType: z.enum(DOC_TYPES),
  fileUrl: z.string().min(1),
  filePath: z.string().optional(),
  expirationDate: z.string().optional(),
});

// ── WORKER ENDPOINTS ───────────────────────────────────────────────────────────

// POST /worker/vault/upload
router.post("/worker/vault/upload", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsed = uploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid upload data", details: parsed.error.flatten() });
      return;
    }

    const { documentType, fileUrl, filePath, expirationDate } = parsed.data;

    if (!req.companyId) {
      res.status(403).json({ error: "No active company context" });
      return;
    }

    const [doc] = await db
      .insert(workerDocumentsTable)
      .values({
        workerId: req.userId!,
        companyId: req.companyId,
        documentType,
        fileUrl,
        filePath: filePath ?? null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        status: "active",
      })
      .returning();

    res.status(201).json(doc);
  } catch (err: any) {
    req.log.error({ err }, "worker/vault/upload error");
    res.status(500).json({ error: "Failed to save document" });
  }
}))

// GET /worker/vault/my-documents
router.get("/worker/vault/my-documents", requireAuth, asyncHandler(async (req, res) => {
  try {
    if (!req.companyId) {
      res.status(403).json({ error: "No active company context" });
      return;
    }

    const docs = await db
      .select()
      .from(workerDocumentsTable)
      .where(
        and(
          eq(workerDocumentsTable.workerId, req.userId!),
          eq(workerDocumentsTable.companyId, req.companyId),
        ),
      )
      .orderBy(desc(workerDocumentsTable.createdAt));

    res.json(docs);
  } catch (err: any) {
    req.log.error({ err }, "worker/vault/my-documents error");
    res.status(500).json({ error: "Failed to load documents" });
  }
}))

// DELETE /worker/vault/documents/:id
router.delete("/worker/vault/documents/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!req.companyId) {
      res.status(403).json({ error: "No active company context" });
      return;
    }

    const [existing] = await db
      .select()
      .from(workerDocumentsTable)
      .where(eq(workerDocumentsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    if (existing.workerId !== req.userId || existing.companyId !== req.companyId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    await db.delete(workerDocumentsTable).where(and(eq(workerDocumentsTable.id, id), eq(workerDocumentsTable.companyId, req.companyId!)));
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "worker/vault/documents/:id DELETE error");
    res.status(500).json({ error: "Failed to delete document" });
  }
}))

// ── TENANT (OWNER/FOREMAN) ENDPOINTS ──────────────────────────────────────────

// GET /tenant/vault/all-documents
router.get("/tenant/vault/all-documents", requireAuth, asyncHandler(async (req, res) => {
  try {
    if (!req.companyId) {
      res.status(403).json({ error: "No active company context" });
      return;
    }
    if (req.userRole !== "owner" && req.userRole !== "foreman") {
      res.status(403).json({ error: "Owner or foreman access required" });
      return;
    }

    const docs = await db
      .select()
      .from(workerDocumentsTable)
      .where(eq(workerDocumentsTable.companyId, req.companyId))
      .orderBy(desc(workerDocumentsTable.createdAt));

    // Enrich with worker names — single batched query instead of N+1 loop
    const workerIds = [...new Set(docs.map((d) => d.workerId))];
    const users: Array<{ id: number; firstName: string | null; lastName: string | null; email: string }> =
      workerIds.length
        ? await db
            .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
            .from(usersTable)
            .where(inArray(usersTable.id, workerIds))
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = docs.map((d) => {
      const user = userMap.get(d.workerId);
      return {
        ...d,
        workerName: user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown",
        workerEmail: user?.email ?? null,
      };
    });

    res.json(enriched);
  } catch (err: any) {
    req.log.error({ err }, "tenant/vault/all-documents error");
    res.status(500).json({ error: "Failed to load documents" });
  }
}))

// GET /tenant/vault/worker/:workerId
router.get("/tenant/vault/worker/:workerId", requireAuth, asyncHandler(async (req, res) => {
  try {
    if (!req.companyId) {
      res.status(403).json({ error: "No active company context" });
      return;
    }
    if (req.userRole !== "owner" && req.userRole !== "foreman") {
      res.status(403).json({ error: "Owner or foreman access required" });
      return;
    }

    const workerId = parseInt(req.params.workerId as string);
    const docs = await db
      .select()
      .from(workerDocumentsTable)
      .where(
        and(
          eq(workerDocumentsTable.workerId, workerId),
          eq(workerDocumentsTable.companyId, req.companyId),
        ),
      )
      .orderBy(desc(workerDocumentsTable.createdAt));

    res.json(docs);
  } catch (err: any) {
    req.log.error({ err }, "tenant/vault/worker/:workerId error");
    res.status(500).json({ error: "Failed to load worker documents" });
  }
}))

export default router;
