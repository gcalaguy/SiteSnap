/**
 * Regression test for: POST /projects/:projectId/time-entries returning 500
 * ("there is no unique or exclusion constraint matching the ON CONFLICT
 * specification") when syncTimesheetFromEntries upserts the weekly timesheet.
 *
 * The timesheets table enforces uniqueness via two PARTIAL unique indexes
 * (one for project_id IS NULL, one for project_id IS NOT NULL — see migration
 * 0018), so the ON CONFLICT target must match the relevant predicate via
 * targetWhere. Logging a second entry in the same week is what triggers the
 * conflict path and previously failed.
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
} from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_WORKER = `test_te_worker_${suffix}`;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockImplementation(() => ({ userId: CLERK_WORKER })),
}));

let companyId: number;
let projectId: number;
let workerUserId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: `TE WF Test Co ${suffix}`, province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [project] = await db
    .insert(projectsTable)
    .values({ companyId, name: `TE WF Project ${suffix}`, address: "123 Test St", city: "Toronto", province: "ON", status: "active" })
    .returning();
  projectId = project.id;

  const [worker] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_WORKER,
      email: `te-worker-${suffix}@example.com`,
      firstName: "Test",
      lastName: "Worker",
      activeCompanyId: companyId,
    })
    .returning();
  workerUserId = worker.id;

  await db.insert(userMembershipsTable).values([
    { userId: workerUserId, companyId, role: "worker", isActive: true },
  ]);

  // Worker must be an assigned project member to pass canAccessProject().
  await db.insert(projectMembersTable).values({ projectId, userId: workerUserId, companyId });

  const app = express();
  app.use(express.json());

  const timeEntriesRouter = (await import("../src/routes/timeEntries.js")).default;
  app.use("/api/projects/:projectId/time-entries", timeEntriesRouter);

  testApp = app;
});

afterAll(async () => {
  await db.delete(timeEntriesTable).where(eq(timeEntriesTable.companyId, companyId));
  await db.delete(timesheetsTable).where(eq(timesheetsTable.companyId, companyId));
  await db.delete(projectMembersTable).where(eq(projectMembersTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(usersTable).where(eq(usersTable.id, workerUserId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

describe("POST /projects/:projectId/time-entries — log hours", () => {
  it("worker can log hours and gets 201", async () => {
    const res = await request(testApp)
      .post(`/api/projects/${projectId}/time-entries`)
      .send({ date: "2025-02-03", entries: [{ hours: 4, description: "First entry" }] });
    expect(res.status).toBe(201);
  });

  it("logging a second entry in the same week upserts the timesheet without 500ing", async () => {
    const res = await request(testApp)
      .post(`/api/projects/${projectId}/time-entries`)
      .send({ date: "2025-02-04", entries: [{ hours: 3.5, description: "Second entry, same week" }] });
    expect(res.status).toBe(201);

    const [ts] = await db
      .select()
      .from(timesheetsTable)
      .where(eq(timesheetsTable.companyId, companyId));
    expect(ts).toBeDefined();
    expect(parseFloat(ts.totalHours)).toBeCloseTo(7.5);
  });
});
