import { Request, Response, NextFunction } from "express";
import { checkAiQuota, recordAiCall, remainingAiCalls, DAILY_LIMIT } from "../lib/aiRateLimiter.js";

/**
 * Express middleware that enforces per-company (or per-user) AI rate limits.
 *
 * Place this after requireAuth (and optionally requireCompany) in the middleware chain.
 * Uses req.companyId when available, otherwise falls back to req.userId.
 *
 * Returns 429 with a clear JSON error when either the daily or per-minute limit is exceeded.
 */
export async function requireAiQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.companyId != null ? `c:${req.companyId}` : req.userId != null ? `u:${req.userId}` : null;

  if (!key) {
    next();
    return;
  }

  const result = await checkAiQuota(key);

  if (!result.allowed) {
    if (result.reason === "minute") {
      res.status(429).json({
        error: "AI rate limit exceeded",
        code: "AI_RATE_LIMIT_PER_MINUTE",
        message: `Too many AI requests. Please wait a moment before trying again.`,
        retryAfterSeconds: 60,
      });
    } else {
      res.status(429).json({
        error: "AI rate limit exceeded",
        code: "AI_RATE_LIMIT_DAILY",
        message: `Your company has reached its daily AI request limit (${DAILY_LIMIT} requests/day). Limit resets at midnight.`,
        remaining: 0,
        retryAfterSeconds: null,
      });
    }
    return;
  }

  await recordAiCall(key);
  res.setHeader("X-AI-Requests-Remaining", remainingAiCalls(key));
  next();
}
