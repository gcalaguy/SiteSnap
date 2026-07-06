-- PHASE 5: Hardened Tenant Isolation — extend RLS to all remaining tenant-scoped
-- tables, and switch ENABLE -> FORCE so the table owner role can no longer bypass
-- policies (closing the migration/superuser-connection loophole).
--
-- SCOPE: 73 tables classified as tenant-scoped (51 direct company_id, 2 with a
-- global-default/tenant-override nullable company_id, 20 indirect via a parent
-- FK). Excluded on purpose: global catalogs (users, plans, features, companies
-- itself), and cross-tenant-by-design tables (tradehub_* marketplace/social
-- tables, trade_reviews, notifications — all scoped by user_id, not company_id).
--
-- STILL PERMISSIVE: every policy below keeps the `current_tenant_id() IS NULL`
-- escape hatch from migration 0046 — this is NOT the final lockdown. Fallback
-- removal happens in a later migration, gated on Phase 0 test vectors passing.
--
-- KNOWN CAVEAT — user_memberships & subscriptions:
--   Both are queried inside requireAuth() (see api-server/src/lib/auth.ts)
--   BEFORE requireTenantCtx ever runs, because reading user_memberships is how
--   req.companyId gets resolved in the first place, and the subscription
--   auto-provision check runs off the back of that same resolution. At that
--   point in the request lifecycle NO tenant context is set yet. These two
--   tables must keep the IS NULL fallback indefinitely (or requireAuth needs to
--   be restructured to run its own bootstrap query outside RLS, e.g. via a
--   SECURITY DEFINER function) — do NOT include them in the future
--   fallback-removal migration without fixing this first.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS integer AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::integer;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Standard direct company_id policies (51 tables) ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_compliance_directives' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON ai_compliance_directives
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'asset_schedules' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON asset_schedules
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON audit_logs
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'builder_estimates' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON builder_estimates
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'capa_tickets' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON capa_tickets
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'change_orders' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON change_orders
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON contacts
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON conversations
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cor_audit_log_entries' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON cor_audit_log_entries
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cor_audit_packages' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON cor_audit_packages
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cor_audit_trail' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON cor_audit_trail
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cor_voice_action_logs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON cor_voice_action_logs
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credential_alert_logs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON credential_alert_logs
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_reports' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON daily_reports
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_chunks' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON document_chunks
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON equipment
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimates' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON estimates
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimate_templates' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON estimate_templates
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimator_actuals' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON estimator_actuals
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON expenses
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_auditor_tokens' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON external_auditor_tokens
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'file_attachments' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON file_attachments
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'form_submissions' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON form_submissions
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inspection_alerts' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON inspection_alerts
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inspections' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON inspections
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_assets' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON inventory_assets
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_materials' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON inventory_materials
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invitations' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON invitations
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_postings' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON job_postings
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON leads
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON payments
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'permits' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON permits
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'policy_documents' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON policy_documents
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'policy_signoffs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON policy_signoffs
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_members' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON project_members
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_notes' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON project_notes
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proposals' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON proposals
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_tokens' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON provider_tokens
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quickbooks_connections' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON quickbooks_connections
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rfis' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON rfis
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scans' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON scans
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedule_events' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON schedule_events
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subcontractor_docs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON subcontractor_docs
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subcontractors' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON subcontractors
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON subscriptions
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON time_entries
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tool_checkouts' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON tool_checkouts
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_memberships' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON user_memberships
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_credentials' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON worker_credentials
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_documents' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON worker_documents
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'worker_schedules' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON worker_schedules
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

END
$$;

-- ── Global-default + tenant-override policies (2 tables) ────────────────────
-- company_id IS NULL means a system-wide default row, visible to every tenant;
-- company_id set means a company-specific override, visible only to that tenant.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimator_cost_models' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON estimator_cost_models
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id IS NULL OR company_id = current_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimator_addons' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON estimator_addons
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id IS NULL OR company_id = current_tenant_id());
  END IF;

