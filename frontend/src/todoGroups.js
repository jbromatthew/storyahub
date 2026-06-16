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
    const contact = resolveContact(group.items[0], contactMap, meetingMap);
    const fromContact = contactLabel(contact);
    if (fromContact) return fromContact;
    const line = meetingLine(m);
    if (line) return line.slice(0, 56);
    return "미팅";
  }
  const first = group.items[0];
  const contact = resolveContact(first, contactMap, meetingMap);
  return contactLabel(contact) || "기타";
}

function groupSublabel(group, meetingMap) {
  if (!group.key.startsWith("m:")) return "";
  const m = meetingMap.get(group.key.slice(2));
  const parts = [];
  const line = meetingLine(m);
  const contact = group.label;
  if (line && !contact.includes(line.slice(0, 20))) parts.push(line.slice(0, 48));
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
      sublabel: groupSublabel(g, meetingMap),
    }));
}

/** 미팅 그룹 안에 표시할 행 — subs가 있으면 소분류로 펼침 */
export function groupDisplayRows(group) {
  if (group.items.length === 1) {
    const only = group.items[0];
    const subs = only.subs || [];
    if (subs.length > 0) {
      return { mode: "subs", parent: only, rows: subs };
    }
  }
  return { mode: "todos", parent: null, rows: group.items };
}

export function groupProgress(group) {
  const disp = groupDisplayRows(group);
  if (disp.mode === "subs") {
    const total = disp.rows.length;
    const done = disp.rows.filter((s) => s.done).length;
    return { done, total, ratio: total ? done / total : 0 };
  }
  const total = disp.rows.length;
  const done = disp.rows.filter((t) => {
    const subs = t.subs || [];
    return subs.length ? subs.every((s) => s.done) : t.done || t.status === "done";
  }).length;
  return { done, total, ratio: total ? done / total : 0 };
}
