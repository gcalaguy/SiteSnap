/**
 * Coverage for the clock-in / clock-out punch-clock endpoints in
 * src/routes/timeClock.ts. Verifies that a completed session writes exactly
 * one row into time_entries and rolls up into the weekly timesheet via the
 * same syncTimesheetFromEntries() helper the manual-hours flow already uses,
 * and that Team Punch Mode is properly gated to owners/foremen.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  projectsTable,
  projectMembersTable,
  timesheetsTable,
  timeEntriesTable,
  timeClockSessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_WORKER = `test_tc_worker_${suffix}`;
const CLERK_WORKER_2 = `test_tc_worker2_${suffix}`;
const CLERK_FOREMAN = `test_tc_foreman_${suffix}`;

let currentClerkUserId = CLERK_WORKER;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockImplementation(() => ({ userId: currentClerkUserId })),
}));

let companyId: number;
let projectId: number;
let workerUserId: number;
let worker2UserId: number;
let foremanUserId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: `TC WF Test Co ${suffix}`, province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [project] = await db
    .insert(projectsTable)
    .values({ companyId, name: `TC WF Project ${suffix}`, address: "123 Test St", city: "Toronto", province: "ON", status: "active" })
    .returning();
  projectId = project.id;

  const [worker] = await db
    .insert(usersTable)
    .values({ clerkUserId: CLERK_WORKER, email: `tc-worker-${suffix}@example.com`, firstName: "Test", lastName: "Worker", activeCompanyId: companyId })
    .returning();
  workerUserId = worker.id;

  const [worker2] = await db
    .insert(usersTable)
    .values({ clerkUserId: CLERK_WORKER_2, email: `tc-worker2-${suffix}@example.com`, firstName: "Test", lastName: "Worker2", activeCompanyId: companyId })
    .returning();
  worker2UserId = worker2.id;

  const [foreman] = await db
    .insert(usersTable)
    .values({ clerkUserId: CLERK_FOREMAN, email: `tc-foreman-${suffix}@example.com`, firstName: "Test", lastName: "Foreman", activeCompanyId: companyId })
    .returning();
  foremanUserId = foreman.id;

  await db.insert(userMembershipsTable).values([
    { userId: workerUserId, companyId, role: "worker", isActive: true },
    { userId: worker2UserId, companyId, role: "worker", isActive: true },
    { userId: foremanUserId, companyId, role: "foreman", isActive: true },
  ]);

  await db.insert(projectMembersTable).values([
    { projectId, userId: workerUserId, companyId },
    { projectId, userId: worker2UserId, companyId },
  ]);

  const app = express();
  app.use(express.json());

  const timeClockRouter = (await import("../src/routes/timeClock.js")).default;
  app.use("/api", timeClockRouter);

  testApp = app;
});

afterAll(async () => {
  await db.delete(timeClockSessionsTable).where(eq(timeClockSessionsTable.companyId, companyId));
  await db.delete(timeEntriesTable).where(eq(timeEntriesTable.companyId, companyId));
  await db.delete(timesheetsTable).where(eq(timesheetsTable.companyId, companyId));
  await db.delete(projectMembersTable).where(eq(projectMembersTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(usersTable).where(eq(usersTable.id, workerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, worker2UserId));
  await db.delete(usersTable).where(eq(usersTable.id, foremanUserId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

describe("Clock in / clock out — happy path", () => {
  let sessionId: number;

  it("worker clocks in", async () => {
    currentClerkUserId = CLERK_WORKER;
    const res = await request(testApp)
      .post("/api/time-clock/clock-in")
      .send({ projectId, localDate: "2025-03-03", notes: "Starting shift" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
    sessionId = res.body.id;
  });

  it("GET /time-clock/active reflects the open session", async () => {
    const res = await request(testApp).get("/api/time-clock/active");
    expect(res.status).toBe(200);
    expect(res.body.session?.id).toBe(sessionId);
  });

  it("a second clock-in for the same worker is rejected with 409", async () => {
    const res = await request(testApp)
      .post("/api/time-clock/clock-in")
      .send({ projectId, localDate: "2025-03-03" });
    expect(res.status).toBe(409);
  });

  it("clocking out produces exactly one time_entries row and updates the weekly timesheet", async () => {
    const res = await request(testApp)
      .post(`/api/time-clock/${sessionId}/clock-out`)
      .send({ notes: "Done for the day" });
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("completed");
    expect(res.body.timeEntry).toBeDefined();

    const entries = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.userId, workerUserId));
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2025-03-03");

    const [ts] = await db.select().from(timesheetsTable).where(eq(timesheetsTable.userId, workerUserId));
    expect(ts).toBeDefined();
    expect(parseFloat(ts.totalHours)).toBeGreaterThan(0);
  });

  it("worker can clock in again after clocking out", async () => {
    const res = await request(testApp)
      .post("/api/time-clock/clock-in")
      .send({ projectId, localDate: "2025-03-04" });
    expect(res.status).toBe(201);
    sessionId = res.body.id;
  });

  it("cancelling an active session removes it and leaves time_entries untouched", async () => {
    const before = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.userId, workerUserId));
    const res = await request(testApp).delete(`/api/time-clock/${sessionId}`);
    expect(res.status).toBe(200);
    const after = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.userId, workerUserId));
    expect(after).toHaveLength(before.length);

    const active = await request(testApp).get("/api/time-clock/active");
    expect(active.body.session).toBeNull();
  });
});

describe("Authorization", () => {
  it("a worker cannot clock out another worker's session", async () => {
    currentClerkUserId = CLERK_WORKER_2;
    const clockIn = await request(testApp)
      .post("/api/time-clock/clock-in")
      .send({ projectId, localDate: "2025-03-05" });
    expect(clockIn.status).toBe(201);
    const otherSessionId = clockIn.body.id;

    currentClerkUserId = CLERK_WORKER;
    const res = await request(testApp).post(`/api/time-clock/${otherSessionId}/clock-out`).send({});
    expect(res.status).toBe(403);

    currentClerkUserId = CLERK_WORKER_2;
    await request(testApp).delete(`/api/time-clock/${otherSessionId}`);
  });

  it("a worker cannot clock in another worker (targetUserId) — 403", async () => {
    currentClerkUserId = CLERK_WORKER;
    const res = await request(testApp)
      .post("/api/time-clock/clock-in")
      .send({ projectId, localDate: "2025-03-06", targetUserId: worker2UserId });
    expect(res.status).toBe(403);
  });

  it("a worker cannot list company-wide active sessions — 403", async () => {
    currentClerkUserId = CLERK_WORKER;
    const res = await request(testApp).get("/api/time-clock/active-sessions");
    expect(res.status).toBe(403);
  });
});

describe("Team Punch Mode", () => {
  it("a foreman can clock in another worker (targetUserId)", async () => {
    currentClerkUserId = CLERK_FOREMAN;
    const res = await request(testApp)
      .post("/api/time-clock/clock-in")
      .send({ projectId, localDate: "2025-03-07", targetUserId: workerUserId });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(workerUserId);
    expect(res.body.clockedInByUserId).toBe(foremanUserId);

    const active = await request(testApp).get("/api/time-clock/active-sessions");
    expect(active.status).toBe(200);
    expect(active.body.some((s: any) => s.userId === workerUserId)).toBe(true);

    await request(testApp).post(`/api/time-clock/${res.body.id}/clock-out`).send({});
  });

  it("clock-in-all clocks in every project member not already active", async () => {
    currentClerkUserId = CLERK_FOREMAN;
    const res = await request(testApp)
      .post("/api/time-clock/clock-in-all")
      .send({ projectId, localDate: "2025-03-08" });
    expect(res.status).toBe(201);
    const clockedInUserIds = res.body.clockedIn.map((s: any) => s.userId);
    expect(clockedInUserIds).toEqual(expect.arrayContaining([workerUserId, worker2UserId]));

    for (const s of res.body.clockedIn) {
      await request(testApp).post(`/api/time-clock/${s.id}/clock-out`).send({});
    }
  });
});
