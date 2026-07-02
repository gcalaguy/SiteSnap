import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Global Express error-handling middleware.
 *
 * Must be registered LAST in app.ts after all routes:
 *   app.use(errorHandler);
 *
 * Produces a consistent JSON error envelope:
 *   { error: string, code?: string, details?: unknown }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // express.json() / body-parser SyntaxError — malformed JSON in request body
  if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as any).status === 400 &&
    "body" in err
  ) {
    logger.warn({ reqId: req.id ?? "no-request-id" }, "Malformed JSON in request body");
    res.status(400).json({ error: "Invalid JSON in request body", code: "BAD_REQUEST" });
    return;
  }

  // Known application error — safe to surface the message
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, reqId: req.id ?? "no-request-id" }, "Application error");
    } else {
      logger.warn({ err, reqId: req.id ?? "no-request-id" }, "Client error");
    }

    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Zod / drizzle-zod validation errors bubble up as plain objects
  if (
    typeof err === "object" &&
    err !== null &&
    "issues" in err
  ) {
    logger.warn({ issues: (err as any).issues, reqId: req.id ?? "no-request-id" }, "Unhandled Zod validation error");
    res.status(422).json({ error: "Validation failed", code: "VALIDATION_ERROR", details: (err as any).issues });
    return;
  }

  // Unexpected error — don't leak internals in production
  logger.error({ err, reqId: req.id ?? "no-request-id" }, "Unhandled server error");
  const message =
    process.env.NODE_ENV !== "production" && err instanceof Error
      ? err.message
      : "An unexpected error occurred";

  res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
}
