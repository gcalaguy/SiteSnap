import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler so that any thrown error (including
 * AppError subclasses) is automatically forwarded to the next() error chain
 * rather than causing an unhandled promise rejection.
 *
 * Before:
 *   router.get("/foo", async (req, res) => {
 *     try { ... } catch (err) { res.status(500).json({ error: "..." }); }
 *   });
 *
 * After:
 *   router.get("/foo", asyncHandler(async (req, res) => {
 *     // throw AppError subclasses freely — the global handler takes care of it
 *     const data = await someDbCall();
 *     res.json(data);
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
