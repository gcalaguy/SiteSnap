/**
 * ExternalSyncService
 *
 * Isolated service engine for third-party productivity integrations:
 *  - Google Calendar (insert events)
 *  - Outlook Calendar (create events via Microsoft Graph)
 *  - Google Sheets (append rows)
 *
 * All calls are strictly additive: no mutation of existing app data.
 */

import { google, sheets_v4 } from "googleapis";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: string;
  attendees?: Array<{ email: string }>;
}

export interface SheetRowInput {
  spreadsheetId: string;
  range: string; // e.g. "Sheet1!A1"
  values: Array<Array<string | number | null>>; // 2D array of rows
  valueInputOption?: "RAW" | "USER_ENTERED";
}

// ---------------------------------------------------------------------------
// Google Calendar helper
// ---------------------------------------------------------------------------

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: CalendarEventInput,
): Promise<{ eventId: string; htmlLink: string }> {
  const client = new OAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      location: event.location,
      attendees: event.attendees ?? [],
    },
  });

  return {
    eventId: res.data.id ?? "",
    htmlLink: res.data.htmlLink ?? "",
  };
}

// ---------------------------------------------------------------------------
// Outlook Calendar helper (Microsoft Graph)
// ---------------------------------------------------------------------------

export async function createOutlookEvent(
  accessToken: string,
  event: CalendarEventInput,
): Promise<{ eventId: string; webLink: string }> {
  const body = {
    subject: event.summary,
    body: {
      contentType: "HTML",
      content: event.description ?? "",
    },
    start: {
      dateTime: event.start.dateTime,
      timeZone: event.start.timeZone ?? "UTC",
    },
    end: {
      dateTime: event.end.dateTime,
      timeZone: event.end.timeZone ?? "UTC",
    },
    location: event.location
      ? { displayName: event.location }
      : undefined,
    attendees:
      event.attendees?.map((a) => ({
        emailAddress: { address: a.email },
        type: "required",
      })) ?? [],
  };

  const response = await axios.post(
    "https://graph.microsoft.com/v1.0/me/events",
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  const data = response.data as { id?: string; webLink?: string };
  return {
    eventId: data.id ?? "",
    webLink: data.webLink ?? "",
  };
}

// ---------------------------------------------------------------------------
// Google Sheets helper
// ---------------------------------------------------------------------------

export async function appendToGoogleSheet(
  accessToken: string,
  input: SheetRowInput,
): Promise<{ updates: sheets_v4.Schema$AppendValuesResponse }> {
  const client = new OAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: input.spreadsheetId,
    range: input.range,
    valueInputOption: input.valueInputOption ?? "USER_ENTERED",
    requestBody: {
      values: input.values,
    },
  });

  return { updates: res.data };
}
