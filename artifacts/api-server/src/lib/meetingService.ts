import { logger } from "./logger";

export type MeetingPlatform = "google_meet" | "zoom" | "teams";

export interface MeetingDetails {
  platform: MeetingPlatform;
  link: string;
  conferenceId?: string;
}

/**
 * Google Meet — calls Google Calendar API with conferenceDataVersion: 1
 * and conferenceData.createRequest.conferenceSolutionKey.type = "hangoutsMeet".
 *
 * Requires Google OAuth setup (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, per-tenant access_token).
 * Currently returns a placeholder; wire in the tenant's stored Google token from meetingConfig.
 */
export async function createGoogleMeetLink(params: {
  title: string;
  startTime: Date;
  endTime: Date;
  organizerEmail?: string;
  googleAccessToken?: string;
}): Promise<MeetingDetails> {
  if (params.googleAccessToken) {
    try {
      const body = {
        summary: params.title,
        start: { dateTime: params.startTime.toISOString() },
        end: { dateTime: params.endTime.toISOString() },
        conferenceData: {
          createRequest: {
            requestId: `sitesnap-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };
      const resp = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (resp.ok) {
        const data = await resp.json() as { conferenceData?: { entryPoints?: { uri?: string }[] } };
        const link = data?.conferenceData?.entryPoints?.[0]?.uri ?? "https://meet.google.com/";
        return { platform: "google_meet", link };
      }
    } catch (err) {
      logger.warn({ err }, "Google Calendar API call failed; returning placeholder");
    }
  }

  logger.info({ params: { title: params.title } }, "Google Meet placeholder — provide Google OAuth token to create real links");
  return {
    platform: "google_meet",
    link: "https://meet.google.com/",
  };
}

/**
 * Zoom — OAuth redirect then POST /v2/users/me/meetings.
 * Full flow:
 *   1. Redirect to https://zoom.us/oauth/authorize?client_id=...&redirect_uri=...
 *   2. Exchange code → token via POST https://zoom.us/oauth/token
 *   3. POST https://api.zoom.us/v2/users/me/meetings  { topic, start_time, duration, ... }
 *
 * Requires ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET env vars + per-tenant stored token in meetingConfig.
 */
export async function createZoomMeeting(params: {
  companyId: number;
  title: string;
  startTime: Date;
  durationMinutes: number;
  zoomAccessToken?: string;
}): Promise<MeetingDetails> {
  if (params.zoomAccessToken) {
    try {
      const body = {
        topic: params.title,
        type: 2,
        start_time: params.startTime.toISOString(),
        duration: params.durationMinutes,
        settings: { host_video: true, participant_video: true },
      };
      const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.zoomAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const data = await resp.json() as { join_url?: string; id?: string };
        return {
          platform: "zoom",
          link: data.join_url ?? "https://zoom.us/",
          conferenceId: String(data.id ?? ""),
        };
      }
    } catch (err) {
      logger.warn({ err }, "Zoom API call failed; returning placeholder");
    }
  }

  logger.info(
    { companyId: params.companyId, title: params.title },
    "Zoom placeholder — complete OAuth setup and store access_token in company meetingConfig",
  );
  return {
    platform: "zoom",
    link: "https://zoom.us/",
  };
}

/**
 * Microsoft Teams — Microsoft Graph API online meeting creation.
 * Full flow:
 *   1. OAuth via https://login.microsoftonline.com/common/oauth2/v2.0/authorize
 *      (scopes: OnlineMeetings.ReadWrite)
 *   2. Exchange code → token via /oauth2/v2.0/token
 *   3. POST https://graph.microsoft.com/v1.0/me/onlineMeetings
 *
 * Requires TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET env vars + per-tenant token in meetingConfig.
 */
export async function createTeamsMeeting(params: {
  companyId: number;
  title: string;
  startTime: Date;
  endTime: Date;
  teamsAccessToken?: string;
}): Promise<MeetingDetails> {
  if (params.teamsAccessToken) {
    try {
      const body = {
        subject: params.title,
        startDateTime: params.startTime.toISOString(),
        endDateTime: params.endTime.toISOString(),
      };
      const resp = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.teamsAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const data = await resp.json() as { joinWebUrl?: string; id?: string };
        return {
          platform: "teams",
          link: data.joinWebUrl ?? "https://teams.microsoft.com/",
          conferenceId: data.id,
        };
      }
    } catch (err) {
      logger.warn({ err }, "Teams Graph API call failed; returning placeholder");
    }
  }

  logger.info(
    { companyId: params.companyId, title: params.title },
    "Teams placeholder — complete Microsoft OAuth setup and store access_token in company meetingConfig",
  );
  return {
    platform: "teams",
    link: "https://teams.microsoft.com/",
  };
}

export async function getMeetingLink(params: {
  platform: MeetingPlatform;
  companyId: number;
  title: string;
  startTime: Date;
  endTime: Date;
  meetingConfig?: Record<string, unknown> | null;
}): Promise<MeetingDetails> {
  const cfg = params.meetingConfig ?? {};

  switch (params.platform) {
    case "google_meet":
      return createGoogleMeetLink({
        title: params.title,
        startTime: params.startTime,
        endTime: params.endTime,
        googleAccessToken: (cfg.googleAccessToken as string | undefined),
      });
    case "zoom":
      return createZoomMeeting({
        companyId: params.companyId,
        title: params.title,
        startTime: params.startTime,
        durationMinutes: Math.round((params.endTime.getTime() - params.startTime.getTime()) / 60000),
        zoomAccessToken: (cfg.zoomAccessToken as string | undefined),
      });
    case "teams":
      return createTeamsMeeting({
        companyId: params.companyId,
        title: params.title,
        startTime: params.startTime,
        endTime: params.endTime,
        teamsAccessToken: (cfg.teamsAccessToken as string | undefined),
      });
  }
}
