-- Seed the INVENTORY entitlement flag.
-- Not mapped to any plan in plan_features by default: the feature is inactive
-- until a super admin assigns it to a plan or adds it to a company's
-- custom activeFeatures array.
INSERT INTO "features" ("key", "name", "description", "is_enabled")
VALUES (
	'INVENTORY',
	'Inventory & Asset Management',
	'Fleet dispatch board, materials stoplight tracking, and tool rental counter for SMB construction teams',
	true
)
ON CONFLICT ("key") DO NOTHING;
