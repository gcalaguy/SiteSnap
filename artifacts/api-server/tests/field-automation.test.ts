import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  projectsTable,
  dailyLogsTable,
  sitePhotosTable,
  safetySignoffsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/*
 * Mock auth & permission middleware so we can hit HTTP endpoints
 * without real Clerk JWTs.  The pre-router middleware below injects
 * the exact auth context the route handlers expect.
 */
vi.mock("../src/lib/auth", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireCompany: (_req: Request, _res: Response, next: NextFunction) =>
    next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) =>
    next(),
  requireOwnerOrForeman: (
    _req: Request,
    _res: Response,
    next: NextFunction,
  ) => next(),
  requireOwner: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../src/lib/permissionGate", () => ({
  requirePermission: (_key: string) =>
    (_req: Request, _res: Response, next: NextFunction) => next(),
  resolvePermission: () => true,
}));

let companyId: number;
let userId: number;
let projectId: number;
let testApp: express.Express;

/* ── Test harness ─────────────────────────────────────────────────────── */

beforeAll(async () => {
  // 1. Seed a test company
  const [company] = await db
    .insert(companiesTable)
    .values({
      name: "Field Automation Test Co",
      province: "ON",
      city: "Toronto",
    })
    .returning();
  companyId = company.id;

  // 2. Seed a test user
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `test_clerk_field_auto_${Date.now()}`,
      email: `field-auto-test-${Date.now()}@example.com`,
      firstName: "Field",
      lastName: "Tester",
      activeCompanyId: companyId,
    })
    .returning();
  userId = user.id;

  // 3. Owner membership
  await db.insert(userMembershipsTable).values({
    userId,
    companyId,
    role: "owner",
    isActive: true,
  });

  // 4. Seed a test project
  const [project] = await db
    .insert(projectsTable)
    .values({
      companyId,
      name: "Field Test Project",
      status: "active",
      province: "ON",
      city: "Toronto",
      address: "123 Test St",
    })
    .returning();
  projectId = project.id;

  // 5. Build Express app with auth-context pre-middleware + field router
  const { default: fieldRouter } = await import(
    "../src/routes/fieldAutomation"
  );
  testApp = express();
  testApp.use(express.json());

  // Inject auth context that route handlers rely on
  testApp.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).userId = userId;
    (req as any).companyId = companyId;
    (req as any).userRole = "owner";
    (req as any).systemRole = null;
    (req as any).userPermissions = null;
    (req as any).memberships = [{ companyId, role: "owner" }];
    next();
  });

  testApp.use("/api", fieldRouter);
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await db
    .delete(safetySignoffsTable)
    .where(eq(safetySignoffsTable.projectId, projectId));
  await db.delete(sitePhotosTable).where(eq(sitePhotosTable.projectId, projectId));
  await db.delete(dailyLogsTable).where(eq(dailyLogsTable.projectId, projectId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  await db
    .delete(userMembershipsTable)
    .where(eq(userMembershipsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
});

/* ── Daily Logs ───────────────────────────────────────────────────────── */

describe("POST /api/field/daily-log", () => {
  it("creates a daily log and returns 201", async () => {
    const res = await request(testApp)
      .post("/api/field/daily-log")
      .send({
        projectId,
        notes: "Poured foundation for garage slab",
        weatherTemp: "24",
        weatherCondition: "sunny",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      foremanId: userId,
      notes: "Poured foundation for garage slab",
      weatherTemp: "24",
      weatherCondition: "sunny",
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  it("rejects a missing projectId with 400", async () => {
    const res = await request(testApp)
      .post("/api/field/daily-log")
      .send({ notes: "No project" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid body/i);
  });

  it("rejects a non-existent project with 404", async () => {
    const res = await request(testApp)
      .post("/api/field/daily-log")
      .send({
        projectId: 999999,
        notes: "Ghost project",
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Project not found/i);
  });
});

describe("GET /api/field/daily-log", () => {
  it("returns daily logs for the project", async () => {
    const res = await request(testApp)
      .get("/api/field/daily-log")
      .query({ projectId: String(projectId) });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty("notes");
    expect(res.body[0]).toHaveProperty("weatherTemp");
  });

  it("requires projectId query param", async () => {
    const res = await request(testApp).get("/api/field/daily-log");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/projectId query param required/i);
  });
});

/* ── Site Photos ──────────────────────────────────────────────────────── */

describe("POST /api/field/photo-upload", () => {
  it("creates a site photo record and returns 201", async () => {
    const res = await request(testApp)
      .post("/api/field/photo-upload")
      .send({
        projectId,
        imageUrl:
          "https://storage.example.com/photos/site_001_foundation.jpg",
        markupData: {
          circles: [{ x: 120, y: 200, radius: 15 }],
          arrows: [{ fromX: 50, fromY: 50, toX: 150, toY: 150 }],
        },
        roomLocation: "Garage foundation — south-east corner",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      imageUrl: "https://storage.example.com/photos/site_001_foundation.jpg",
      roomLocation: "Garage foundation — south-east corner",
    });
    expect(res.body.markupData).toEqual({
      circles: [{ x: 120, y: 200, radius: 15 }],
      arrows: [{ fromX: 50, fromY: 50, toX: 150, toY: 150 }],
    });
    expect(res.body.id).toBeDefined();
  });

  it("rejects missing imageUrl with 400", async () => {
    const res = await request(testApp)
      .post("/api/field/photo-upload")
      .send({ projectId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid body/i);
  });
});

describe("GET /api/field/photo-upload", () => {
  it("returns photos for the project", async () => {
    const res = await request(testApp)
      .get("/api/field/photo-upload")
      .query({ projectId: String(projectId) });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty("imageUrl");
    expect(res.body[0]).toHaveProperty("markupData");
  });
});

/* ── Safety Signoffs ──────────────────────────────────────────────────── */

describe("POST /api/field/safety-check", () => {
  it("creates a safety signoff and returns 201", async () => {
    const res = await request(testApp)
      .post("/api/field/safety-check")
      .send({
        projectId,
        responses: {
          hardHatWorn: true,
          harnessChecked: true,
          siteClearOfHazards: true,
        },
        signatureUrl: "https://storage.example.com/signatures/sig_001.png",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      workerId: userId,
      responses: {
        hardHatWorn: true,
        harnessChecked: true,
        siteClearOfHazards: true,
      },
      signatureUrl: "https://storage.example.com/signatures/sig_001.png",
    });
    expect(res.body.id).toBeDefined();
  });

  it("allows a signoff without an optional signatureUrl", async () => {
    const res = await request(testApp)
      .post("/api/field/safety-check")
      .send({
        projectId,
        responses: {
          hardHatWorn: true,
          harnessChecked: false,
          siteClearOfHazards: true,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.signatureUrl).toBeNull();
  });

  it("rejects missing responses with 400", async () => {
    const res = await request(testApp)
      .post("/api/field/safety-check")
      .send({ projectId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid body/i);
  });
});

describe("GET /api/field/safety-check", () => {
  it("returns signoffs for the project", async () => {
    const res = await request(testApp)
      .get("/api/field/safety-check")
      .query({ projectId: String(projectId) });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty("responses");
    expect(res.body[0]).toHaveProperty("signatureUrl");
  });
});

/* ── Cross-cutting concerns ───────────────────────────────────────────── */

describe("Project access isolation", () => {
  it("returns 404 when projectId belongs to another company", async () => {
    const [otherCompany] = await db
      .insert(companiesTable)
      .values({ name: "Other Co", province: "ON", city: "Ottawa" })
      .returning();
    const [otherProject] = await db
      .insert(projectsTable)
      .values({
        companyId: otherCompany.id,
        name: "Other Project",
        status: "active",
        province: "ON",
        city: "Ottawa",
        address: "456 Other Ave",
      })
      .returning();

    const res = await request(testApp)
      .get("/api/field/daily-log")
      .query({ projectId: String(otherProject.id) });

    expect(res.status).toBe(404);

    // Clean up
    await db.delete(projectsTable).where(eq(projectsTable.id, otherProject.id));
    await db
      .delete(companiesTable)
      .where(eq(companiesTable.id, otherCompany.id));
  });
});

describe("Full round-trip: create then list", () => {
  it("all three resource types are discoverable after creation", async () => {
    // Create one of each
    const logRes = await request(testApp)
      .post("/api/field/daily-log")
      .send({ projectId, notes: "Round-trip log" });
    expect(logRes.status).toBe(201);

    const photoRes = await request(testApp)
      .post("/api/field/photo-upload")
      .send({
        projectId,
        imageUrl: "https://storage.example.com/photos/rt.jpg",
      });
    expect(photoRes.status).toBe(201);

    const safetyRes = await request(testApp)
      .post("/api/field/safety-check")
      .send({
        projectId,
        responses: {
          hardHatWorn: true,
          harnessChecked: true,
          siteClearOfHazards: true,
        },
      });
    expect(safetyRes.status).toBe(201);

    // List and verify presence
    const logs = await request(testApp)
      .get("/api/field/daily-log")
      .query({ projectId: String(projectId) });
    expect(logs.body.some((l: any) => l.notes === "Round-trip log")).toBe(
      true,
    );

    const photos = await request(testApp)
      .get("/api/field/photo-upload")
      .query({ projectId: String(projectId) });
    expect(
      photos.body.some(
        (p: any) => p.imageUrl === "https://storage.example.com/photos/rt.jpg",
      ),
    ).toBe(true);

    const signoffs = await request(testApp)
      .get("/api/field/safety-check")
      .query({ projectId: String(projectId) });
    expect(signoffs.body.length).toBeGreaterThanOrEqual(1);
  });
});
