-- Seed the COMMS_HUB entitlement flag for the Project Communications Hub.
-- Enterprise-plan tenants receive it automatically via the ENTERPRISE_ONLY_FEATURES
-- list in featureGate.ts; other tenants can be granted it via a company's custom
-- activeFeatures array.
INSERT INTO "features" ("key", "name", "description", "is_enabled")
VALUES (
	'COMMS_HUB',
	'Project Communications Hub',
	'Sync Outlook and Gmail into projects: read-only email threads, attachments, and search per project',
	true
)
ON CONFLICT ("key") DO NOTHING;
