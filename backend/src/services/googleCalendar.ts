import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { env } from "../env.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_CAL = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

type GoogleConn = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  calendarId: string | null;
  syncToken: string | null;
  lastSyncedAt: Date | null;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

function verifyOAuthState(state: string): string | null {
  try {
    const payload = jwt.verify(state, env.jwtSecret) as { userId?: string; purpose?: string };
    if (payload.purpose !== "google_calendar" || !payload.userId) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(env.google.clientId && env.google.clientSecret && env.google.redirectUri);
}

export function getGoogleAuthUrl(userId: string): string | null {
  if (!isGoogleCalendarConfigured()) return null;
  const state = jwt.sign({ userId, purpose: "google_calendar" }, env.jwtSecret, { expiresIn: "10m" });
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

async function exchangeCode(code: string) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
}

async function refreshAccessToken(conn: GoogleConn): Promise<string> {
  if (conn.tokenExpiry && conn.tokenExpiry.getTime() > Date.now() + 60_000) {
    return conn.accessToken;
  }
  if (!conn.refreshToken) return conn.accessToken;

  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error("Google refresh token expired — reconnect required");
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const tokenExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { accessToken: data.access_token, tokenExpiry },
  });
  return data.access_token;
}

async function googleFetch(conn: GoogleConn, path: string, init: RequestInit = {}) {
  const token = await refreshAccessToken(conn);
  const res = await fetch(`${GOOGLE_CAL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API ${path}: ${text.slice(0, 240)}`);
  }
  return res.json();
}

function parseGoogleDate(part?: { dateTime?: string; date?: string }): Date | null {
  if (!part) return null;
  if (part.dateTime) return new Date(part.dateTime);
  if (part.date) return new Date(`${part.date}T00:00:00`);
  return null;
}

function eventToGoogleBody(e: {
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  place: string | null;
  notes: string | null;
}) {
  const allDay = e.startsAt.getHours() === 0 && e.startsAt.getMinutes() === 0 && !e.endsAt;
  const body: Record<string, unknown> = {
    summary: e.title,
    location: e.place || undefined,
    description: e.notes || undefined,
  };
  if (allDay) {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    body.start = { date: fmt(e.startsAt) };
    body.end = { date: fmt(e.endsAt ?? new Date(e.startsAt.getTime() + 86400000)) };
  } else {
    body.start = { dateTime: e.startsAt.toISOString() };
    body.end = { dateTime: (e.endsAt ?? new Date(e.startsAt.getTime() + 3600000)).toISOString() };
  }
  return body;
}

