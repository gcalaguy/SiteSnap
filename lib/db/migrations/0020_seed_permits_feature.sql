-- Seed the PERMITS entitlement flag. It is intentionally NOT mapped to any
-- plan in plan_features: no tenant resolves it as enabled until a super admin
-- explicitly adds it to a plan (or to a company's custom activeFeatures).
INSERT INTO "features" ("key", "name", "description", "is_enabled")
VALUES (
	'PERMITS',
	'Permits & Documentation',
	'Track, request, and manage municipal and environmental project permits',
	true
)
ON CONFLICT ("key") DO NOTHING;
