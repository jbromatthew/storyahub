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

function groupLabel(group, contactMap, meetingMap) {
  if (group.key === "manual") return "직접 추가";
  const first = group.items[0];
  const contact = resolveContact(first, contactMap, meetingMap);
  const fromContact = contactLabel(contact);
  if (fromContact) return fromContact;
  if (group.key.startsWith("m:")) {
    const m = meetingMap.get(group.key.slice(2));
    if (m?.oneLine) return m.oneLine.slice(0, 40);
    return "기록";
  }
  return "기타";
}

function groupSublabel(group, meetingMap) {
  if (!group.key.startsWith("m:")) return "";
  const m = meetingMap.get(group.key.slice(2));
  const at = m?._raw?.createdAt || m?.createdLabel;
  if (!at) return "";
  return typeof at === "string" && at.includes(".") ? at : formatWhen(at);
}

/** 녹음·미팅(또는 인맥) 기준으로 할 일 묶음 */
export function groupTodosBySource(todos, { meetings = [], contacts = [] } = {}) {
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const meetingMap = new Map(meetings.map((m) => [m.id, m]));
  const buckets = new Map();

  for (const t of todos) {
    const raw = t._raw || t;
    let key;
    let sortTs = raw.createdAt || "";

    if (raw.meetingId) {
      key = `m:${raw.meetingId}`;
      const m = meetingMap.get(raw.meetingId);
      if (m?._raw?.createdAt) sortTs = m._raw.createdAt;
    } else if (raw.contactId) {
      key = `c:${raw.contactId}`;
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
