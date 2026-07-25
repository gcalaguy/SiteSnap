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

const DB_UNAVAILABLE_NODE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
]);

const DB_UNAVAILABLE_PG_CODES = new Set([
  "57P03", // cannot_connect_now (PostgreSQL starting up)
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
]);

const DB_UNAVAILABLE_MSG_PATTERNS = [
  /timeout exceeded/i,
  /connection timeout/i,
  /connection terminated/i,
  /pool.*timeout/i,
  /acquire.*timeout/i,
  /client.*checkout.*timed out/i,
  /remaining connection slots are reserved/i,
  /too many clients/i,
];

function isDbUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as any;

  if (e.code && DB_UNAVAILABLE_NODE_CODES.has(e.code)) return true;
  if (e.code && DB_UNAVAILABLE_PG_CODES.has(e.code)) return true;
  if (DB_UNAVAILABLE_MSG_PATTERNS.some((re) => re.test(e.message))) return true;

  // pg errors can be nested under a `cause` chain
  if (e.cause) return isDbUnavailableError(e.cause);

  return false;
}

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

  // DB pool exhaustion / connectivity — return 503 so clients know to retry
  if (isDbUnavailableError(err)) {
    logger.error({ err, reqId: req.id ?? "no-request-id" }, "DB pool unavailable — returning 503");
    res.setHeader("Retry-After", "2");
    res.status(503).json({
      error: "Service temporarily unavailable — please retry shortly",
      code: "SERVICE_UNAVAILABLE",
    });
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
