// Phase 0 Migration: Copy existing user-company-role data into user_memberships
// and backfill active_company_id from company_id.
// Safe to run multiple times (idempotent).
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL must be set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log("[1/4] Creating user_memberships table if not exists...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_memberships (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      role user_role NOT NULL DEFAULT 'worker',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      PRIMARY KEY (user_id, company_id)
    );
  `);

  console.log("[2/4] Adding active_company_id to users if not exists...");
  await db.execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active_company_id') THEN
        ALTER TABLE users ADD COLUMN active_company_id INTEGER REFERENCES companies(id);
      END IF;
    END $$;
  `);

  console.log("[3/4] Migrating existing user-company pairs into user_memberships...");
  const { rows: inserted } = await db.execute<{ count: number }>(`
    INSERT INTO user_memberships (user_id, company_id, role, is_active)
    SELECT id, company_id, role, true
    FROM users
    WHERE company_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships um WHERE um.user_id = users.id
      )
    ON CONFLICT (user_id, company_id) DO NOTHING;
  `);
  console.log(`    → Inserted ${inserted?.length ?? 0} membership rows.`);

  console.log("[4/4] Backfilling active_company_id from company_id...");
  await db.execute(`
    UPDATE users
    SET active_company_id = company_id
    WHERE active_company_id IS NULL AND company_id IS NOT NULL;
  `);

  // Verify
  const { rows: userCount } = await db.execute<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users WHERE company_id IS NOT NULL;`);
  const { rows: memCount } = await db.execute<{ count: number }>(`SELECT COUNT(*)::int AS count FROM user_memberships;`);
  const { rows: activeCount } = await db.execute<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users WHERE active_company_id IS NOT NULL;`);

  console.log("\n✅ Verification:");
  console.log(`    Users with company_id:     ${userCount?.[0]?.count ?? "?"}`);
  console.log(`    user_memberships rows:       ${memCount?.[0]?.count ?? "?"}`);
  console.log(`    Users with active_company:   ${activeCount?.[0]?.count ?? "?"}`);

  await pool.end();
  console.log("\nMigration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
