const fs = require('fs');
const path = require('path');

// Target the exact file paths directly relative to your project layout
const schemaPath = './lib/db/src/schema/index.ts';
const limiterPath = './artifacts/api-server/src/lib/rateLimiter.ts';

if (!fs.existsSync(limiterPath)) {
  console.error("❌ Still could not find rateLimiter.ts. Let's make sure it exists.");
  process.exit(1);
}

// 1. Update Schema
if (fs.existsSync(schemaPath)) {
  let schemaContent = fs.readFileSync(schemaPath, 'utf8');
  if (!schemaContent.includes('aiRateLimits')) {
    const tableSchema = `

// Persistent AI Rate Limiting Schema Tracker
export const aiRateLimitsTable = pgTable("ai_rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  dateKey: text("date_key").notNull(), 
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

// 2. Overwrite Limiter with persistent logic
const persistentLimiterCode = `import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { aiRateLimitsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

const DAILY_AI_LIMIT = 15;

export async function aiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const companyId = req.companyId;
  
  if (!companyId) {
    return res.status(401).json({ error: "Unauthorized: Missing company association" });
  }

  try {
    const todayStr = new Date().toISOString().split("T")[0];

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
    next();
  }
}
`;

fs.writeFileSync(limiterPath, persistentLimiterCode, 'utf8');
console.log("✅ Successfully swapped out in-memory Maps for a persistent Database storage layer!");
