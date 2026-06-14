/**
 * Integration tests: Invoice workflow state machine
 *
 * Tests: create → mark-sent → mark-paid lifecycle, tenant isolation (another
 * company's invoice returns 404), and atomic invoice number allocation (no
 * duplicate numbers under concurrent creation).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  invoicesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const CLERK_ID = `test_clerk_inv_wf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const EMAIL = `inv-wf-${Date.now()}@example.com`;

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockReturnValue({ userId: CLERK_ID }),
  requireAuth: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../src/lib/mailer", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  ResendSandboxError: class ResendSandboxError extends Error {},
}));

vi.mock("../src/lib/push", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

let companyId: number;
let userId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Invoice WF Test Co", province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID,
      email: EMAIL,
      firstName: "Invoice",
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

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).userId = userId;
    (req as any).companyId = companyId;
    next();
  });

  const { default: invoicesRouter } = await import("../src/routes/invoices.js");
  app.use("/", invoicesRouter);

  testApp = app;
});

afterAll(async () => {
  await db.delete(invoicesTable).where(eq(invoicesTable.companyId, companyId));
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

describe("Invoice state machine", () => {
  let invoiceId: number;

  it("creates an invoice in draft state with a unique INV number", async () => {
    const res = await request(testApp)
      .post("/invoices")
      .send({
        title: "Test Invoice",
        clientName: "ACME Corp",
        lineItems: [{ description: "Labour", quantity: 5, unit: "hr", unitPrice: 200, total: 1000 }],
        dueDate: "2026-12-31",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.invoiceNumber).toMatch(/^INV-/);
    invoiceId = res.body.id;
  });

  it("marks the invoice as sent (draft → sent)", async () => {
    const res = await request(testApp).post(`/invoices/${invoiceId}/mark-sent`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
  });

  it("cannot mark a sent invoice as sent again", async () => {
    const res = await request(testApp).post(`/invoices/${invoiceId}/mark-sent`);
    // Already sent — should return a conflict or bad request
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("marks the invoice as paid (sent → paid)", async () => {
    const res = await request(testApp).post(`/invoices/${invoiceId}/mark-paid`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
  });

  it("cannot edit a paid invoice", async () => {
    const res = await request(testApp)
      .put(`/invoices/${invoiceId}`)
      .send({ title: "Modified After Payment" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Invoice number uniqueness under concurrent creation", () => {
  it("allocates unique invoice numbers for simultaneous requests", async () => {
    const N = 5;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        request(testApp)
          .post("/invoices")
          .send({ title: "Concurrent Invoice", clientName: "Test Client" }),
      ),
    );

    const numbers = results
      .filter((r) => r.status === 201)
      .map((r) => r.body.invoiceNumber as string);

    expect(numbers.length).toBe(N);
    // All numbers must be unique — no race condition duplicates
    expect(new Set(numbers).size).toBe(N);
  });
});

describe("Invoice tenant isolation", () => {
  it("cannot fetch an invoice belonging to a different company", async () => {
    const [otherCompany] = await db
      .insert(companiesTable)
      .values({ name: "Other Invoice Co", province: "BC", city: "Vancouver" })
      .returning();

    const [foreignInvoice] = await db
      .insert(invoicesTable)
      .values({
        companyId: otherCompany.id,
        invoiceNumber: "INV-FOREIGN-001",
        title: "Foreign Invoice",
        clientName: "Stranger",
        status: "draft",
        createdByUserId: userId,
      })
      .returning();

    const res = await request(testApp).get(`/invoices/${foreignInvoice.id}`);
    expect(res.status).toBe(404);

    // Cleanup
    await db.delete(invoicesTable).where(eq(invoicesTable.id, foreignInvoice.id));
    await db.delete(companiesTable).where(eq(companiesTable.id, otherCompany.id));
  });
});
