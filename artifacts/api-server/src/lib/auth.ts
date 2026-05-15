import { getAuth } from "@clerk/express";
import { db, usersTable, userMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      companyId?: number | null;
      userRole?: "owner" | "foreman" | "worker";
      systemRole?: string | null;
      memberships?: Array<{ companyId: number; role: "owner" | "foreman" | "worker" }>;
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
    res.status(401).json({ error: "User not found. Please sync your account." });
    return;
  }

  // Load memberships from the new multi-tenancy table
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
    // No memberships at all — user is not associated with any company
    req.log.warn({ userId: user.id }, "User has no company memberships");
    res.status(403).json({ error: "No company association found" });
    return;
  }

  // Phase 3: Validate x-tenant-id header if present.
  // Clients send this header to explicitly declare which company context
  // they intend to operate in. We verify the user actually belongs to it.
  const headerTenantId = req.headers["x-tenant-id"];
  if (headerTenantId != null) {
    const tenantId = Number(headerTenantId);
    if (!isNaN(tenantId)) {
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
        if (headerMembership) {
          req.companyId = headerMembership.companyId;
          req.userRole = headerMembership.role;
        }
      }
    }
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
