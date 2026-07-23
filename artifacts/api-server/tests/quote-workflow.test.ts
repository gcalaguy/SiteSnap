/**
 * Integration tests: Quote workflow state machine
 *
 * Tests the full draft → pending_approval → approved/rejected lifecycle and
 * quote → invoice conversion, all against a real database.
 *
 * Auth is mocked at the Clerk boundary; requireAuth + requireCompany run for
 * real so we catch middleware chain regressions.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  quotesTable,
  invoicesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const CLERK_ID = `test_clerk_quote_wf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const EMAIL = `quote-wf-${Date.now()}@example.com`;

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockReturnValue({ userId: CLERK_ID }),
  requireAuth: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../src/lib/mailer", () => ({
  sendEmail: mockSendEmail,
  ResendSandboxError: class ResendSandboxError extends Error {},
  buildAppBase: () => "https://app.sitesnap.test",
  escapeHtml: (s: string) => s,
}));

vi.mock("../src/lib/push", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn().mockResolvedValue({ id: "mock-email-id" }) };
  },
}));

let companyId: number;
let userId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Quote WF Test Co", province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID,
      email: EMAIL,
      firstName: "Quote",
      lastName: "Tester",
      activeCompanyId: companyId,
    })
    .returning();
  userId = user.id;

  await db.insert(userMembershipsTable).values({
    userId: user.id,
    companyId,
    role: "owner",
    isActive: true,
  });

  const app = express();
  app.use(express.json());

  // Inject req.userId and req.companyId so requireAuth + requireCompany pass.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).userId = userId;
    (req as any).companyId = companyId;
    next();
  });

  const { default: quotesRouter } = await import("../src/routes/quotes.js");
  app.use("/quotes", quotesRouter);

  testApp = app;
});

afterAll(async () => {
  // Clean up in reverse-FK order
  await db.delete(invoicesTable).where(eq(invoicesTable.companyId, companyId));
  await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

describe("Quote state machine", () => {
  let quoteId: number;

  it("creates a quote in draft state", async () => {
    const res = await request(testApp)
      .post("/quotes")
      .send({
        title: "Test Quote",
        clientName: "ACME Corp",
        lineItems: [{ description: "Labour", quantity: 10, unit: "hr", unitPrice: 100, total: 1000 }],
        subtotal: 1000,
        taxRate: 13,
        taxAmount: 130,
        total: 1130,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.quoteNumber).toMatch(/^QUO-/);
    quoteId = res.body.id;
  });

  it("blocks editing a quote that does not belong to this company", async () => {
    const res = await request(testApp).put("/quotes/999999").send({ title: "Hacked" });
    // Should 404 (not found for this company) rather than 200
    expect(res.status).toBe(404);
  });

  it("submits the quote for approval (draft → pending_approval)", async () => {
    const res = await request(testApp).post(`/quotes/${quoteId}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_approval");
  });

  it("cannot submit an already-submitted quote", async () => {
    const res = await request(testApp).post(`/quotes/${quoteId}/submit`);
    expect(res.status).toBe(409);
  });

  it("rejects the quote (pending_approval → rejected)", async () => {
    const res = await request(testApp)
      .post(`/quotes/${quoteId}/reject`)
      .send({ reason: "Price too high" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  it("cannot approve a rejected quote", async () => {
    const res = await request(testApp).post(`/quotes/${quoteId}/approve`);
    expect(res.status).toBe(409);
  });

  it("unsubmits and re-approves the quote", async () => {
    // Move back to draft via unsubmit
    const unsubmit = await request(testApp).post(`/quotes/${quoteId}/unsubmit`);
    expect(unsubmit.status).toBe(200);
    expect(unsubmit.body.status).toBe("draft");

    // Submit again
    await request(testApp).post(`/quotes/${quoteId}/submit`);

    // Approve
    const approve = await request(testApp).post(`/quotes/${quoteId}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe("approved");
  });

  it("converts approved quote to invoice atomically", async () => {
    const res = await request(testApp)
      .post(`/quotes/${quoteId}/convert-to-invoice`)
      .send({ dueDate: "2026-12-31" });

    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toMatch(/^INV-/);
    expect(res.body.status).toBe("draft");

    // Verify the quote is now marked converted in DB
    const [quote] = await db
      .select({ status: quotesTable.status })
      .from(quotesTable)
      .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, companyId)));
    expect(quote.status).toBe("converted");
  });

  it("cannot convert an already-converted quote", async () => {
    const res = await request(testApp).post(`/quotes/${quoteId}/convert-to-invoice`).send({});
    expect(res.status).toBe(409);
  });
});

describe("Quote PDF and send-email", () => {
  let quoteId: number;

  beforeAll(async () => {
    const res = await request(testApp)
      .post("/quotes")
      .send({
        title: "Sendable Quote",
        clientName: "Jane Client",
        clientEmail: "jane@example.com",
        lineItems: [{ description: "Baseboard install", quantity: 40, unit: "lf", unitPrice: 8, total: 320 }],
        subtotal: 320,
        taxRate: 13,
        taxAmount: 41.6,
        total: 361.6,
      });
    quoteId = res.body.id;
  });

  it("returns a PDF buffer with the correct content type", async () => {
    const res = await request(testApp).get(`/quotes/${quoteId}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body.length).toBeGreaterThan(0);
    // PDF magic bytes
    expect(Buffer.from(res.body).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("404s for a quote that doesn't exist", async () => {
    const res = await request(testApp).get("/quotes/999999/pdf");
    expect(res.status).toBe(404);
  });

  it("emails the PDF and public sign link to the client, and stamps sentAt/sentVia", async () => {
    const res = await request(testApp).post(`/quotes/${quoteId}/send-email`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.quote.sentVia).toBe("email");
    expect(res.body.quote.sentAt).toBeTruthy();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const payload = mockSendEmail.mock.calls[0][0];
    expect(payload.to).toEqual(["jane@example.com"]);
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toMatch(/\.pdf$/);
  });

  it("refuses to send when the quote has no client email", async () => {
    const created = await request(testApp)
      .post("/quotes")
      .send({ title: "No Email Quote", clientName: "No Email Client" });

    const res = await request(testApp).post(`/quotes/${created.body.id}/send-email`);
    expect(res.status).toBe(400);
  });
});

describe("Quote tenant isolation", () => {
  it("cannot fetch a quote belonging to a different company", async () => {
    // Insert a quote directly under a different (non-existent) company ID
    const [otherCompany] = await db
      .insert(companiesTable)
      .values({ name: "Other Company", province: "ON", city: "Ottawa" })
      .returning();

    const [foreignQuote] = await db
      .insert(quotesTable)
      .values({
        companyId: otherCompany.id,
        quoteNumber: "QT-FOREIGN-001",
        title: "Foreign Quote",
        clientName: "Stranger",
        status: "draft",
        createdByUserId: userId,
        publicToken: crypto.randomUUID(),
      })
      .returning();

    const res = await request(testApp).get(`/quotes/${foreignQuote.id}`);
    expect(res.status).toBe(404);

    // Cleanup
    await db.delete(quotesTable).where(eq(quotesTable.id, foreignQuote.id));
    await db.delete(companiesTable).where(eq(companiesTable.id, otherCompany.id));
  });
});
