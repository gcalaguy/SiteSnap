import { db } from "@workspace/db";
import {
  workerCredentialsTable,
  credentialAlertLogsTable,
  usersTable,
  userMembershipsTable,
  subscriptionsTable,
  plansTable,
  companiesTable,
  type InsertWorkerCredential,
  type WorkerCredential,
} from "@workspace/db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface BlockItem {
  credentialType: string;
  reason: "missing" | "expired";
  expiresAt?: string | null;
}

export interface WarningItem {
  credentialType: string;
  expiresAt: string;
  daysUntilExpiry: number;
}

export interface EligibilityResult {
  eligible: boolean;
  blocks: BlockItem[];
  warnings: WarningItem[];
}

interface WorkerRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface WorkerCredentialMatrixEntry {
  user: WorkerRow;
  credentials: WorkerCredential[];
}

// ── Worker credentials ─────────────────────────────────────────────────────────

export async function getWorkerCredentialMatrix(
  companyId: number,
): Promise<WorkerCredentialMatrixEntry[]> {
  // Single query: all members of the company with a left-join on credentials
  const rows = await db
    .select({
      userId: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      credential: workerCredentialsTable,
    })
    .from(userMembershipsTable)
    .innerJoin(usersTable, eq(userMembershipsTable.userId, usersTable.id))
    .leftJoin(
      workerCredentialsTable,
      and(
        eq(workerCredentialsTable.userId, usersTable.id),
        eq(workerCredentialsTable.companyId, companyId),
      ),
    )
    .where(eq(userMembershipsTable.companyId, companyId))
    .orderBy(asc(usersTable.lastName), asc(usersTable.firstName));

  // Group into per-worker entries in memory (avoids N+1)
  const map = new Map<number, WorkerCredentialMatrixEntry>();
  for (const row of rows) {
    if (!map.has(row.userId)) {
      map.set(row.userId, {
        user: { id: row.userId, firstName: row.firstName, lastName: row.lastName, email: row.email },
        credentials: [],
      });
    }
    if (row.credential?.id) {
      map.get(row.userId)!.credentials.push(row.credential as WorkerCredential);
    }
  }

  return Array.from(map.values());
}

export async function getCredentialsForUser(
  companyId: number,
  userId: number,
): Promise<WorkerCredential[]> {
  return db
    .select()
    .from(workerCredentialsTable)
    .where(
      and(
        eq(workerCredentialsTable.companyId, companyId),
        eq(workerCredentialsTable.userId, userId),
      ),
    )
    .orderBy(asc(workerCredentialsTable.credentialType));
}

