import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { PgRateLimitStore } from "./lib/pgRateLimitStore";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { errorHandler } from "./middlewares/errorHandler";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";

const app: Express = express();

// Trust the Replit reverse proxy so express-rate-limit can read the real client IP
app.set("trust proxy", 1);

// ── Security headers ─────────────────────────────────────────────────────────
// helmet sets X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
// Content-Security-Policy, etc.  Disabled for local dev if needed via env flag.
app.use(
  helmet({
    // Allow Clerk-embedded iframes in the same origin
    frameguard: { action: "sameorigin" },
    // Allow inline scripts needed by Vite HMR + Clerk in dev
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? undefined
        : false,
  }),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In dev, all requests share the same Replit proxy IP so IP-based limiting is
// not meaningful and will fire erroneously.  Only enable in production.
const isDev = process.env.NODE_ENV !== "production";

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // In dev, use a very high cap so the limiter is active (bugs surface locally)
  // but developers are never accidentally blocked. In prod, enforce 500/15min.
  max: isDev ? 5_000 : 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down", code: "RATE_LIMITED" },
  skip: (req) =>
    req.path === "/api/healthz" ||
    req.path.startsWith("/api/stripe/webhook"),
  // Shared across every load-balanced instance via Postgres — see pgRateLimitStore.
  store: new PgRateLimitStore("global"),
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded — wait a moment", code: "RATE_LIMITED" },
  store: new PgRateLimitStore("ai"),
});

// B4 fix: dedicated upload rate limiter — 30 uploads per 10 minutes per IP.
// The global limiter (500 req/15min) is too loose for uploads which cost real
// storage and compute. This prevents cost amplification from abusive clients.
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isDev ? 10000 : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Upload rate limit exceeded — please wait before uploading again", code: "RATE_LIMITED" },
  store: new PgRateLimitStore("upload"),
});

app.use(globalLimiter);
app.use("/api/ai", aiLimiter);
app.use("/api/v1/ai", aiLimiter);
app.use("/api/storage/uploads", uploadLimiter);

// ── Request logging ────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ── Stripe webhook — MUST be before express.json() ──────────────────────────
// Stripe requires the raw Buffer body for signature verification.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => `https://${d.trim()}`)
  : [];
// Support Railway / custom domain deployments where REPLIT_DOMAINS is not set
if (process.env.APP_BASE_URL) {
  const appOrigin = process.env.APP_BASE_URL.replace(/\/$/, "");
  if (!ALLOWED_ORIGINS.includes(appOrigin)) ALLOWED_ORIGINS.push(appOrigin);
}
if (process.env.NODE_ENV !== "production") {
  const devOrigins = process.env.CORS_DEV_ORIGINS
    ? process.env.CORS_DEV_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:3000"];
  ALLOWED_ORIGINS.push(...devOrigins);
}

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  }),
);
// Per-route body-size overrides (must come BEFORE the global limit below)
// Duplicated for both /api (legacy) and /api/v1 (versioned) prefixes.
// /api/ai/transcribe accepts base64-encoded audio recordings
app.use("/api/ai/transcribe", express.json({ limit: "20mb" }));
app.use("/api/v1/ai/transcribe", express.json({ limit: "20mb" }));
// /api/ai/photo-summary accepts base64-encoded images
app.use("/api/ai/photo-summary", express.json({ limit: "50mb" }));
app.use("/api/v1/ai/photo-summary", express.json({ limit: "50mb" }));
// Invoice send-email: PDF is generated server-side; pdfBase64 is accepted for back-compat but
// ignored (capped at 1 char in the Zod schema). 5 MB is ample for all other fields.
app.use("/api/invoices/:id/send-email", express.json({ limit: "5mb" }));
app.use("/api/v1/invoices/:id/send-email", express.json({ limit: "5mb" }));

// Global body-size limit — protects all other routes from oversized payloads.
// Routes that legitimately need more space have a per-route override above.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Resolve publishable key from host (supports custom domains)
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
    secretKey: process.env.CLERK_SECRET_KEY,
  })),
);

// Mount at /api/v1 (versioned) and /api (legacy backward-compatible alias).
// New clients should use /api/v1; existing clients on /api continue to work.
app.use("/api/v1", router);
// Legacy /api mount — set a deprecation header so API consumers can migrate.
// WAF/rate-limit rules on /api/v1 do NOT cover this path, so it should be
// removed once all clients have migrated to /api/v1.
app.use("/api", (_req, res, next) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</api/v1>; rel="successor-version"');
  next();
}, router);

// ── Global error handler — must be last ─────────────────────────────────────
// Catches any error thrown or passed to next() from routes/middlewares above.
app.use(errorHandler);

// Force refresh: cache-bust pulse — workspace backend memory hot-reload v2
export default app;
