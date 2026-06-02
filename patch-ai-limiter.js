const fs = require('fs');
const path = require('path');

// 1. Define paths
const schemaPath = path.join(process.cwd(), 'lib/db/src/schema/index.ts');
const limiterPath = path.join(process.cwd(), 'artifacts/api-server/src/lib/rateLimiter.ts');

if (!fs.existsSync(limiterPath)) {
  console.error("❌ Could not find rateLimiter.ts. Ensure you are running this from the workspace root.");
  process.exit(1);
}

// 2. Add the tracking table to your Drizzle schema if it doesn't exist
if (fs.existsSync(schemaPath)) {
  let schemaContent = fs.readFileSync(schemaPath, 'utf8');
  if (!schemaContent.includes('aiRateLimits')) {
    const tableSchema = `

// Persistent AI Rate Limiting Schema Tracker
export const aiRateLimitsTable = pgTable("ai_rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  dateKey: text("date_key").notNull(), // Format: YYYY-MM-DD
  count: integer("count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  companyDateIdx: uniqueIndex("company_date_idx").on(table.companyId, table.dateKey),
}));
`;
    fs.appendFileSync(schemaPath, tableSchema, 'utf8');
    console.log("✅ Added aiRateLimitsTable schema tracking matrix.");
  }
}

// 3. Completely rewrite rateLimiter.ts to utilize persistent database increment queries
const persistentLimiterCode = `import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { aiRateLimitsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const DAILY_AI_LIMIT = 15;

export async function aiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const companyId = req.companyId;
  
  if (!companyId) {
    return res.status(401).json({ error: "Unauthorized: Missing company association" });
  }

  try {
    const todayStr = new Date().toISOString().split("T")[0];

    // Atomically insert a new tracker row or increment the existing one cleanly
    const [record] = await db
      .insert(aiRateLimitsTable)
      .values({ companyId, dateKey: todayStr, count: 1 })
      .onConflictDoUpdate({
        target: [aiRateLimitsTable.companyId, aiRateLimitsTable.dateKey],
        set: { count: sql\`\${aiRateLimitsTable.count} + 1\`, updatedAt: new Date() }
      })
      .returning();

    if (record.count > DAILY_AI_LIMIT) {
      return res.status(429).json({
        error: "Daily AI rate limit quota exceeded",
        limit: DAILY_AI_LIMIT,
        current: record.count
      });
    }

    next();
  } catch (error) {
    console.error("AI Rate Limiter Error:", error);
    // Fail-open execution state safely to prevent full application locking during telemetry hiccups
    next();
  }
}
`;

// Inject sql module helper import into the text structure safely if required
let finalCode = persistentLimiterCode;
if (!finalCode.includes('import { sql }')) {
  finalCode = finalCode.replace('import { and, eq }', 'import { and, eq, sql }');
}

fs.writeFileSync(limiterPath, finalCode, 'utf8');
console.log("✅ Successfully swapped out in-memory Maps for a persistent Database storage layer!");