export async function upsertWorkerCredential(
  data: InsertWorkerCredential,
): Promise<WorkerCredential> {
  const [row] = await db
    .insert(workerCredentialsTable)
    .values(data)
    .onConflictDoUpdate({
      target: [
        workerCredentialsTable.companyId,
        workerCredentialsTable.userId,
        workerCredentialsTable.credentialType,
      ],
      set: {
        certificateNumber: data.certificateNumber,
        issueDate: data.issueDate,
        expirationDate: data.expirationDate,
        status: data.status,
        documentUrl: data.documentUrl,
        issuedBy: data.issuedBy,
        notes: data.notes,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function checkWorkerDeploymentEligibility(
  companyId: number,
  userId: number,
  requiredCredentials: string[],
): Promise<EligibilityResult> {
  if (requiredCredentials.length === 0) {
    return { eligible: true, blocks: [], warnings: [] };
  }

  const credentials = await db
    .select()
    .from(workerCredentialsTable)
    .where(
      and(
        eq(workerCredentialsTable.companyId, companyId),
        eq(workerCredentialsTable.userId, userId),
        inArray(workerCredentialsTable.credentialType, requiredCredentials as any[]),
      ),
    );

  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const blocks: BlockItem[] = [];
  const warnings: WarningItem[] = [];

  for (const required of requiredCredentials) {
    const cred = credentials.find((c) => c.credentialType === required);

    if (!cred || cred.status === "revoked") {
      blocks.push({ credentialType: required, reason: "missing" });
      continue;
    }

    if (cred.status === "expired") {
      blocks.push({
        credentialType: required,
        reason: "expired",
        expiresAt: cred.expirationDate,
      });
      continue;
    }

    if (cred.expirationDate) {
      const expiryDate = new Date(cred.expirationDate);
      const msUntilExpiry = expiryDate.getTime() - now.getTime();
      if (msUntilExpiry < 0) {
        blocks.push({
          credentialType: required,
          reason: "expired",
          expiresAt: cred.expirationDate,
        });
      } else if (msUntilExpiry < thirtyDaysMs) {
        warnings.push({
          credentialType: required,
          expiresAt: cred.expirationDate,
          daysUntilExpiry: Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  return {
    eligible: blocks.length === 0,
    blocks,
    warnings,
  };
}

export async function getMyCredentials(
  companyId: number,
  userId: number,
): Promise<WorkerCredential[]> {
  return getCredentialsForUser(companyId, userId);
}

// ── Plan / feature helpers ────────────────────────────────────────────────────

export async function isEnterprisePlanWithCorModule(companyId: number): Promise<boolean> {
  const [row] = await db
    .select({
      planSlug: plansTable.slug,
      activeFeatures: companiesTable.activeFeatures,
    })
    .from(subscriptionsTable)
    .innerJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id))
    .innerJoin(companiesTable, eq(companiesTable.id, companyId))
    .where(eq(subscriptionsTable.companyId, companyId))
    .limit(1);

  if (!row) return false;
  const isEnterprise = row.planSlug === "enterprise";
  const hasFlag = row.activeFeatures?.includes("COR_MODULE") ?? false;
  return isEnterprise && hasFlag;
}

export async function hasCorModuleFeature(companyId: number): Promise<boolean> {
  const [row] = await db
    .select({ activeFeatures: companiesTable.activeFeatures })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  return row?.activeFeatures?.includes("COR_MODULE") ?? false;
}

// ── Credential Expiry Alerts ──────────────────────────────────────────────────

export interface ExpiringCredential {
  credentialId: number;
  companyId: number;
  userId: number;
  credentialType: string;
  expirationDate: string;
  daysRemaining: number;
  workerFirstName: string;
  workerLastName: string;
  workerEmail: string;
  companyResendApiKey: string | null;
  companyDigestFromEmail: string | null;
}

export async function getExpiringSoonCredentials(
  dayMin: number,
  dayMax: number,
): Promise<ExpiringCredential[]> {
  const today = new Date();
  const minDate = new Date(today.getTime() + dayMin * 86400000).toISOString().split("T")[0]!;
  const maxDate = new Date(today.getTime() + dayMax * 86400000).toISOString().split("T")[0]!;
  const todayStr = today.toISOString().split("T")[0]!;

  const rows = await db
    .select({
      credentialId: workerCredentialsTable.id,
      companyId: workerCredentialsTable.companyId,
      userId: workerCredentialsTable.userId,
      credentialType: workerCredentialsTable.credentialType,
      expirationDate: workerCredentialsTable.expirationDate,
      workerFirstName: usersTable.firstName,
      workerLastName: usersTable.lastName,
      workerEmail: usersTable.email,
      companyResendApiKey: companiesTable.resendApiKey,
      companyDigestFromEmail: companiesTable.digestFromEmail,
    })
    .from(workerCredentialsTable)
    .innerJoin(usersTable, eq(workerCredentialsTable.userId, usersTable.id))
    .innerJoin(companiesTable, eq(workerCredentialsTable.companyId, companiesTable.id))
    .where(
      and(
        sql`${workerCredentialsTable.status} = 'active'`,
        sql`${workerCredentialsTable.expirationDate} >= ${minDate}`,
        sql`${workerCredentialsTable.expirationDate} <= ${maxDate}`,
      ),
    );

  return rows.map((r) => {
    const expiry = new Date(r.expirationDate as string);
    const todayD = new Date(todayStr);
    const daysRemaining = Math.ceil((expiry.getTime() - todayD.getTime()) / 86400000);
    return {
      credentialId: r.credentialId,
      companyId: r.companyId,
      userId: r.userId,
      credentialType: r.credentialType,
      expirationDate: r.expirationDate as string,
      daysRemaining,
      workerFirstName: r.workerFirstName,
      workerLastName: r.workerLastName,
      workerEmail: r.workerEmail,
      companyResendApiKey: r.companyResendApiKey,
      companyDigestFromEmail: r.companyDigestFromEmail,
    };
  });
}

export async function getCompanyExpiringSoonCredentials(
  companyId: number,
  maxDays = 65,
): Promise<Array<ExpiringCredential & { alertWindow: "30_day" | "60_day" | "expired" | "ok" }>> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]!;
  const maxDate = new Date(today.getTime() + maxDays * 86400000).toISOString().split("T")[0]!;

  const rows = await db
    .select({
      credentialId: workerCredentialsTable.id,
      companyId: workerCredentialsTable.companyId,
      userId: workerCredentialsTable.userId,
      credentialType: workerCredentialsTable.credentialType,
      expirationDate: workerCredentialsTable.expirationDate,
      workerFirstName: usersTable.firstName,
      workerLastName: usersTable.lastName,
      workerEmail: usersTable.email,
      companyResendApiKey: companiesTable.resendApiKey,
      companyDigestFromEmail: companiesTable.digestFromEmail,
    })
    .from(workerCredentialsTable)
    .innerJoin(usersTable, eq(workerCredentialsTable.userId, usersTable.id))
    .innerJoin(companiesTable, eq(workerCredentialsTable.companyId, companiesTable.id))
    .where(
      and(
        eq(workerCredentialsTable.companyId, companyId),
        sql`${workerCredentialsTable.status} IN ('active', 'expired')`,
        sql`${workerCredentialsTable.expirationDate} IS NOT NULL`,
        sql`${workerCredentialsTable.expirationDate} <= ${maxDate}`,
      ),
    )
    .orderBy(asc(workerCredentialsTable.expirationDate));

  return rows.map((r) => {
    const expiry = new Date(r.expirationDate as string);
    const daysRemaining = Math.ceil((expiry.getTime() - new Date(todayStr).getTime()) / 86400000);
    let alertWindow: "30_day" | "60_day" | "expired" | "ok";
    if (daysRemaining < 0) alertWindow = "expired";
    else if (daysRemaining <= 30) alertWindow = "30_day";
    else if (daysRemaining <= 60) alertWindow = "60_day";
    else alertWindow = "ok";

    return {
      credentialId: r.credentialId,
      companyId: r.companyId,
      userId: r.userId,
      credentialType: r.credentialType,
      expirationDate: r.expirationDate as string,
      daysRemaining,
      alertWindow,
      workerFirstName: r.workerFirstName,
      workerLastName: r.workerLastName,
      workerEmail: r.workerEmail,
      companyResendApiKey: r.companyResendApiKey,
      companyDigestFromEmail: r.companyDigestFromEmail,
    };
  });
}

export async function getCompanySafetyManagerEmails(companyId: number): Promise<string[]> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(userMembershipsTable)
    .innerJoin(usersTable, eq(userMembershipsTable.userId, usersTable.id))
    .where(
      and(
        eq(userMembershipsTable.companyId, companyId),
        sql`${userMembershipsTable.role} IN ('owner', 'foreman')`,
      ),
    );
  return rows.map((r) => r.email).filter(Boolean);
}

export async function hasCredentialAlertBeenSent(opts: {
  companyId: number;
  userId: number;
  credentialType: string;
  alertType: string;
  sentForExpiry: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: credentialAlertLogsTable.id })
    .from(credentialAlertLogsTable)
    .where(
      and(
        eq(credentialAlertLogsTable.companyId, opts.companyId),
        eq(credentialAlertLogsTable.userId, opts.userId),
        eq(credentialAlertLogsTable.credentialType, opts.credentialType),
        eq(credentialAlertLogsTable.alertType, opts.alertType),
        eq(credentialAlertLogsTable.sentForExpiry, opts.sentForExpiry),
      ),
    )
    .limit(1);
  return !!row;
}

export async function recordCredentialAlert(opts: {
  companyId: number;
  userId: number;
  credentialType: string;
  alertType: string;
  sentForExpiry: string;
  sentToEmail: string;
}): Promise<void> {
  await db
    .insert(credentialAlertLogsTable)
    .values(opts)
    .onConflictDoNothing();
}
