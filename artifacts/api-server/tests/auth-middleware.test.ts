/**
 * Integration tests: Auth middleware chain
 *
 * Verifies that:
 * 1. Unauthenticated requests to protected routes return 401
 * 2. Authenticated users without a company return 403
 * 3. Authenticated users in the wrong company cannot access data from another company
 * 4. requirePermission blocks users without the required permission key
 *
 * Unlike other test files, here we test the REAL auth middleware (requireAuth,
 * requireCompany, requirePermission) with a minimal test router so we can
 * trigger each failure mode deterministically.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// ── Two test identities ───────────────────────────────────────────────────────
const CLERK_ID_OWNER = `test_auth_owner_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_ID_WORKER = `test_auth_worker_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const CLERK_ID_NOCOMPANY = `test_auth_nocompany_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

// Control which Clerk identity the mocked middleware sees
let activeClerkId: string | null = CLERK_ID_OWNER;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockImplementation(() =>
    activeClerkId ? { userId: activeClerkId } : { userId: null },
  ),
}));

let companyId: number;
let ownerUserId: number;
let workerUserId: number;
let noCompanyUserId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Auth Middleware Test Co", province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [owner] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID_OWNER,
      email: `auth-owner-${Date.now()}@example.com`,
      firstName: "Owner",
      lastName: "User",
      activeCompanyId: companyId,
    })
    .returning();
  ownerUserId = owner.id;

  const [worker] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID_WORKER,
      email: `auth-worker-${Date.now()}@example.com`,
      firstName: "Worker",
      lastName: "User",
      activeCompanyId: companyId,
    })
    .returning();
  workerUserId = worker.id;

  const [noCompany] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID_NOCOMPANY,
      email: `auth-nocompany-${Date.now()}@example.com`,
      firstName: "NoCompany",
      lastName: "User",
      activeCompanyId: null,
    })
    .returning();
  noCompanyUserId = noCompany.id;

  await db.insert(userMembershipsTable).values([
    { userId: ownerUserId, companyId, role: "owner", isActive: true },
    { userId: workerUserId, companyId, role: "worker", isActive: true },
    // noCompanyUserId has no membership
  ]);

  // Build a minimal app wired through the real auth middleware
  const app = express();
  app.use(express.json());

  const { requireAuth, requireCompany } = await import("../src/lib/auth.js");
  const { requirePermission } = await import("../src/lib/permissionGate.js");

  // Protected route — requires auth + company + manageQuotes permission
  app.get(
    "/protected/manage-quotes",
    requireAuth,
    requireCompany,
    requirePermission("manageQuotes"),
    (_req: Request, res: Response) => {
      res.json({ ok: true });
    },
  );

  // Protected route — requires auth + company only (no extra permission)
  app.get(
    "/protected/company-only",
    requireAuth,
    requireCompany,
    (_req: Request, res: Response) => {
      res.json({ ok: true });
    },
  );

  testApp = app;
});

afterAll(async () => {
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(usersTable).where(eq(usersTable.id, ownerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, workerUserId));
  await db.delete(usersTable).where(eq(usersTable.id, noCompanyUserId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

describe("requireAuth", () => {
  it("returns 401 when no Clerk session exists", async () => {
    activeClerkId = null;
    const res = await request(testApp)
      .get("/protected/company-only")
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(401);
  });
});

describe("requireCompany", () => {
  it("returns 403 when authenticated user has no company context", async () => {
    activeClerkId = CLERK_ID_NOCOMPANY;
    // No x-tenant-id header → requireCompany should block
    const res = await request(testApp).get("/protected/company-only");
    expect(res.status).toBe(403);
  });

  it("returns 403 when x-tenant-id is a company the user is not a member of", async () => {
    activeClerkId = CLERK_ID_OWNER;
    const res = await request(testApp)
      .get("/protected/company-only")
      .set("x-tenant-id", "999999"); // non-existent company
    expect(res.status).toBe(403);
  });

  it("passes when authenticated owner sends valid x-tenant-id", async () => {
    activeClerkId = CLERK_ID_OWNER;
    const res = await request(testApp)
      .get("/protected/company-only")
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(200);
  });
});

describe("requirePermission", () => {
  it("blocks a worker from accessing a manageQuotes-gated route", async () => {
    activeClerkId = CLERK_ID_WORKER;
    const res = await request(testApp)
      .get("/protected/manage-quotes")
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(403);
  });

  it("allows an owner to access a manageQuotes-gated route", async () => {
    activeClerkId = CLERK_ID_OWNER;
    const res = await request(testApp)
      .get("/protected/manage-quotes")
      .set("x-tenant-id", String(companyId));
    expect(res.status).toBe(200);
  });
});
