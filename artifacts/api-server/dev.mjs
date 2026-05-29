import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { context as esbuildContext } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "dist");

let serverProcess = null;
let restartTimer = null;

function killServer() {
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
    } catch (_) {}
    serverProcess = null;
  }
}

function startServer() {
  killServer();
  console.log("[dev] Starting server...");
  serverProcess = spawn("node", ["--enable-source-maps", "./dist/index.mjs"], {
    stdio: "inherit",
    cwd: artifactDir,
    env: { ...process.env, NODE_ENV: "development" },
  });
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (code !== null && code !== 0 && code !== 130 && code !== 143) {
      console.log(`[dev] Server crashed (exit ${code}). Waiting for file changes to rebuild...`);
    }
  });
}

function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startServer();
  }, 200);
}

const restartPlugin = {
  name: "restart-on-build",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        console.log("[dev] Build succeeded — restarting server...");
        scheduleRestart();
      } else {
        console.log("[dev] Build failed — server not restarted.");
      }
    });
  },
};

async function main() {
  console.log("[dev] Cleaning dist and starting esbuild watch...");
  await rm(distDir, { recursive: true, force: true });

  const ctx = await esbuildContext({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node",
      "stripe",
      "stripe-replit-sync",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "pg",
      "pdf-parse",
      "pdfkit",
      "fontkit",
      "restructure",
      "unicode-properties",
      "linebreak",
      "grapheme-break",
      "tiny-inflate",
      "@clerk/backend",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      esbuildPluginPino({ transports: ["pino-pretty"] }),
      restartPlugin,
    ],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  await ctx.watch();
  console.log("[dev] Watching src/ for changes — edit any file to trigger a rebuild.");

  function shutdown() {
    console.log("[dev] Shutting down...");
    ctx.dispose();
    killServer();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
