import { Router } from "express";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { env } from "../env.js";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleAuthUrl,
  getGoogleSyncStatus,
  listGoogleCalendars,
  setGoogleCalendarId,
  syncGoogleCalendar,
  isGoogleCalendarConfigured,
} from "../services/googleCalendar.js";
import { importCalendarEvents, patchEventKitIds } from "../services/calendarImport.js";

export const calendarSyncRouter = Router();

calendarSyncRouter.get("/status", auth, requireAccess, async (req: AuthedRequest, res) => {
  const google = await getGoogleSyncStatus(req.userId!);
  res.json({ google });
});

calendarSyncRouter.get("/google/connect", auth, requireAccess, async (req: AuthedRequest, res) => {
  if (!isGoogleCalendarConfigured()) {
    return res.status(503).json({ error: "Google Calendar 연동이 아직 설정되지 않았어요" });
  }
  const url = getGoogleAuthUrl(req.userId!);
  if (!url) return res.status(503).json({ error: "Google Calendar 연동 URL을 만들 수 없어요" });
  res.json({ url });
});

calendarSyncRouter.get("/google/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const appBase = env.publicAppUrl.replace(/\/$/, "");

  if (!code || !state) {
    return res.redirect(`${appBase}/?calendarSync=error`);
  }

  try {
    await connectGoogleCalendar(code, state);
    return res.redirect(`${appBase}/?calendarSync=google_ok`);
  } catch (e) {
    console.error("google calendar callback", e);
    return res.redirect(`${appBase}/?calendarSync=error`);
  }
});

calendarSyncRouter.post("/google/sync", auth, requireAccess, async (req: AuthedRequest, res) => {
  try {
    const result = await syncGoogleCalendar(req.userId!);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "동기화 실패";
    res.status(400).json({ error: msg });
  }
});

calendarSyncRouter.delete("/google", auth, requireAccess, async (req: AuthedRequest, res) => {
  await disconnectGoogleCalendar(req.userId!);
  res.status(204).send();
});

calendarSyncRouter.get("/google/calendars", auth, requireAccess, async (req: AuthedRequest, res) => {
  try {
    const calendars = await listGoogleCalendars(req.userId!);
    res.json(calendars);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "캘린더 목록 실패";
    res.status(400).json({ error: msg });
  }
});

calendarSyncRouter.patch("/google/calendar", auth, requireAccess, async (req: AuthedRequest, res) => {
  const { calendarId, calendarName } = req.body ?? {};
  if (!calendarId) return res.status(400).json({ error: "calendarId required" });
  try {
    await setGoogleCalendarId(req.userId!, String(calendarId), calendarName ? String(calendarName) : undefined);
    const result = await syncGoogleCalendar(req.userId!);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "캘린더 변경 실패";
    res.status(400).json({ error: msg });
  }
});

calendarSyncRouter.post("/import", auth, requireAccess, async (req: AuthedRequest, res) => {
  const rawItems = Array.isArray(req.body?.events) ? req.body.events : [];
  const result = await importCalendarEvents(req.userId!, rawItems);
  res.json(result);
});

calendarSyncRouter.patch("/eventkit-ids", auth, requireAccess, async (req: AuthedRequest, res) => {
  const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
  const result = await patchEventKitIds(req.userId!, mappings);
  res.json(result);
});
