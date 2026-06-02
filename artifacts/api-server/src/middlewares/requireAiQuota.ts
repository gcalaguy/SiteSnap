import { Request, Response, NextFunction } from "express";
import { aiRateLimiter } from "../lib/aiRateLimiter";

/**
 * SEC-005: AI Quota Middleware Hook
 * Routes execution to the atomic, database-persistent rate limiter.
 */
export const requireAiQuota = async (req: Request, res: Response, next: NextFunction) => {
  return aiRateLimiter(req, res, next);
};
