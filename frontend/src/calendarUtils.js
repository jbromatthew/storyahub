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
  const prevMonthLast = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = firstDow - 1; i >= 0; i--) {
    const n = prevMonthLast - i;
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    cells.push({ n, year: py, month: pm, adjacent: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ n: d, year, month, adjacent: false });
  }

  let nextN = 1;
  while (cells.length % 7 !== 0) {
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    cells.push({ n: nextN, year: ny, month: nm, adjacent: true });
    nextN++;
  }

  return cells;
}

export function monthGridRange(year, month) {
  const cells = monthCells(year, month);
  const first = cells[0];
  const last = cells[cells.length - 1];
  return {
    cells,
    from: new Date(first.year, first.month, first.n, 0, 0, 0, 0),
    to: new Date(last.year, last.month, last.n, 23, 59, 59, 999),
  };
}

/** Google Calendar 스타일 — 1일은 "6월 1일", 나머지는 "15일" */
export function formatCellDayLabel(cell) {
  if (!cell?.n) return "";
  if (cell.n === 1) return `${cell.month + 1}월 ${cell.n}일`;
  return `${cell.n}일`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateInput(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/** 해당 날짜 셀에 일정이 걸쳐 있는지 (종료일이 시작일과 다를 수 있음) */
export function eventOnDay(ev, cell) {
  if (!cell?.n || !ev?.startsAt) return false;
  const dayStart = new Date(cell.year, cell.month, cell.n, 0, 0, 0, 0);
  const dayEnd = new Date(cell.year, cell.month, cell.n, 23, 59, 59, 999);
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : start;
  return start <= dayEnd && end >= dayStart;
}

export function formatEventWhen(ev) {
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : null;
  const st = ev.time || `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
  const sd = `${start.getMonth() + 1}월 ${start.getDate()}일`;
  if (!end) return `${sd} · ${st}${ev.repeatYearly ? " · 매년" : ""}`;
  const et = ev.endTime || `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  const ed = `${end.getMonth() + 1}월 ${end.getDate()}일`;
  const repeat = ev.repeatYearly ? " · 매년" : "";
  if (start.toDateString() === end.toDateString()) return `${sd} · ${st}–${et}${repeat}`;
  return `${sd} ${st} – ${ed} ${et}${repeat}`;
}
