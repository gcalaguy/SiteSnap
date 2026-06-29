import { getAuth } from "@clerk/express";
import { db, usersTable, userMembershipsTable, subscriptionsTable, plansTable, withTenantCtx } from "@workspace/db";
import type { MemberPermissions } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { getCompanyFeatureKeys, isEnterprisePlan } from "./featureGate";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      companyId?: number | null;
      userRole?: "owner" | "foreman" | "worker";
      systemRole?: string | null;
      memberships?: Array<{ companyId: number; role: "owner" | "foreman" | "worker" }>;
      userPermissions?: MemberPermissions | null;
      user?: { email?: string | null };
      userDisplayName?: string;
    }
  }
}

// ── In-process LRU + TTL cache — cuts requireAuth from 2-4 DB queries to 0 on warm paths ────
class AuthTTLCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  constructor(private readonly maxSize: number, private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return undefined; }
    this.store.delete(key);
    this.store.set(key, entry); // refresh LRU position
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.maxSize) this.store.delete(this.store.keys().next().value as string);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void { this.store.delete(key); }
}

type UserRow = typeof usersTable.$inferSelect;
type MembershipRow = typeof userMembershipsTable.$inferSelect;

const authCache = new AuthTTLCache<{ user: UserRow; memberships: MembershipRow[] }>(500, 60_000);
// Per-company flag: subscription has been verified/provisioned — skip the check on hot paths.
const subCache = new AuthTTLCache<true>(500, 300_000);

/** Invalidate cached auth data for a user — call on /users/sync or membership changes. */
export function invalidateAuthCache(clerkUserId: string): void {
  authCache.delete(clerkUserId);
}

// Middleware: require a valid Clerk session and resolve the DB user
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let user: UserRow;
  let memberships: MembershipRow[];

  const hit = authCache.get(clerkUserId);
  if (hit) {
    ({ user, memberships } = hit);
  } else {
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);

    if (!dbUser) {
      req.log?.warn({ clerkUserId, ip: req.ip, userAgent: req.headers["user-agent"] }, "Auth: user not found in DB after Clerk verification");
      // 404, not 401 — the Clerk session IS valid; the user just hasn't been synced to the
      // DB yet (e.g. first sign-in via social OAuth, or a sync race on a fresh account).
      // Returning 401 here causes the client's handle401 to redirect to /sign-in, which
      // Clerk immediately bounces back to /dashboard (session still valid) → infinite loop.
      // 404 lets AuthGuard's retry + sync logic recover without triggering that redirect.
      res.status(404).json({ error: "User not found. Please sync your account." });
      return;
    }

    // Load memberships from the new multi-tenancy table (including permissions)
    memberships = await db
      .select()
      .from(userMembershipsTable)
      .where(eq(userMembershipsTable.userId, dbUser.id));

    user = dbUser;
    authCache.set(clerkUserId, { user, memberships });
  }

  const memList = memberships.map((m) => ({
    companyId: m.companyId,
    role: m.role,
  }));
  req.memberships = memList;

  // Determine active company + role:
  // 1) Prefer activeCompanyId if a matching membership exists
  // 2) Fallback to the first membership (or legacy companyId column for Phase 0)
  const activeFromMembership = memList.find(
    (m) => user.activeCompanyId && m.companyId === user.activeCompanyId,
  );
  const fallbackMembership = memList[0];

  req.userId = user.id;
  req.systemRole = user.systemRole;
  req.userDisplayName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  if (activeFromMembership) {
    req.companyId = activeFromMembership.companyId;
    req.userRole = activeFromMembership.role;
  } else if (fallbackMembership) {
    req.companyId = fallbackMembership.companyId;
    req.userRole = fallbackMembership.role;
  } else {
    // No memberships at all — user is authenticated but not yet onboarded.
    // Allow the request to proceed with no company context so that routes like
    // GET /users/me and POST /companies remain reachable during the sign-up
    // onboarding flow. Routes that require a company use requireCompany explicitly.
    req.companyId = null;
    req.userRole = undefined;
    next();
    return;
  }

  // Attach permissions from the active membership row (zero extra query)
  const activeMembershipRow = memberships.find(
    (m) => m.companyId === req.companyId,
  );
  req.userPermissions = activeMembershipRow?.permissions ?? null;

  // Auto-provision a default Starter subscription if the resolved company
  // has none (e.g. super-admin-created tenants or edge-case onboarding flows).
  // subCache short-circuits this check on every subsequent request for the same company.
  if (req.companyId != null && !subCache.get(String(req.companyId))) {
    try {
      const [sub] = await db
        .select({ id: subscriptionsTable.id })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.companyId, req.companyId))
        .limit(1);
      if (!sub) {
        const [starter] = await db
          .select({ id: plansTable.id })
          .from(plansTable)
          .where(eq(plansTable.slug, "starter"))
          .limit(1);
        if (starter) {
          await db
            .insert(subscriptionsTable)
            .values({
              companyId: req.companyId,
              planId: starter.id,
              status: "active",
              billingCycle: "monthly",
            })
            .onConflictDoNothing();
        } else {
          req.log?.warn({ companyId: req.companyId }, "No starter plan found in DB — company has no subscription");
        }
      }
      subCache.set(String(req.companyId), true);
    } catch (err: any) {
      req.log?.warn({ err, companyId: req.companyId }, "Failed to auto-provision default subscription");
    }
  }

  // Phase 3: Validate x-tenant-id header if present.
  // Clients send this header to explicitly declare which company context
  // they intend to operate in. We verify the user actually belongs to it.
  const headerTenantId = req.headers["x-tenant-id"];
  if (headerTenantId != null) {
    const tenantId = Number(headerTenantId);
    if (isNaN(tenantId) || !Number.isInteger(tenantId) || tenantId <= 0) {
      res.status(400).json({ error: "x-tenant-id must be a positive integer" });
      return;
    }
    const allowed = memList.some((m) => m.companyId === tenantId);
    if (!allowed) {
      res.status(403).json({ error: "Invalid tenant context" });
      return;
    }
    // If header tenant differs from the resolved company, trust the header
    // (the user may have just switched and the DB activeCompanyId hasn't
    // propagated yet, or they explicitly want this context).
    if (tenantId !== req.companyId) {
      const headerMembership = memList.find((m) => m.companyId === tenantId);
      const headerRow = memberships.find((m) => m.companyId === tenantId);
      if (headerMembership) {
        req.companyId = headerMembership.companyId;
        req.userRole = headerMembership.role;
        req.userPermissions = headerRow?.permissions ?? null;
      }
    }
  }

  next();
};