export async function connectGoogleCalendar(code: string, state: string) {
  const userId = verifyOAuthState(state);
  if (!userId) throw new Error("invalid oauth state");
  const tokens = await exchangeCode(code);
  const tokenExpiry = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

  const calendars = await fetch(`${GOOGLE_CAL}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  }).then((r) => r.json() as Promise<{ items?: Array<{ id: string; summary?: string; primary?: boolean }> }>);

  const primary = calendars.items?.find((c) => c.primary) || calendars.items?.[0];
  const calendarId = primary?.id || "primary";
  const calendarName = primary?.summary || "Primary";

  await prisma.calendarConnection.upsert({
    where: { userId_provider: { userId, provider: "google" } },
    create: {
      userId,
      provider: "google",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiry,
      calendarId,
      calendarName,
      enabled: true,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      tokenExpiry,
      calendarId,
      calendarName,
      enabled: true,
    },
  });

  await syncGoogleCalendar(userId);
  return userId;
}

export async function disconnectGoogleCalendar(userId: string) {
  await prisma.calendarConnection.deleteMany({ where: { userId, provider: "google" } });
}

export async function getGoogleSyncStatus(userId: string) {
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
  return {
    configured: isGoogleCalendarConfigured(),
    connected: !!conn?.enabled,
    calendarId: conn?.calendarId ?? null,
    calendarName: conn?.calendarName ?? null,
    lastSyncedAt: conn?.lastSyncedAt ?? null,
  };
}

export async function listGoogleCalendars(userId: string) {
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
  if (!conn) return [];
  const data = (await googleFetch(conn, "/users/me/calendarList")) as {
    items?: Array<{ id: string; summary?: string; primary?: boolean }>;
  };
  return (data.items || []).map((c) => ({
    id: c.id,
    name: c.summary || c.id,
    primary: !!c.primary,
  }));
}

export async function setGoogleCalendarId(userId: string, calendarId: string, calendarName?: string) {
  await prisma.calendarConnection.update({
    where: { userId_provider: { userId, provider: "google" } },
    data: { calendarId, calendarName: calendarName ?? null, syncToken: null },
  });
}

async function pullGoogleEvents(conn: GoogleConn, userId: string) {
  const calId = encodeURIComponent(conn.calendarId || "primary");
  let pageToken: string | undefined;
  let syncToken: string | undefined;
  let pulled = 0;
  let updated = 0;
  let deleted = 0;

  do {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "true" });
    if (conn.syncToken) {
      params.set("syncToken", conn.syncToken);
    } else {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      params.set("timeMin", from.toISOString());
      params.set("showDeleted", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const data = (await googleFetch(conn, `/calendars/${calId}/events?${params}`)) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };

    for (const ge of data.items || []) {
      if (!ge.id) continue;
      const existing = await prisma.event.findFirst({ where: { userId, googleId: ge.id } });

      if (ge.status === "cancelled") {
        if (existing) {
          await prisma.event.delete({ where: { id: existing.id } });
          deleted++;
        }
        continue;
      }

      const startsAt = parseGoogleDate(ge.start);
      if (!startsAt) continue;
      const endsAt = parseGoogleDate(ge.end);
      const externalUpdatedAt = ge.updated ? new Date(ge.updated) : new Date();

      if (existing) {
        if (existing.syncSource === "storyahub" && existing.updatedAt > externalUpdatedAt) continue;
        await prisma.event.update({
          where: { id: existing.id },
          data: {
            title: ge.summary || existing.title,
            startsAt,
            endsAt,
            place: ge.location ?? existing.place,
            notes: ge.description ?? existing.notes,
            externalUpdatedAt,
            syncSource: "google",
          },
        });
        updated++;
      } else {
        await prisma.event.create({
          data: {
            userId,
            title: ge.summary || "일정",
            startsAt,
            endsAt,
            place: ge.location || null,
            notes: ge.description || null,
            googleId: ge.id,
            externalUpdatedAt,
            syncSource: "google",
            category: "일정",
            reminders: ["1시간 전"],
          },
        });
        pulled++;
      }
    }

    pageToken = data.nextPageToken;
    syncToken = data.nextSyncToken || syncToken;
  } while (pageToken);

  if (syncToken) {
    await prisma.calendarConnection.update({
      where: { id: conn.id },
      data: { syncToken },
    });
  }

  return { pulled, updated, deleted };
}

async function pushLocalEvents(conn: GoogleConn, userId: string) {
  const calId = encodeURIComponent(conn.calendarId || "primary");
  const since = conn.lastSyncedAt ?? new Date(Date.now() - 90 * 86400000);
  const locals = await prisma.event.findMany({
    where: {
      userId,
      OR: [{ googleId: null }, { updatedAt: { gte: since } }],
    },
    take: 500,
  });

  let pushed = 0;
  for (const e of locals) {
    const body = eventToGoogleBody(e);
    if (e.googleId) {
      await googleFetch(conn, `/calendars/${calId}/events/${encodeURIComponent(e.googleId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      const created = (await googleFetch(conn, `/calendars/${calId}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      })) as GoogleEvent;
      if (created.id) {
        await prisma.event.update({
          where: { id: e.id },
          data: { googleId: created.id, syncSource: e.syncSource || "storyahub" },
        });
      }
    }
    pushed++;
  }
  return { pushed };
}

export async function syncGoogleCalendar(userId: string) {
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
  if (!conn?.enabled) throw new Error("Google Calendar not connected");

  const pull = await pullGoogleEvents(conn, userId);
  const push = await pushLocalEvents(conn, userId);

  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date() },
  });

  return { ...pull, ...push };
}

export async function pushEventToGoogle(userId: string, eventId: string) {
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
  if (!conn?.enabled) return;

  const e = await prisma.event.findFirst({ where: { id: eventId, userId } });
  if (!e) return;

  const calId = encodeURIComponent(conn.calendarId || "primary");
  const body = eventToGoogleBody(e);

  if (e.googleId) {
    await googleFetch(conn, `/calendars/${calId}/events/${encodeURIComponent(e.googleId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } else {
    const created = (await googleFetch(conn, `/calendars/${calId}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    })) as GoogleEvent;
    if (created.id) {
      await prisma.event.update({
        where: { id: e.id },
        data: { googleId: created.id },
      });
    }
  }
}

export async function deleteEventFromGoogle(userId: string, googleId: string | null | undefined) {
  if (!googleId) return;
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
  if (!conn?.enabled) return;
  const calId = encodeURIComponent(conn.calendarId || "primary");
  try {
    await googleFetch(conn, `/calendars/${calId}/events/${encodeURIComponent(googleId)}`, {
      method: "DELETE",
    });
  } catch {
    /* already deleted on Google */
  }
}