END
$$;

-- ── ENABLE + FORCE on all newly-gated tables (73) ────────────────────────────
ALTER TABLE ai_compliance_directives               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_compliance_directives               FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_schedules                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_schedules                        FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                             FORCE ROW LEVEL SECURITY;
ALTER TABLE builder_estimates                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_estimates                      FORCE ROW LEVEL SECURITY;
ALTER TABLE capa_tickets                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE capa_tickets                           FORCE ROW LEVEL SECURITY;
ALTER TABLE change_orders                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders                          FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts                               FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations                          FORCE ROW LEVEL SECURITY;
ALTER TABLE cor_audit_log_entries                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_audit_log_entries                  FORCE ROW LEVEL SECURITY;
ALTER TABLE cor_audit_packages                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_audit_packages                     FORCE ROW LEVEL SECURITY;
ALTER TABLE cor_audit_trail                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_audit_trail                        FORCE ROW LEVEL SECURITY;
ALTER TABLE cor_voice_action_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_voice_action_logs                  FORCE ROW LEVEL SECURITY;
ALTER TABLE credential_alert_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_alert_logs                  FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_reports                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports                          FORCE ROW LEVEL SECURITY;
ALTER TABLE document_chunks                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks                        FORCE ROW LEVEL SECURITY;
ALTER TABLE equipment                              ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment                              FORCE ROW LEVEL SECURITY;
ALTER TABLE estimates                              ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates                              FORCE ROW LEVEL SECURITY;
ALTER TABLE estimate_templates                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_templates                     FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator_actuals                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator_actuals                      FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                               FORCE ROW LEVEL SECURITY;
ALTER TABLE external_auditor_tokens                ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_auditor_tokens                FORCE ROW LEVEL SECURITY;
ALTER TABLE file_attachments                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_attachments                       FORCE ROW LEVEL SECURITY;
ALTER TABLE form_submissions                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions                       FORCE ROW LEVEL SECURITY;
ALTER TABLE inspection_alerts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_alerts                      FORCE ROW LEVEL SECURITY;
ALTER TABLE inspections                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections                            FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_assets                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_assets                       FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_materials                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_materials                    FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations                            FORCE ROW LEVEL SECURITY;
ALTER TABLE job_postings                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings                           FORCE ROW LEVEL SECURITY;
ALTER TABLE leads                                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                                  FORCE ROW LEVEL SECURITY;
ALTER TABLE payments                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                               FORCE ROW LEVEL SECURITY;
ALTER TABLE permits                                ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits                                FORCE ROW LEVEL SECURITY;
ALTER TABLE policy_documents                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_documents                       FORCE ROW LEVEL SECURITY;
ALTER TABLE policy_signoffs                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_signoffs                        FORCE ROW LEVEL SECURITY;
ALTER TABLE project_members                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members                        FORCE ROW LEVEL SECURITY;
ALTER TABLE project_notes                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes                          FORCE ROW LEVEL SECURITY;
ALTER TABLE proposals                              ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals                              FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_tokens                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_tokens                        FORCE ROW LEVEL SECURITY;
ALTER TABLE quickbooks_connections                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE quickbooks_connections                 FORCE ROW LEVEL SECURITY;
ALTER TABLE rfis                                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis                                   FORCE ROW LEVEL SECURITY;
ALTER TABLE scans                                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans                                  FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_events                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events                        FORCE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_docs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_docs                     FORCE ROW LEVEL SECURITY;
ALTER TABLE subcontractors                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors                         FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions                          FORCE ROW LEVEL SECURITY;
ALTER TABLE time_entries                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries                           FORCE ROW LEVEL SECURITY;
ALTER TABLE tool_checkouts                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_checkouts                         FORCE ROW LEVEL SECURITY;
ALTER TABLE user_memberships                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships                       FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_credentials                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_credentials                     FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_documents                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_documents                       FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_schedules                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_schedules                       FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator_cost_models                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator_cost_models                  FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator_addons                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimator_addons                       FORCE ROW LEVEL SECURITY;

