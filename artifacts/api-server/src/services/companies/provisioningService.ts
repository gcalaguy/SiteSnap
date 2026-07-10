import { logger } from "../../lib/logger";
import {
  getCompanyById,
  getCompanyIdByClaimToken,
  hasAnyMembership,
  getPlanBySlug,
  claimCompanyTransaction,
  getUserById,
  findOwnedCompanyByUser,
  createCompanyTransaction,
} from "../../repositories/companies";

const PG_UNIQUE_VIOLATION = "23505";

// Idempotent self-serve company provisioning. A user owns at most one company,
// so repeated calls (double-submit, transport-level POST retry after a slow
// first request, two tabs) must not create duplicate tenants:
//   1. If the caller already owns a company, return it — no insert.
//   2. Otherwise create it transactionally. If a concurrent request wins the
//      race, the owner-membership unique index throws 23505, the stray company
//      insert rolls back, and we return the company that actually won.
export async function createCompany(
  userId: number,
  data: Record<string, unknown>,
  referralCode: string,
  referredByCode: string | null,
) {
  const existing = await findOwnedCompanyByUser(userId);
  if (existing) return existing;

  try {
    return await createCompanyTransaction(userId, { ...data, referralCode, referredByCode } as any);
  } catch (err) {
    if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
      const winner = await findOwnedCompanyByUser(userId);
      if (winner) return winner;
    }
    throw err;
  }
}

export async function resolveClaimInviteToken(token: string): Promise<number | null> {
  return getCompanyIdByClaimToken(token);
}

/** Masks an email for display in error messages, e.g. "o***e@example.com". */
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const masked = user.length <= 2 ? `${user[0]}*` : `${user[0]}${"*".repeat(user.length - 2)}${user[user.length - 1]}`;
  return `${masked}@${domain}`;
}

export type ClaimCompanyResult =
  | { ok: true; company: Awaited<ReturnType<typeof getCompanyById>>; user: Awaited<ReturnType<typeof getUserById>> }
  | { ok: false; status: number; error: string };

export async function claimCompany(opts: {
  companyId: number;
  requestingUserId: number;
  suppliedToken: string;
  companyName: string | null;
  province: string | null;
  city: string | null;
  phone: string | null;
  planTier: string;
}): Promise<ClaimCompanyResult> {
  const { companyId, requestingUserId, suppliedToken, companyName, province, city, phone, planTier } = opts;

  const company = await getCompanyById(companyId);
  if (!company) {
    // Return 403 (not 404) to avoid leaking which IDs exist
    return { ok: false, status: 403, error: "Invalid company ID or claim token" };
  }

  // Verify the token. Companies without a claimToken cannot be claimed here.
  if (!company.claimToken || company.claimToken !== suppliedToken) {
    return { ok: false, status: 403, error: "Invalid company ID or claim token" };
  }

  // Verify the caller's own email matches the address the claim token was issued
  // to (P0 security fix — mirrors the invite-accept check in routes/invitations.ts).
  // Without this, anyone who obtains the claim link (forwarded email, leaked URL,
  // browser history) could claim the company as owner regardless of identity.
  if (company.claimOwnerEmail) {
    const caller = await getUserById(requestingUserId);
    if (!caller) {
      return { ok: false, status: 403, error: "Invalid company ID or claim token" };
    }
    if (caller.email.toLowerCase().trim() !== company.claimOwnerEmail.toLowerCase().trim()) {
      // Safe to name the invited address here — the caller already holds a valid
      // token for this company, so this doesn't leak anything they don't already
      // have access to. It's the single most common failure mode in practice:
      // someone opens the invite link while still signed in as a different
      // account (e.g. the super-admin who generated the link).
      return {
        ok: false,
        status: 403,
        error: `This invite was sent to ${maskEmail(company.claimOwnerEmail)}. You're signed in as ${maskEmail(caller.email)} — sign out and sign in with the invited email to continue.`,
      };
    }
  }

  // Verify no user is already owner via memberships
  if (await hasAnyMembership(companyId)) {
    return { ok: false, status: 409, error: "Company already claimed" };
  }

  // A user may own at most one company (see uniq_owner_membership_per_user).
  // Without this check, someone who already owns a company but still holds an
  // unused claim link (e.g. a stray invite) could claim a second one.
  const alreadyOwned = await findOwnedCompanyByUser(requestingUserId);
  if (alreadyOwned) {
    return { ok: false, status: 409, error: `You already own a company ("${alreadyOwned.name}"). Each account can own only one company.` };
  }

  // Resolve plan outside the transaction (read-only; no risk of partial state)
  const matchedPlan = await getPlanBySlug(planTier);
  const fallbackPlan = matchedPlan ?? (await getPlanBySlug("starter"));

  try {
    const { updatedUser, updatedCompany } = await claimCompanyTransaction({
      companyId,
      userId: requestingUserId,
      companyName,
      province,
      city,
      phone,
      planId: fallbackPlan?.id ?? null,
    });
    return { ok: true, company: updatedCompany, user: updatedUser };
  } catch (err) {
    // Concurrent claim by the same user on two tabs races past the check
    // above — the DB constraint is the final backstop, so surface it clearly
    // instead of a generic 500.
    if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, status: 409, error: "You already own a company. Each account can own only one company." };
    }
    logger.error({ err, companyId }, "Failed to claim company");
    return { ok: false, status: 500, error: "Failed to claim company. Please try again." };
  }
}

