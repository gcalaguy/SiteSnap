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
// Global: 200 req / 15 min per IP.  Tighter limits on write-heavy & AI routes.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down", code: "RATE_LIMITED" },
  skip: (req) =>
    req.path === "/api/healthz" || req.path.startsWith("/api/stripe/webhook"),
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
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

app.use(cors({ credentials: true, origin: true }));
app.use("/api/ai/transcribe", express.json({ limit: "20mb" }));
app.use("/api/invoices", express.json({ limit: "10mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

export default app;