// Middleware: verify Clerk session only — does NOT require a DB user record.
// Use on bootstrap endpoints (e.g. POST /users/sync) where the DB user may not
// exist yet. The route is responsible for creating/upserting the user itself.
export const requireClerkSession = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

// Middleware: require super_admin system role
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.systemRole !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
};

/**
 * Middleware: allow access if user is a Super Admin, OR if they are an
 * Owner/Admin of an Enterprise tenant with the AUDIT_VAULT feature enabled.
 */
export const requireAuditAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Super admins always pass
  if (req.systemRole === "super_admin") {
    next();
    return;
  }

  // Must be an owner-level role in a company
  if (req.userRole !== "owner" && req.userRole !== "foreman") {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  if (!req.companyId) {
    res.status(403).json({ error: "No company associated with this account" });
    return;
  }

  // Explicit Enterprise plan check — Audit Vault is an Enterprise-only feature
  const enterprise = await isEnterprisePlan(req.companyId);
  if (!enterprise) {
    res.status(403).json({ error: "Audit Vault requires an Enterprise plan" });
    return;
  }

  const keys = await getCompanyFeatureKeys(req.companyId);
  if (!keys.includes("AUDIT_VAULT")) {
    res.status(403).json({ error: "Audit Vault is not included in your current plan" });
    return;
  }

  next();
};

// Middleware: require the user to have a company (be onboarded)
export const requireCompany = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.companyId) {
    res.status(403).json({ error: "No company associated with this account" });
    return;
  }
  next();
};

// Middleware: require owner or foreman role
export const requireOwnerOrForeman = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.userRole !== "owner" && req.userRole !== "foreman" && req.systemRole !== "super_admin") {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  next();
};

// Middleware: require owner role only
export const requireOwner = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.userRole !== "owner") {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  next();
};

/**
 * Middleware: wrap the remaining handler chain in a transaction with
 * `app.company_id` set so that Postgres RLS tenant-isolation policies are
 * enforced for every query that goes through the `db` (tenantDb) export.
 *
 * Must be placed AFTER requireAuth + requireCompany so that req.companyId
 * is already resolved. All downstream async code runs inside the transaction's
 * AsyncLocalStorage context, making RLS transparent to route handlers.
 */
export const requireTenantCtx = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.companyId) {
    next();
    return;
  }
  withTenantCtx(req.companyId, async () => {
    await new Promise<void>((resolve) => {
      // Commit the transaction once the response is finished.
      const originalEnd = res.end.bind(res);
      (res as any).end = (...args: any[]): typeof res => {
        (res as any).end = originalEnd;
        originalEnd(...args);
        resolve();
        return res;
      };
      next();
    });
  }).catch(next);
};
