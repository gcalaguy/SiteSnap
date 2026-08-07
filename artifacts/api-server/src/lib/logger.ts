import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "req.body.password",
    "req.body.currentPassword",
    "req.body.newPassword",
    "req.body.token",
    "req.body.secret",
    "req.body.apiKey",
    "*.password",
    "*.passwordHash",
    "*.token",
    "*.secret",
    "*.apiKey",
    "*.ssn",
    "*.creditCard",
    "*.cardNumber",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

/**
 * Warn (and, past a threshold, escalate to error) when a batch job's error
 * count is high relative to the total items it processed. `total` should be
 * the sum of every outcome the job tracks (successes + skips + errors) —
 * exclude raw input-population counts (e.g. "scanned") that aren't 1:1 with
 * an outcome, since those would dilute the rate.
 */
export function alertOnHighErrorRate(
  jobName: string,
  metrics: Record<string, number>,
  errors: number,
  total: number,
): void {
  if (errors === 0 || total === 0) return;

  const errorRate = (errors / total) * 100;
  logger.warn({ ...metrics, errorRate: errorRate.toFixed(1) }, `${jobName} completed with errors`);

  if (errorRate > 10) {
    logger.error(
      { ...metrics, errorRate: errorRate.toFixed(1), threshold: 10 },
      `CRITICAL: ${jobName} error rate exceeded threshold — manual intervention required`,
    );
    // TODO: Send PagerDuty/Slack alert here if alerting is configured
  }
}
