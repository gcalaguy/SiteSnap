/**
 * Integration tests: Backup schedule + run-now + download workflow
 *
 * Drives the real backup routes (requireAuth, requireCompany, requireTenantCtx,
 * requireOwner all run for real) against a real database, real tenant export
 * (buildTenantExport), and real object storage / filesystem writes. Auth is
 * mocked only at the Clerk boundary.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { db, companiesTable, usersTable, userMembershipsTable, backupSchedulesTable, backupLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const CLERK_ID_OWNER = `test_backup_owner_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_ID_WORKER = `test_backup_worker_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_ID_OTHER_OWNER = `test_backup_other_owner_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

let activeClerkId: string | null = null;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockImplementation(() => (activeClerkId ? { userId: activeClerkId } : { userId: null })),
}));

let companyId: number;
let otherCompanyId: number;
let ownerUserId: number;
let workerUserId: number;
let otherOwnerUserId: number;
let testApp: express.Express;
let mountDir: string;

async function waitForCompletion(logId: number, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [log] = await db.select().from(backupLogsTable).where(eq(backupLogsTable.id, logId)).limit(1);
    if (log && log.status !== "in_progress") return log;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Backup log ${logId} did not finish within ${timeoutMs}ms`);
}

beforeAll(async () => {
  mountDir = await fs.mkdtemp(path.join(os.tmpdir(), "sitesnap-backup-test-"));
  process.env.BACKUP_MOUNT_PATHS = JSON.stringify({ "test-mount": mountDir });

  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Backup WF Test Co", province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [otherCompany] = await db
    .insert(companiesTable)
    .values({ name: "Backup WF Test Co (other tenant)", province: "ON", city: "Toronto" })
    .returning();
  otherCompanyId = otherCompany.id;

  const [owner] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID_OWNER,
      email: `backup-owner-${Date.now()}@example.com`,
      firstName: "Backup",
      lastName: "Owner",
      activeCompanyId: companyId,
    })
    .returning();
  ownerUserId = owner.id;

  const [worker] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID_WORKER,
      email: `backup-worker-${Date.now()}@example.com`,
      firstName: "Backup",
      lastName: "Worker",
      activeCompanyId: companyId,
    })
    .returning();
  workerUserId = worker.id;

  const [otherOwner] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID_OTHER_OWNER,
      email: `backup-other-owner-${Date.now()}@example.com`,
      firstName: "Backup",
      lastName: "OtherOwner",
      activeCompanyId: otherCompanyId,
    })
    .returning();
  otherOwnerUserId = otherOwner.id;

  await db.insert(userMembershipsTable).values([
    { userId: ownerUserId, companyId, role: "owner", isActive: true },
    { userId: workerUserId, companyId, role: "worker", isActive: true },
    { userId: otherOwnerUserId, companyId: otherCompanyId, role: "owner", isActive: true },
  ]);

  const app = express();
  app.use(express.json());
  const { default: backupRouter } = await import("../src/routes/backup.js");
  app.use(backupRouter);
  testApp = app;
});

afterAll(async () => {
  await db.delete(backupLogsTable).where(eq(backupLogsTable.companyId, companyId));
  await db.delete(backupSchedulesTable).where(eq(backupSchedulesTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, otherCompanyId));
  await db.delete(usersTable).where(eq(usersTable.id, ownerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, workerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, otherOwnerUserId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  await db.delete(companiesTable).where(eq(companiesTable.id, otherCompanyId));
  await fs.rm(mountDir, { recursive: true, force: true });
});

describe("GET /companies/:companyId/backup-schedule", () => {
  it("returns null schedule + empty logs before any configuration", async () => {
    activeClerkId = CLERK_ID_OWNER;
    const res = await request(testApp).get(`/companies/${companyId}/backup-schedule`);
    expect(res.status).toBe(200);
    expect(res.body.schedule).toBeNull();
    expect(res.body.logs).toEqual([]);
    expect(res.body.availableMounts).toContain("test-mount");
  });

  it("blocks a non-owner (worker) with 403", async () => {
    activeClerkId = CLERK_ID_WORKER;
    const res = await request(testApp).get(`/companies/${companyId}/backup-schedule`);
    expect(res.status).toBe(403);
  });

  it("blocks cross-tenant access with 403", async () => {
    activeClerkId = CLERK_ID_OTHER_OWNER;
    const res = await request(testApp).get(`/companies/${companyId}/backup-schedule`);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /companies/:companyId/backup-schedule", () => {
  it("saves a platform_storage schedule", async () => {
    activeClerkId = CLERK_ID_OWNER;
    const res = await request(testApp)
      .patch(`/companies/${companyId}/backup-schedule`)
      .send({ frequency: "weekly", enabled: true, retentionDays: 90, destinationType: "platform_storage" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      frequency: "weekly",
      enabled: true,
      retentionDays: 90,
      destinationType: "platform_storage",
    });

    const getRes = await request(testApp).get(`/companies/${companyId}/backup-schedule`);
    expect(getRes.body.schedule).toMatchObject({ frequency: "weekly", destinationType: "platform_storage" });
  });

  it("rejects an unknown network_drive mount", async () => {
    const res = await request(testApp)
      .patch(`/companies/${companyId}/backup-schedule`)
      .send({ frequency: "daily", enabled: true, retentionDays: 30, destinationType: "network_drive", destinationMountKey: "not-a-real-mount" });
    expect(res.status).toBe(400);
  });
});

describe("POST /companies/:companyId/backups/run-now (platform_storage)", () => {
  it("runs a real tenant export and uploads it to platform object storage", async () => {
    activeClerkId = CLERK_ID_OWNER;

    // Make sure the schedule is pointed at platform_storage for this run.
    await request(testApp)
      .patch(`/companies/${companyId}/backup-schedule`)
      .send({ frequency: "weekly", enabled: true, retentionDays: 90, destinationType: "platform_storage" });

    const runRes = await request(testApp).post(`/companies/${companyId}/backups/run-now`);
    expect(runRes.status).toBe(202);
    expect(runRes.body.started).toBe(true);
    expect(typeof runRes.body.logId).toBe("number");

    const completed = await waitForCompletion(runRes.body.logId);
    expect(completed.status).toBe("completed");
    expect(completed.fileSizeBytes).toBeGreaterThan(0);
    expect(completed.destinationPath).toMatch(/^\/objects\//);

    const downloadRes = await request(testApp)
      .get(`/companies/${companyId}/backups/${runRes.body.logId}/download`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toBe("application/zip");
    // ZIP local file header magic bytes
    expect((downloadRes.body as Buffer).subarray(0, 2).toString("hex")).toBe("504b");
  }, 45_000);

  it("rejects a second run-now while one is already in progress", async () => {
    activeClerkId = CLERK_ID_OWNER;
    const first = await request(testApp).post(`/companies/${companyId}/backups/run-now`);
    expect(first.status).toBe(202);

    const second = await request(testApp).post(`/companies/${companyId}/backups/run-now`);
    expect(second.status).toBe(409);

    await waitForCompletion(first.body.logId);
  }, 45_000);
});

describe("POST /companies/:companyId/backups/run-now (network_drive)", () => {
  it("writes the archive to the allowlisted mount directory", async () => {
    activeClerkId = CLERK_ID_OWNER;
    await request(testApp)
      .patch(`/companies/${companyId}/backup-schedule`)
      .send({
        frequency: "daily",
        enabled: true,
        retentionDays: 30,
        destinationType: "network_drive",
        destinationMountKey: "test-mount",
        destinationSubpath: "company-backups",
      });

    const runRes = await request(testApp).post(`/companies/${companyId}/backups/run-now`);
    expect(runRes.status).toBe(202);

    const completed = await waitForCompletion(runRes.body.logId);
    expect(completed.status).toBe("completed");
    expect(completed.destinationPath).toContain(path.join(mountDir, "company-backups"));

    const stat = await fs.stat(completed.destinationPath!);
    expect(stat.size).toBeGreaterThan(0);

    const downloadRes = await request(testApp)
      .get(`/companies/${companyId}/backups/${runRes.body.logId}/download`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(downloadRes.status).toBe(200);
    expect((downloadRes.body as Buffer).subarray(0, 2).toString("hex")).toBe("504b");
  }, 45_000);
});
