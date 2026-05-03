import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      companyId?: number | null;
      userRole?: "owner" | "foreman" | "worker";
      systemRole?: string | null;
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

  req.userId = user.id;
  req.companyId = user.companyId;
  req.userRole = user.role;
  req.systemRole = user.systemRole;
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
  if (req.userRole !== "owner" && req.userRole !== "foreman") {
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
