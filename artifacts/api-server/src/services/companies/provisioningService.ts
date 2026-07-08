import { logger } from "../../lib/logger";
import {
  insertCompany,
  insertOwnerMembership,
  setUserActiveCompany,
  getCompanyById,
  getCompanyIdByClaimToken,
  hasAnyMembership,
  getPlanBySlug,
  claimCompanyTransaction,
  getUserById,
} from "../../repositories/companies";

export async function createCompany(
  userId: number,
  data: Record<string, unknown>,
  referralCode: string,
  referredByCode: string | null,
) {
  const company = await insertCompany({ ...data, referralCode, referredByCode } as any);

  // Assign requester as owner: write to memberships only (Phase 4)
  await insertOwnerMembership(userId, company.id);
  await setUserActiveCompany(userId, company.id);

  return company;
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
    logger.error({ err, companyId }, "Failed to claim company");
    return { ok: false, status: 500, error: "Failed to claim company. Please try again." };
  }
}