-- ── FORCE on the 4 tables already gated in migration 0046 ───────────────────
ALTER TABLE projects                               FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices                               FORCE ROW LEVEL SECURITY;
ALTER TABLE quotes                                 FORCE ROW LEVEL SECURITY;
ALTER TABLE timesheets                             FORCE ROW LEVEL SECURITY;

-- ── Indirect join-based policies (20 tables, scoped via parent FK) ──────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_activities' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON lead_activities
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM leads p WHERE p.id = lead_activities.lead_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_report_photos' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON daily_report_photos
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM daily_reports p WHERE p.id = daily_report_photos.report_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'submission_photos' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON submission_photos
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM form_submissions p WHERE p.id = submission_photos.submission_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'submission_comments' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON submission_comments
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM form_submissions p WHERE p.id = submission_comments.submission_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'builder_estimate_items' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON builder_estimate_items
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM builder_estimates p WHERE p.id = builder_estimate_items.estimate_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimate_template_items' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON estimate_template_items
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM estimate_templates p WHERE p.id = estimate_template_items.template_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_posting_applications' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON job_posting_applications
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM job_postings p WHERE p.id = job_posting_applications.job_posting_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedule_event_assignees' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON schedule_event_assignees
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM schedule_events p WHERE p.id = schedule_event_assignees.event_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inspection_items' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON inspection_items
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM inspections p WHERE p.id = inspection_items.inspection_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON messages
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM conversations p WHERE p.id = messages.conversation_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_analyses' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON cost_analyses
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = cost_analyses.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON tasks
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = tasks.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_documents' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON project_documents
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = project_documents.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_portal_tokens' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON client_portal_tokens
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = client_portal_tokens.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_portal_uploads' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON client_portal_uploads
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = client_portal_uploads.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_portal_messages' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON client_portal_messages
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = client_portal_messages.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_logs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON daily_logs
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = daily_logs.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_photos' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON site_photos
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = site_photos.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_signoffs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON safety_signoffs
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = safety_signoffs.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'media_hub_photos' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON media_hub_photos
      AS PERMISSIVE
      USING (
        current_tenant_id() IS NULL
        OR EXISTS (
          SELECT 1 FROM projects p WHERE p.id = media_hub_photos.project_id AND p.company_id = current_tenant_id()
        )
      );
  END IF;

END
$$;

-- ── ENABLE + FORCE on indirect tables (20) ───────────────────────────────────
ALTER TABLE lead_activities                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities                        FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_report_photos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_photos                    FORCE ROW LEVEL SECURITY;
ALTER TABLE submission_photos                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_photos                      FORCE ROW LEVEL SECURITY;
ALTER TABLE submission_comments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_comments                    FORCE ROW LEVEL SECURITY;
ALTER TABLE builder_estimate_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_estimate_items                 FORCE ROW LEVEL SECURITY;
ALTER TABLE estimate_template_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_template_items                FORCE ROW LEVEL SECURITY;
ALTER TABLE job_posting_applications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_posting_applications               FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_event_assignees               ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_event_assignees               FORCE ROW LEVEL SECURITY;
ALTER TABLE inspection_items                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items                       FORCE ROW LEVEL SECURITY;
ALTER TABLE messages                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                               FORCE ROW LEVEL SECURITY;
ALTER TABLE cost_analyses                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_analyses                          FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks                                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                                  FORCE ROW LEVEL SECURITY;
ALTER TABLE project_documents                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents                      FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_tokens                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_tokens                   FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_uploads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_uploads                  FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_messages                 FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_logs                             ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs                             FORCE ROW LEVEL SECURITY;
ALTER TABLE site_photos                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos                            FORCE ROW LEVEL SECURITY;
ALTER TABLE safety_signoffs                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_signoffs                        FORCE ROW LEVEL SECURITY;
ALTER TABLE media_hub_photos                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_hub_photos                       FORCE ROW LEVEL SECURITY;
