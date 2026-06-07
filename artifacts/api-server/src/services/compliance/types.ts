/**
 * Shared type aliases for compliance service modules.
 * Mirrors the pgEnum values defined in lib/db/src/schema/index.ts.
 */

export type ComplianceTargetForm =
  | "toolbox_talk"
  | "site_inspection"
  | "hazard_id"
  | "incident_investigation"
  | "training_record"
  | "audit_prep";

export type ComplianceUrgency = "HIGH" | "MEDIUM" | "LOW";

export type ComplianceSourceType =
  | "FIELD_LOG"
  | "DAILY_REPORT"
  | "SCHEDULE"
  | "RULE_ENGINE"
  | "WEATHER"
  | "INCIDENT"
  | "TRAINING";

export type ComplianceDirectiveStatus =
  | "PENDING"
  | "COMPLETED"
  | "DISMISSED"
  | "SUPERSEDED";

export interface ComplianceEventPayload {
  companyId: number;
  projectId: number;
  sourceType: ComplianceSourceType;
  sourceRecordId?: string;
  /** Raw free-text content to analyse (field log notes, daily report body, etc.) */
  text: string;
}
