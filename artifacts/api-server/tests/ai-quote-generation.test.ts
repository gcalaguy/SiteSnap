/**
 * Integration tests: AI quote generation (Phase 2 — structured scope extraction)
 *
 * Covers /ai/scope/extract (unpriced trade/room/task breakdown) and the
 * /ai/quote/generate scopeItems input path added alongside it. The OpenAI
 * client is mocked; auth is mocked at the Clerk boundary the same way the
 * quote-workflow test does.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { db, companiesTable, usersTable, userMembershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const CLERK_ID = `test_clerk_ai_quote_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const EMAIL = `ai-quote-${Date.now()}@example.com`;

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: vi.fn().mockReturnValue({ userId: CLERK_ID }),
  requireAuth: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: mockCreate } } },
  speechToText: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
}));

let companyId: number;
let userId: number;
let testApp: express.Express;

beforeAll(async () => {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: "AI Quote Test Co", province: "ON", city: "Toronto" })
    .returning();
  companyId = company.id;

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: CLERK_ID,
      email: EMAIL,
      firstName: "AI",
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

  const { default: aiRouter } = await import("../src/routes/ai.js");
  app.use("/", aiRouter);

  testApp = app;
});

afterAll(async () => {
  await db.delete(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

function mockOpenAIResponse(content: unknown) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

describe("POST /ai/scope/extract", () => {
  it("breaks a multi-trade description into grouped, unpriced scope items", async () => {
    mockOpenAIResponse({
      scopeItems: [
        { trade: "Electrical", room: "Bathroom", taskCategory: "Exhaust Fan Replacement", description: "Replace 2 bathroom exhaust fans", quantity: 2, unit: "ea" },
        { trade: "Carpentry", taskCategory: "Baseboard Installation", description: "Install 40 feet of MDF baseboard", quantity: 40, unit: "lf" },
        { trade: "Drywall", room: "Master Bedroom", taskCategory: "Drywall Repair", description: "Patch drywall in master bedroom", quantity: 1, unit: "job" },
        { trade: "Painting", taskCategory: "Paint Touch-Up", description: "Paint repaired area", quantity: 1, unit: "job" },
      ],
    });

    const res = await request(testApp)
      .post("/ai/scope/extract")
      .send({ voiceInput: "Replace 2 bathroom exhaust fans, install 40 feet of MDF baseboard, patch drywall in master bedroom, paint repaired area." });

    expect(res.status).toBe(200);
    expect(res.body.scopeItems).toHaveLength(4);
    expect(res.body.scopeItems.map((i: { trade: string }) => i.trade)).toEqual(
      expect.arrayContaining(["Electrical", "Carpentry", "Drywall", "Painting"])
    );
    // Extraction must not price anything.
    expect(res.body.scopeItems[0]).not.toHaveProperty("unitPrice");
  });

  it("rejects an empty description", async () => {
    const res = await request(testApp).post("/ai/scope/extract").send({ voiceInput: "" });
    expect(res.status).toBe(400);
  });
});

describe("POST /ai/quote/generate", () => {
  it("prices raw voiceInput directly (fast path, unchanged)", async () => {
    mockOpenAIResponse({
      title: "Bathroom Fan Replacement",
      lineItems: [{ description: "Exhaust fan replacement", quantity: 2, unit: "ea", unitPrice: 250, total: 500 }],
      subtotal: 500,
      taxAmount: 65,
      total: 565,
      notes: "",
    });

    const res = await request(testApp).post("/ai/quote/generate").send({ voiceInput: "Replace 2 bathroom exhaust fans" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(565);
  });

  it("prices a reviewed scopeItems list instead of re-extracting", async () => {
    mockOpenAIResponse({
      title: "Reviewed Scope Quote",
      lineItems: [
        { description: "Exhaust fan replacement", quantity: 2, unit: "ea", unitPrice: 250, total: 500 },
        { description: "MDF baseboard installation", quantity: 40, unit: "lf", unitPrice: 8, total: 320 },
      ],
      subtotal: 820,
      taxAmount: 106.6,
      total: 926.6,
      notes: "",
    });

    const res = await request(testApp)
      .post("/ai/quote/generate")
      .send({
        scopeItems: [
          { trade: "Electrical", taskCategory: "Exhaust Fan Replacement", description: "Replace 2 bathroom exhaust fans", quantity: 2, unit: "ea" },
          { trade: "Carpentry", taskCategory: "Baseboard Installation", description: "Install 40 feet of MDF baseboard", quantity: 40, unit: "lf" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.lineItems).toHaveLength(2);
    expect(res.body.total).toBe(926.6);
  });

  it("rejects a request with neither voiceInput nor scopeItems", async () => {
    const res = await request(testApp).post("/ai/quote/generate").send({});
    expect(res.status).toBe(400);
  });
});
