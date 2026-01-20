import { google, type calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalize_event = (event: calendar_v3.Schema$Event): Record<string, unknown> => {
  const start = event.start?.dateTime ?? event.start?.date ?? null;
  const end = event.end?.dateTime ?? event.end?.date ?? null;

  return {
    event_id: to_string(event.id),
    status: to_string(event.status) || null,
    summary: to_string(event.summary) || null,
    description: to_string(event.description) || null,
    location: to_string(event.location) || null,
    start,
    end,
    html_link: to_string(event.htmlLink) || null,
  };
};

const calendar_client = ({ auth }: { auth: OAuth2Client }) =>
  google.calendar({ version: "v3", auth });

export const google_calendar_list_events = async ({
  auth,
  calendar_id,
  time_min,
  time_max,
  query,
  max_results,
}: {
  auth: OAuth2Client;
  calendar_id: string;
  time_min: string;
  time_max: string;
  query?: string | null;
  max_results?: number | null;
}): Promise<Record<string, unknown>> => {
  const calendar = calendar_client({ auth });

  const res = await calendar.events.list({
    calendarId: calendar_id,
    timeMin: time_min,
    timeMax: time_max,
    q: query ?? undefined,
    maxResults: typeof max_results === "number" && Number.isFinite(max_results) ? max_results : 25,
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = (res.data.items ?? []).map(normalize_event);

  return {
    calendar_id,
    time_min,
    time_max,
    count: items.length,
    events: items,
  };
};

export const google_calendar_get_event = async ({
  auth,
  calendar_id,
  event_id,
}: {
  auth: OAuth2Client;
  calendar_id: string;
  event_id: string;
}): Promise<Record<string, unknown>> => {
  const calendar = calendar_client({ auth });
  const res = await calendar.events.get({ calendarId: calendar_id, eventId: event_id });
  return { calendar_id, event: normalize_event(res.data) };
};

export const google_calendar_create_event = async ({
  auth,
  calendar_id,
  event,
}: {
  auth: OAuth2Client;
  calendar_id: string;
  event: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  const calendar = calendar_client({ auth });
  const res = await calendar.events.insert({
    calendarId: calendar_id,
    requestBody: event as unknown as calendar_v3.Schema$Event,
  });

  return {
    calendar_id,
    event: normalize_event(res.data),
  };
};

export const google_calendar_update_event = async ({
  auth,
  calendar_id,
  event_id,
  patch,
}: {
  auth: OAuth2Client;
  calendar_id: string;
  event_id: string;
  patch: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  const calendar = calendar_client({ auth });
  const res = await calendar.events.patch({
    calendarId: calendar_id,
    eventId: event_id,
    requestBody: patch as unknown as calendar_v3.Schema$Event,
  });

  return {
    calendar_id,
    event: normalize_event(res.data),
  };
};

export const google_calendar_delete_event = async ({
  auth,
  calendar_id,
  event_id,
}: {
  auth: OAuth2Client;
  calendar_id: string;
  event_id: string;
}): Promise<Record<string, unknown>> => {
  const calendar = calendar_client({ auth });
  await calendar.events.delete({ calendarId: calendar_id, eventId: event_id });
  return { ok: true, calendar_id, event_id };
};

