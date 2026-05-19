-- Migration: Add company_id to estimator_cost_models and estimator_addons for tenant isolation
-- Templates: company_id IS NULL (default rates for new companies)
-- Company-specific rows: company_id IS NOT NULL

ALTER TABLE estimator_cost_models ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE estimator_addons ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;

-- Drop old unique constraint on addon_key (global) and add per-company unique
ALTER TABLE estimator_addons DROP CONSTRAINT IF EXISTS estimator_addons_addon_key_unique;
ALTER TABLE estimator_addons DROP CONSTRAINT IF EXISTS estimator_addons_addon_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_addons_company_addon_key ON estimator_addons(company_id, addon_key);

-- Index for fast lookups by company
CREATE INDEX IF NOT EXISTS idx_cost_models_company ON estimator_cost_models(company_id);
CREATE INDEX IF NOT EXISTS idx_addons_company ON estimator_addons(company_id);

-- Migrate existing data: clone all existing cost models and addons for each existing company.
-- Keep originals with company_id = NULL as templates for new companies.
-- Idempotent: skip companies that already have rows.
DO $$
DECLARE
    company_rec RECORD;
    model_rec RECORD;
    addon_rec RECORD;
    new_model_id INTEGER;
    id_map JSONB := '{}';
    company_has_models BOOLEAN;
    company_has_addons BOOLEAN;
BEGIN
    -- Only run if there are template rows (company_id IS NULL)
    IF EXISTS (SELECT 1 FROM estimator_cost_models WHERE company_id IS NULL LIMIT 1) THEN
        FOR company_rec IN SELECT id FROM companies LOOP
            -- Check if this company already has cost models (idempotent)
            SELECT EXISTS(SELECT 1 FROM estimator_cost_models WHERE company_id = company_rec.id LIMIT 1)
            INTO company_has_models;
            IF company_has_models THEN CONTINUE; END IF;

            FOR model_rec IN SELECT * FROM estimator_cost_models WHERE company_id IS NULL LOOP
                INSERT INTO estimator_cost_models (
                    company_id, project_type, finish_level, name,
                    base_cost_per_sqft, labor_cost_per_sqft, material_cost_per_sqft,
                    overhead_pct, contingency_pct, notes, created_at, updated_at
                ) VALUES (
                    company_rec.id, model_rec.project_type, model_rec.finish_level, model_rec.name,
                    model_rec.base_cost_per_sqft, model_rec.labor_cost_per_sqft, model_rec.material_cost_per_sqft,
                    model_rec.overhead_pct, model_rec.contingency_pct, model_rec.notes, NOW(), NOW()
                )
                RETURNING id INTO new_model_id;

                id_map := jsonb_set(id_map, array[model_rec.id::text], to_jsonb(new_model_id));
            END LOOP;
        END LOOP;

        -- Update existing estimates to reference the new cloned cost model IDs
        -- (costModelUsed.id in the result JSONB)
        FOR model_rec IN SELECT * FROM estimator_cost_models WHERE company_id IS NULL LOOP
            new_model_id := (id_map ->> model_rec.id::text)::INTEGER;
            IF new_model_id IS NOT NULL THEN
                UPDATE estimates
                SET result = jsonb_set(
                    result::jsonb,
                    '{costModelUsed,id}',
                    to_jsonb(new_model_id)
                )
                WHERE result::jsonb -> 'costModelUsed' ->> 'id' = model_rec.id::text;
            END IF;
        END LOOP;
    END IF;

    -- Clone addons for each company (idempotent)
    IF EXISTS (SELECT 1 FROM estimator_addons WHERE company_id IS NULL LIMIT 1) THEN
        FOR company_rec IN SELECT id FROM companies LOOP
            SELECT EXISTS(SELECT 1 FROM estimator_addons WHERE company_id = company_rec.id LIMIT 1)
            INTO company_has_addons;
            IF company_has_addons THEN CONTINUE; END IF;

            FOR addon_rec IN SELECT * FROM estimator_addons WHERE company_id IS NULL LOOP
                INSERT INTO estimator_addons (
                    company_id, name, addon_key, description, cost_type, amount, applicable_types, created_at
                ) VALUES (
                    company_rec.id, addon_rec.name, addon_rec.addon_key, addon_rec.description,
                    addon_rec.cost_type, addon_rec.amount, addon_rec.applicable_types, NOW()
                );
            END LOOP;
        END LOOP;
    END IF;
END $$;
