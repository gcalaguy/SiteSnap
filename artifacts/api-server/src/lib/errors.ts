/**
 * Typed application error hierarchy.
 *
 * Usage in route handlers:
 *   throw new NotFoundError("Project not found");
 *   throw new ValidationError("budget must be a positive number");
 *   throw new ForbiddenError();
 *
 * The global `errorHandler` middleware converts these into consistent JSON
 * responses:  { error: string, code?: string, details?: unknown }
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, message, "VALIDATION_ERROR", details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, message, "CONFLICT", details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests — please slow down") {
    super(429, message, "RATE_LIMITED");
  }
}
