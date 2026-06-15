import { getAuth } from "@clerk/express";
import { db, usersTable, userMembershipsTable, subscriptionsTable, plansTable } from "@workspace/db";
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
    }
  }
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

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
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
  const memberships = await db
    .select()
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.userId, user.id));

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
  if (req.companyId != null) {
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
          req.log.warn({ companyId: req.companyId }, "No starter plan found in DB — company has no subscription");
        }
      }
    } catch (err: any) {
      req.log.warn({ err, companyId: req.companyId }, "Failed to auto-provision default subscription");
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
