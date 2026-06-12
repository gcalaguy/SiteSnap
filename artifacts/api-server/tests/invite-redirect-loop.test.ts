/**
 * Integration tests: POST /invitations/:token/accept
 *
 * Verifies that a brand-new Clerk user (no existing DB record) can follow an
 * invite link, accept the invitation, and end up with a DB user + membership
 * in one atomic step.
 *
 * IMPORTANT — why ../src/lib/auth is intentionally NOT mocked here:
 *   The task requires catching regressions where a developer accidentally adds
 *   requireAuth or requireCompany to the accept route (which is public /
 *   session-aware, not company-gated).  If those middlewares were mocked to
 *   always call next(), this test would silently pass even after such a
 *   regression.  By letting the real middlewares run:
 *     - A real requireAuth would look up the DB user — which doesn't exist yet
 *       at test-1 time — and return 401, failing the test.
 *     - A real requireCompany would check req.companyId (not set by the
 *       public accept handler) and return 403, failing the test.
 *   This gives us automated regression coverage for the redirect-loop bug.
 *
 * The frontend exemption logic (ONBOARDING_EXEMPT_ROUTES) is tested in
 * artifacts/web-dashboard/tests/auth-guard.test.tsx, which imports from the
 * real auth-guard.tsx source.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  invitationsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const FAKE_CLERK_USER_ID = `test_clerk_invite_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const INVITE_EMAIL = `invite-test-${Date.now()}@example.com`;

/*
 * Mock @clerk/express so the route handler's getAuth() call returns a
 * controllable Clerk session without a real JWT.  The route calls getAuth()
 * directly — it does NOT go through requireAuth middleware — so this mock
 * is the minimal surface needed without bypassing any real middleware.
 */
vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
  clerkClient: {
    users: {
      getUser: vi.fn(),
    },
  },
}));

/*
 * Mock seatEnforcement and mailer only to avoid side-effects on other routes
 * in the same router that are not under test here.  requireAuth and
 * requireCompany are intentionally left unmocked — see note above.
 */
vi.mock("../src/lib/seatEnforcement", () => ({
  requireSeatAvailable: (_req: Request, _res: Response, next: NextFunction) =>
    next(),
}));

vi.mock("../src/lib/mailer", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  ResendSandboxError: class ResendSandboxError extends Error {},
}));

let companyId: number;
let invitationToken: string;
let testApp: express.Express;

beforeAll(async () => {
  const { getAuth, clerkClient } = await import("@clerk/express");

  (getAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    userId: FAKE_CLERK_USER_ID,
  });

  (
    (clerkClient as any).users.getUser as ReturnType<typeof vi.fn>
  ).mockResolvedValue({
    id: FAKE_CLERK_USER_ID,
    emailAddresses: [{ emailAddress: INVITE_EMAIL }],
    firstName: "Invite",
    lastName: "Tester",
  });

  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Invite Test Co", province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  invitationToken = crypto.randomBytes(32).toString("hex");

  await db.insert(invitationsTable).values({
    companyId,
    email: INVITE_EMAIL,
    role: "worker",
    token: invitationToken,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const { default: invitationsRouter } = await import(
    "../src/routes/invitations"
  );

  /*
   * Minimal Express app — NO middleware injected before the router.
   * requireAuth / requireCompany are not applied on the accept route by design.
   * If they are ever mistakenly added, the real middleware will run and the
   * tests below will fail, exposing the regression automatically.
   */
  testApp = express();
  testApp.use(express.json());
  testApp.use("/api", invitationsRouter);
});

afterAll(async () => {
  await db
    .delete(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));

  await db
    .delete(usersTable)
    .where(eq(usersTable.clerkUserId, FAKE_CLERK_USER_ID));

  await db
    .delete(invitationsTable)
    .where(eq(invitationsTable.token, invitationToken));

  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

describe("POST /api/invitations/:token/accept — invite flow (new user, no DB record)", () => {
  it("returns 200 and creates a DB user + membership for a brand-new Clerk user", async () => {
    /*
     * At this point no DB user exists for FAKE_CLERK_USER_ID.
     * If requireAuth was accidentally added to this route, it would look up
     * the user, fail to find them, and return 401 — making this test fail.
     */
    const res = await request(testApp)
      .post(`/api/invitations/${invitationToken}/accept`)
      .send();

    expect(res.status).toBe(200);

    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, FAKE_CLERK_USER_ID))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser.email).toBe(INVITE_EMAIL);
    expect(dbUser.activeCompanyId).toBe(companyId);

    const [membership] = await db
      .select()
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, dbUser.id),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .limit(1);

    expect(membership).toBeDefined();
    expect(membership.role).toBe("worker");
    expect(membership.isActive).toBe(true);
  });

  it("marks the invitation as accepted after a successful accept", async () => {
    const [invitation] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.token, invitationToken))
      .limit(1);

    expect(invitation.status).toBe("accepted");
  });

  it("is idempotent — re-accepting returns 200 when membership already exists", async () => {
    const res = await request(testApp)
      .post(`/api/invitations/${invitationToken}/accept`)
      .send();

    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(testApp)
      .post(`/api/invitations/does-not-exist-token/accept`)
      .send();

    expect(res.status).toBe(404);
  });

  it("returns 401 when no Clerk session is present", async () => {
    const { getAuth } = await import("@clerk/express");
    (getAuth as ReturnType<typeof vi.fn>).mockReturnValueOnce({ userId: null });

    const res = await request(testApp)
      .post(`/api/invitations/${invitationToken}/accept`)
      .send();

    expect(res.status).toBe(401);
  });
});
