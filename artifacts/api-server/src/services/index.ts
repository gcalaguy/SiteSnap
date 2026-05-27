/**
 * Isolated service engines for third-party integrations and shared business logic.
 */

export {
  createGoogleCalendarEvent,
  createOutlookEvent,
  appendToGoogleSheet,
} from "./externalSyncService";

export type {
  CalendarEventInput,
  SheetRowInput,
} from "./externalSyncService";

export {
  getTenantFinancialSummaries,
  invalidateDashboardMetricsCache,
} from "./dashboardMetrics";

export type {
  ProjectFinancials,
  TenantFinancialSummary,
} from "./dashboardMetrics";
