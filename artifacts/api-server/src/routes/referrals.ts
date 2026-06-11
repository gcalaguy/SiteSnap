import { Router } from "express";
import { eq, count } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

// GET /api/referrals — get my company's referral code + referred count
router.get("/referrals", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, req.companyId!))
    .limit(1);

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  // Count companies that used this referral code
  const [{ value: referralCount }] = await db
    .select({ value: count() })
    .from(companiesTable)
    .where(eq(companiesTable.referredByCode, company.referralCode!));

  const domain =
    process.env.APP_BASE_URL ??
    `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  const referralLink = company.referralCode
    ? `${domain}/onboarding?ref=${company.referralCode}`
    : null;

  res.json({
    referralCode: company.referralCode,
    referralLink,
    referralCount: Number(referralCount),
  });
}))

// GET /api/referrals/validate/:code — public: verify a referral code is valid
router.get("/referrals/validate/:code", asyncHandler(async (req, res) => {
  const { code } = req.params;
  const [company] = await db
    .select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.referralCode, code as string))
    .limit(1);

  if (!company) {
    res.status(404).json({ valid: false });
    return;
  }

  res.json({ valid: true, referredByCompany: company.name });
}))

export default router;
