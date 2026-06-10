import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Use relative paths — drizzle-kit resolves them relative to the config file
// location (lib/db/). Absolute paths (via path.join(__dirname, ...)) trigger a
// double-slash bug in drizzle-kit ≥0.30 where it prepends "./" to the already-
// absolute path, producing ".//absolute/path" and failing to open snapshots.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
