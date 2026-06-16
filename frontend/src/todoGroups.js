import { formatWhen } from "./mappers.js";

function contactLabel(c) {
  if (!c) return null;
  const co = c.company || c.co || "";
  const person = c.person || "";
  if (co && person) return `${co} (${person})`;
  return co || person || null;
}

function resolveContact(todo, contactMap, meetingMap) {
  const raw = todo._raw || todo;
  const meeting = raw.meetingId ? meetingMap.get(raw.meetingId) : null;
  if (meeting?.contact) return meeting.contact;
  if (raw.contactId) return contactMap.get(raw.contactId) || null;
  return null;
}

function meetingLine(m) {
  return m?.oneLine || m?.t || "";
}

function groupLabel(group, contactMap, meetingMap) {
  if (group.key === "manual") return "직접 추가";
  if (group.key.startsWith("m:")) {
    const m = meetingMap.get(group.key.slice(2));
    const line = meetingLine(m);
    if (line) return line.slice(0, 56);
    const contact = resolveContact(group.items[0], contactMap, meetingMap);
    const fromContact = contactLabel(contact);
    if (fromContact) return fromContact;
    return "미팅 기록";
  }
  const first = group.items[0];
  const contact = resolveContact(first, contactMap, meetingMap);
  return contactLabel(contact) || "기타";
}

function groupSublabel(group, contactMap, meetingMap) {
  if (!group.key.startsWith("m:")) return "";
  const m = meetingMap.get(group.key.slice(2));
  const parts = [];
  const contact = resolveContact(group.items[0], contactMap, meetingMap);
  const fromContact = contactLabel(contact);
  if (fromContact) parts.push(fromContact);
  const at = m?._raw?.createdAt || m?.createdAt;
  if (at) parts.push(typeof at === "string" && at.includes(".") ? at : formatWhen(at));
  return parts.join(" · ");
}

/** 미팅(또는 인맥) 기준으로 할 일 묶음 — 대분류=미팅, 소분류=할 일 항목 */
export function groupTodosBySource(todos, { meetings = [], contacts = [] } = {}) {
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const meetingMap = new Map(meetings.map((m) => [m.id, m]));
  const buckets = new Map();

  for (const t of todos) {
    const raw = t._raw || t;
    const meetingId = raw.meetingId || t.meetingId;
    const contactId = raw.contactId || t.contactId;
    let key;
    let sortTs = raw.createdAt || "";

    if (meetingId) {
      key = `m:${meetingId}`;
      const m = meetingMap.get(meetingId);
      if (m?._raw?.createdAt) sortTs = m._raw.createdAt;
      else if (m?.createdAt) sortTs = m.createdAt;
    } else if (contactId) {
      key = `c:${contactId}`;
    } else {
      key = "manual";
    }

    if (!buckets.has(key)) buckets.set(key, { key, items: [], sortTs });
    const bucket = buckets.get(key);
    bucket.items.push(t);
    if (String(sortTs) > String(bucket.sortTs)) bucket.sortTs = sortTs;
  }

  return [...buckets.values()]
    .sort((a, b) => {
      if (a.key === "manual") return 1;
      if (b.key === "manual") return -1;
      return String(b.sortTs).localeCompare(String(a.sortTs));
    })
    .map((g) => ({
      ...g,
      id: g.key,
      label: groupLabel(g, contactMap, meetingMap),
      sublabel: groupSublabel(g, contactMap, meetingMap),
    }));
}

function isTodoRowDone(t) {
  const subs = t.subs || [];
  return subs.length ? subs.every((s) => s.done) : t.done || t.status === "done";
}

/** 미팅 그룹 안에 표시할 행 — 대분류 아래 소분류(할 일)만 펼침 */
export function groupDisplayRows(group) {
  if (!group.key.startsWith("m:")) {
    return { mode: "todos", parent: null, rows: group.items };
  }

  const rows = [];
  for (const t of group.items) {
    const subs = t.subs || [];
    if (subs.length) {
      for (const s of subs) rows.push({ kind: "sub", id: s.id, text: s.text, done: s.done, parent: t });
    } else {
      rows.push({
        kind: "todo",
        id: t.id,
        text: t.t || t.title || "할 일",
        done: isTodoRowDone(t),
        parent: t,
      });
    }
  }

  if (rows.length) {
    return { mode: "lines", parent: group.items[0] || null, rows };
  }
  return { mode: "todos", parent: null, rows: group.items };
}

export function groupProgress(group) {
  const disp = groupDisplayRows(group);
  if (disp.mode === "lines") {
    const total = disp.rows.length;
    const done = disp.rows.filter((r) => r.done).length;
    return { done, total, ratio: total ? done / total : 0 };
  }
  const total = disp.rows.length;
  const done = disp.rows.filter((t) => isTodoRowDone(t)).length;
  return { done, total, ratio: total ? done / total : 0 };
}
