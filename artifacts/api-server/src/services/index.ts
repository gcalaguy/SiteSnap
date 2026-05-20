/**
 * Isolated service engines for third-party integrations.
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
