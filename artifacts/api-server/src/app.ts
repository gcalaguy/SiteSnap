import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
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
  max: 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down", code: "RATE_LIMITED" },
  skip: (req) =>
    isDev ||
    req.path === "/api/healthz" ||
    req.path.startsWith("/api/stripe/webhook"),
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded — wait a moment", code: "RATE_LIMITED" },
});

app.use(globalLimiter);
app.use("/api/ai", aiLimiter);

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
if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:3000");
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
// /api/ai/transcribe accepts base64-encoded audio recordings
app.use("/api/ai/transcribe", express.json({ limit: "20mb" }));
// /api/ai/photo-summary accepts base64-encoded images
app.use("/api/ai/photo-summary", express.json({ limit: "50mb" }));
// Invoice send-email embeds a base64 PDF attachment (up to ~11 MB binary → ~15 M base64 chars)
app.use("/api/invoices/:id/send-email", express.json({ limit: "20mb" }));

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

app.use("/api", router);

// ── Global error handler — must be last ─────────────────────────────────────
// Catches any error thrown or passed to next() from routes/middlewares above.
app.use(errorHandler);

// Force refresh: feature-gate compiler aligned — workspace backend memory hot-reload
export default app;
