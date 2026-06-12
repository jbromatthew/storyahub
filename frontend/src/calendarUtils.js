/** Apple Calendar 스타일 — 캘린더 분류·ICS 공유 */

import { calendarByName, calendarList, DEFAULT_PREFERENCES } from "./preferences.js";

export function eventColor(ev, prefs) {
  if (ev?.color) return ev.color;
  if (ev?.category) return calendarByName(ev.category, prefs).color;
  return calendarList(prefs)[0]?.color || DEFAULT_PREFERENCES.calendar.calendars[0].color;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function icsDate(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function esc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** .ics 파일 생성 — Apple Calendar 등으로 가져오기 */
export function buildIcs(event, { contacts = [] } = {}) {
  const start = new Date(event.startsAt || event._raw?.startsAt);
  const endRaw = event.endsAt || event._raw?.endsAt;
  const end = endRaw ? new Date(endRaw) : new Date(start.getTime() + 60 * 60 * 1000);
  const uid = event.id || event._raw?.id || `storyahub-${Date.now()}`;
  const attendees = contacts
    .filter(Boolean)
    .map((c) => `ATTENDEE;CN=${esc(c.person || c.company)}:mailto:${esc(c.email || "guest@storyahub.local")}`)
    .join("\r\n");
  const loc = event.place || event._raw?.place || "";
  const notes = event.notes || event._raw?.notes || "";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Storyahub//Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@storyahub`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(event.title || event._raw?.title)}`,
    loc ? `LOCATION:${esc(loc)}` : "",
    notes ? `DESCRIPTION:${esc(notes)}` : "",
    attendees,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function downloadIcs(filename, icsText) {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function shareEventNative({ title, text, url }) {
  if (navigator.share) {
    await navigator.share({ title, text, url: url || undefined });
    return true;
  }
  return false;
}

export function monthStart(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function monthCells(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ n: null, muted: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ n: d, muted: false });
  while (cells.length % 7 !== 0) cells.push({ n: null, muted: true });
  return cells;
}
