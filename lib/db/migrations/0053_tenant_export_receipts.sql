-- Tenant export receipts — server-side proof that a super-admin exported a
-- tenant's data before deleting it. DELETE /admin/tenants/:id now requires a
-- matching, unconsumed, unexpired row here for the same company_id (see
-- services/tenantExport.ts); this is the same opaque-token-in-Postgres
-- pattern already used by the `invitations` table.
CREATE TABLE IF NOT EXISTS tenant_export_receipts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  row_counts JSONB NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenant_export_receipts_company_id ON tenant_export_receipts (company_id);
