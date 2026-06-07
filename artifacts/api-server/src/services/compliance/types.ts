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

/**
 * Structured work-type classification for a field event.
 * When provided this drives the deterministic work-type rules engine pass,
 * which fires BEFORE keyword matching and AI analysis.
 */
export type WorkType =
  | "excavation"
  | "roofing"
  | "electrical"
  | "plumbing"
  | "concrete"
  | "framing"
  | "demolition"
  | "confined_space"
  | "scaffolding"
  | "crane_lifting"
  | "welding_cutting"
  | "trenching"
  | "asbestos_abatement"
  | "painting_coatings"
  | "hvac"
  | "masonry"
  | "general_labour";

export interface ComplianceEventPayload {
  companyId: number;
  projectId: number;
  sourceType: ComplianceSourceType;
  sourceRecordId?: string;
  /**
   * Structured work type classification.
   * When present, the deterministic work-type rules pass fires first,
   * guaranteeing required safety forms without touching AI tokens.
   */
  workType?: WorkType;
  /** Raw free-text content to analyse (field log notes, daily report body, etc.) */
  text: string;
}
