/**
 * Integration tests: Timesheet submit → view → approve workflow
 *
 * Covers:
 * - Worker submitting a timesheet → 201
 * - Worker can view their own timesheet → 200
 * - Worker from a different company gets 404 (tenant isolation)
 * - Another worker in the same company cannot view someone else's timesheet → 403
 * - Owner can view any timesheet in their company → 200
 * - Owner approving a timesheet changes status → "approved"
 * - Owner denying a timesheet changes status → "denied"
 * - Re-submit of same week/project updates in place (upsert)
 *
 * Auth is mocked at the Clerk boundary; requireAuth + requireCompany run for
 * real so tenant-isolation middleware is exercised.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  timesheetsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// ── Test identities ───────────────────────────────────────────────────────────
const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_WORKER = `test_ts_worker_${suffix}`;
const CLERK_OWNER = `test_ts_owner_${suffix}`;
const CLERK_OTHER_WORKER = `test_ts_otherworker_${suffix}`;
const CLERK_OTHER_COMPANY = `test_ts_otherco_${suffix}`;

let activeClerkId = CLERK_WORKER;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockImplementation(() => ({ userId: activeClerkId })),
}));

vi.mock("../src/lib/push", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

// ── DB identities ─────────────────────────────────────────────────────────────
let companyId: number;
let otherCompanyId: number;
let workerUserId: number;
let ownerUserId: number;
let otherWorkerUserId: number;
let otherCompanyUserId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: `TS WF Test Co ${suffix}`, province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [otherCompany] = await db
    .insert(companiesTable)
    .values({ name: `TS WF Other Co ${suffix}`, province: "BC", city: "Vancouver" })
    .returning();
  otherCompanyId = otherCompany.id;

  const [worker] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_WORKER,
      email: `ts-worker-${suffix}@example.com`,
      firstName: "Test",
      lastName: "Worker",
      activeCompanyId: companyId,
    })
    .returning();
  workerUserId = worker.id;

  const [owner] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_OWNER,
      email: `ts-owner-${suffix}@example.com`,
      firstName: "Test",
      lastName: "Owner",
      activeCompanyId: companyId,
    })
    .returning();
  ownerUserId = owner.id;

  const [otherWorker] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_OTHER_WORKER,
      email: `ts-otherworker-${suffix}@example.com`,
      firstName: "Other",
      lastName: "Worker",
      activeCompanyId: companyId,
    })
    .returning();
  otherWorkerUserId = otherWorker.id;

  const [otherCo] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_OTHER_COMPANY,
      email: `ts-otherco-${suffix}@example.com`,
      firstName: "Other",
      lastName: "Company",
      activeCompanyId: otherCompanyId,
    })
    .returning();
  otherCompanyUserId = otherCo.id;

  await db.insert(userMembershipsTable).values([
    { userId: workerUserId, companyId, role: "worker", isActive: true },
    { userId: ownerUserId, companyId, role: "owner", isActive: true },
    { userId: otherWorkerUserId, companyId, role: "worker", isActive: true },
    { userId: otherCompanyUserId, companyId: otherCompanyId, role: "owner", isActive: true },
  ]);

  const app = express();
  app.use(express.json());

  const timesheetRouter = (await import("../src/routes/timesheets.js")).default;
  app.use("/api", timesheetRouter);

  testApp = app;
});

afterAll(async () => {
  await db.delete(timesheetsTable).where(eq(timesheetsTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, otherCompanyId));
  await db.delete(usersTable).where(eq(usersTable.id, workerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, ownerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, otherWorkerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, otherCompanyUserId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  await db.delete(companiesTable).where(eq(companiesTable.id, otherCompanyId));
});

const WEEK_START = "2025-01-06";

describe("POST /timesheets — submit", () => {
  it("worker can submit a timesheet and gets 201", async () => {
    activeClerkId = CLERK_WORKER;
    const res = await request(testApp)
      .post("/api/timesheets")
      .set("x-tenant-id", String(companyId))
      .send({ weekStart: WEEK_START, totalHours: 40, hourlyRate: 25, description: "Test week" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("submitted");
    expect(res.body.totalHours).toBe("40.00");
  });

  it("re-submitting same week upserts and returns 201", async () => {
    activeClerkId = CLERK_WORKER;
    const res = await request(testApp)
      .post("/api/timesheets")
      .set("x-tenant-id", String(companyId))
      .send({ weekStart: WEEK_START, totalHours: 42, hourlyRate: 25, description: "Corrected hours" });
    expect(res.status).toBe(201);
    expect(res.body.totalHours).toBe("42.00");

    // Only one row should exist for this worker/week/company
    const rows = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          eq(timesheetsTable.companyId, companyId),
          eq(timesheetsTable.userId, workerUserId),
          eq(timesheetsTable.weekStart, WEEK_START),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});

describe("GET /timesheets/:id — access control", () => {
  let timesheetId: number;

  beforeAll(async () => {
    const [ts] = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          eq(timesheetsTable.companyId, companyId),
          eq(timesheetsTable.userId, workerUserId),
          eq(timesheetsTable.weekStart, WEEK_START),
        ),
      )
      .limit(1);
    timesheetId = ts.id;
  });

  it("worker can view their own timesheet", async () => {
    activeClerkId = CLERK_WORKER;
    const res = await request(testApp)
      .get(`/api/timesheets/${timesheetId}`)
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(timesheetId);
  });

  it("another worker in same company gets 403 for someone else's timesheet", async () => {
    activeClerkId = CLERK_OTHER_WORKER;
    const res = await request(testApp)
      .get(`/api/timesheets/${timesheetId}`)
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(403);
  });

  it("owner can view any timesheet in their company", async () => {
    activeClerkId = CLERK_OWNER;
    const res = await request(testApp)
      .get(`/api/timesheets/${timesheetId}`)
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(timesheetId);
  });

  it("user from a different company gets 404 (tenant isolation)", async () => {
    activeClerkId = CLERK_OTHER_COMPANY;
    const res = await request(testApp)
      .get(`/api/timesheets/${timesheetId}`)
      .set("x-tenant-id", String(otherCompanyId));
    expect(res.status).toBe(404);
  });
});

describe("POST /timesheets/:id/approve and /deny", () => {
  let timesheetId: number;

  beforeAll(async () => {
    const [ts] = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          eq(timesheetsTable.companyId, companyId),
          eq(timesheetsTable.userId, workerUserId),
          eq(timesheetsTable.weekStart, WEEK_START),
        ),
      )
      .limit(1);
    timesheetId = ts.id;
  });

  it("worker cannot approve their own timesheet (403)", async () => {
    activeClerkId = CLERK_WORKER;
    const res = await request(testApp)
      .post(`/api/timesheets/${timesheetId}/approve`)
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(403);
  });

  it("owner can deny a submitted timesheet", async () => {
    activeClerkId = CLERK_OWNER;
    const res = await request(testApp)
      .post(`/api/timesheets/${timesheetId}/deny`)
      .set("x-tenant-id", String(companyId))
      .send({ reason: "Missing project code" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("denied");
  });

  it("owner can approve after re-submit", async () => {
    // Worker re-submits after denial
    activeClerkId = CLERK_WORKER;
    await request(testApp)
      .post("/api/timesheets")
      .set("x-tenant-id", String(companyId))
      .send({ weekStart: WEEK_START, totalHours: 40, hourlyRate: 25, description: "Fixed" });

    // Owner approves
    activeClerkId = CLERK_OWNER;
    const res = await request(testApp)
      .post(`/api/timesheets/${timesheetId}/approve`)
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
  });
});
