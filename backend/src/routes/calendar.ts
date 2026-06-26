import { Router } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { expandYearlyInRange } from "../services/eventRecurrence.js";
import { deleteEventFromGoogle, pushEventToGoogle } from "../services/googleCalendar.js";

export const calendarRouter = Router();
calendarRouter.use(auth, requireAccess);

function normalizeContactIds(raw: unknown, contactId?: string | null): string[] {
  const ids = Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
  if (contactId && !ids.includes(contactId)) ids.unshift(contactId);
  return [...new Set(ids)].slice(0, 20);
}

function toIcs(e: {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  place: string | null;
  notes: string | null;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const start = e.startsAt;
  const end = e.endsAt ?? new Date(start.getTime() + 60 * 60 * 1000);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Storyahub//Calendar//KO",
    "BEGIN:VEVENT",
    `UID:${e.id}@storyahub`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.place ? `LOCATION:${esc(e.place)}` : "",
    e.notes ? `DESCRIPTION:${esc(e.notes)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

calendarRouter.get("/", async (req: AuthedRequest, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date("2999-12-31");
  const events = await prisma.event.findMany({
    where: {
      userId: req.userId,
      OR: [
        {
          startsAt: { lte: to },
          OR: [{ endsAt: { gte: from } }, { endsAt: null, startsAt: { gte: from } }],
        },
        { repeatYearly: true },
      ],
    },
    orderBy: { startsAt: "asc" },
  });
  res.json(expandYearlyInRange(events, from, to));
});

calendarRouter.post("/", async (req: AuthedRequest, res) => {
  const { title, startsAt, endsAt, place, savedPlaceId, placeLat, placeLng, contactId, contactIds, category, color, notes, reminders, repeatYearly } =
    req.body ?? {};
  const ids = normalizeContactIds(contactIds, contactId);
  const e = await prisma.event.create({
    data: {
      userId: req.userId!,
      title,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      place,
      savedPlaceId: savedPlaceId ?? null,
      placeLat: placeLat != null ? Number(placeLat) : null,
      placeLng: placeLng != null ? Number(placeLng) : null,
      contactId: ids[0] ?? contactId ?? null,
      contactIds: ids,
      category: category ?? "일정",
      color: color ?? null,
      notes: notes ?? null,
      reminders: reminders ?? ["1시간 전"],
      repeatYearly: !!repeatYearly,
    },
  });
  void pushEventToGoogle(req.userId!, e.id).catch((err) => console.warn("google push create", err));
  res.status(201).json(e);
});

calendarRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const cur = await prisma.event.findFirst({ where: { id: req.params.id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  const { title, startsAt, endsAt, place, savedPlaceId, placeLat, placeLng, contactId, contactIds, category, color, notes, reminders, repeatYearly } =
    req.body ?? {};
  const ids =
    contactIds !== undefined || contactId !== undefined
      ? normalizeContactIds(contactIds ?? cur.contactIds, contactId ?? cur.contactId)
      : undefined;
  const e = await prisma.event.update({
    where: { id: cur.id },
    data: {
      title: title ?? cur.title,
      startsAt: startsAt ? new Date(startsAt) : cur.startsAt,
      endsAt: endsAt !== undefined ? (endsAt ? new Date(endsAt) : null) : cur.endsAt,
      place: place !== undefined ? place : cur.place,
      savedPlaceId: savedPlaceId !== undefined ? savedPlaceId || null : cur.savedPlaceId,
      placeLat: placeLat !== undefined ? (placeLat != null ? Number(placeLat) : null) : cur.placeLat,
      placeLng: placeLng !== undefined ? (placeLng != null ? Number(placeLng) : null) : cur.placeLng,
      contactId: ids !== undefined ? ids[0] ?? null : cur.contactId,
      contactIds: ids !== undefined ? ids : cur.contactIds,
      category: category !== undefined ? category : cur.category,
      color: color !== undefined ? color : cur.color,
      notes: notes !== undefined ? notes : cur.notes,
      reminders: reminders ?? cur.reminders,
      repeatYearly: repeatYearly !== undefined ? !!repeatYearly : cur.repeatYearly,
    },
  });
  void pushEventToGoogle(userId, e.id).catch((err) => console.warn("google push update", err));
  res.json(e);
});

calendarRouter.post("/:id/share", async (req: AuthedRequest, res) => {
  const cur = await prisma.event.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  const token = cur.shareToken || randomBytes(16).toString("hex");
  const e = cur.shareToken
    ? cur
    : await prisma.event.update({ where: { id: cur.id }, data: { shareToken: token } });
  const base = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json({ shareToken: e.shareToken, shareUrl: `${base}/calendar/share/${e.shareToken}` });
});

calendarRouter.get("/:id/ics", async (req: AuthedRequest, res) => {
  const cur = await prisma.event.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="event-${cur.id}.ics"`);
  res.send(toIcs(cur));
});

calendarRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const cur = await prisma.event.findFirst({ where: { id: req.params.id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  const googleId = cur.googleId;
  await prisma.event.delete({ where: { id: cur.id } });
  void deleteEventFromGoogle(userId, googleId).catch((err) => console.warn("google push delete", err));
  res.status(204).send();
});

/** 공유 링크 — 인증 없이 ICS 다운로드 */
export const calendarShareRouter = Router();

calendarShareRouter.get("/:token", async (req, res) => {
  const e = await prisma.event.findFirst({ where: { shareToken: req.params.token } });
  if (!e) return res.status(404).json({ error: "not found" });
  res.json({
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    place: e.place,
    notes: e.notes,
    category: e.category,
  });
});

calendarShareRouter.get("/:token/ics", async (req, res) => {
  const e = await prisma.event.findFirst({ where: { shareToken: req.params.token } });
  if (!e) return res.status(404).json({ error: "not found" });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(e.title)}.ics"`);
  res.send(toIcs(e));
});
