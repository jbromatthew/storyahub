/** 사용자 카테고리·태그 프리셋 — 백엔드 preferences.ts 와 동일 구조 */

export const CALENDAR_COLOR_POOL = [
  "#007AFF",
  "#5856D6",
  "#34C759",
  "#FF9500",
  "#FF2D55",
  "#AF52DE",
  "#5AC8FA",
  "#FFCC00",
  "#E07A5F",
  "#3F9A6A",
];

export const DEFAULT_PREFERENCES = {
  contacts: {
    groups: ["VIP", "파트너", "잠재", "기타"],
    tags: ["중요", "후속 필요", "단골", "신규"],
  },
  calendar: {
    calendars: [
      { id: "cal-main", name: "일정", color: "#007AFF" },
      { id: "cal-work", name: "업무", color: "#5856D6" },
      { id: "cal-personal", name: "개인", color: "#34C759" },
    ],
  },
  kb: {
    book: { categories: ["문학", "비즈니스", "자기계발", "에세이"], tags: ["읽는 중", "완독", "추천"] },
    lecture: { categories: ["세미나", "컨퍼런스", "강의", "워크숍", "사내교육"], tags: ["강연", "세미나", "핵심", "복습", "인사이트"] },
    knowledge: { categories: ["노하우", "레퍼런스", "메모", "아이디어"], tags: [] },
  },
  meeting: { categories: ["미팅", "통화", "방문", "온라인"], tags: ["후속 필요", "중요"] },
  places: {
    categories: ["한식", "일식", "카페", "미팅용", "회식", "기타"],
    tags: ["추천", "단골", "조용함", "주차"],
  },
};

const TAG_COLORS = {
  중요: "accent",
  "후속 필요": "amber",
  단골: "green",
  신규: "blue",
  VIP: "accent",
  "읽는 중": "amber",
  완독: "green",
  추천: "accent",
  핵심: "accent",
  복습: "blue",
  강연: "accent",
  세미나: "blue",
  인사이트: "green",
};

function cleanList(raw, max = 40) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s || s.length > 30 || out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function mergeKbSection(raw, fallback) {
  const o = raw && typeof raw === "object" ? raw : {};
  const categories = cleanList(o.categories);
  const tags = cleanList(o.tags);
  return {
    categories: categories.length ? categories : [...fallback.categories],
    tags: tags.length ? tags : [...fallback.tags],
  };
}

function mergeCalendars(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_PREFERENCES.calendar.calendars];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name ?? "").trim();
    const color = String(item.color ?? "").trim();
    const id = String(item.id ?? "").trim() || `cal-${out.length + 1}`;
    if (!name || !color) continue;
    if (out.some((x) => x.name === name)) continue;
    out.push({ id, name, color });
    if (out.length >= 12) break;
  }
  return out.length ? out : [...DEFAULT_PREFERENCES.calendar.calendars];
}

/** 레거시 contactTags + 신규 contacts 구조 통합 */
export function mergePreferencesRaw(p) {
  const o = p && typeof p === "object" ? p : {};
  const legacyTags = cleanList(o.contactTags);
  const contactsRaw = o.contacts && typeof o.contacts === "object" ? o.contacts : {};
  const groups = cleanList(contactsRaw.groups);
  const contactTags = cleanList(contactsRaw.tags);
  const kbRaw = o.kb && typeof o.kb === "object" ? o.kb : {};
  const meetingRaw = o.meeting && typeof o.meeting === "object" ? o.meeting : {};
  const placesRaw = o.places && typeof o.places === "object" ? o.places : {};
  const calendarRaw = o.calendar && typeof o.calendar === "object" ? o.calendar : {};

  const kb = {};
  for (const id of ["book", "lecture", "knowledge"]) {
    kb[id] = mergeKbSection(kbRaw[id], DEFAULT_PREFERENCES.kb[id]);
  }

  const tags =
    contactTags.length ? contactTags : legacyTags.length ? legacyTags : [...DEFAULT_PREFERENCES.contacts.tags];

  return {
    contacts: {
      groups: groups.length ? groups : [...DEFAULT_PREFERENCES.contacts.groups],
      tags,
    },
    calendar: { calendars: mergeCalendars(calendarRaw.calendars) },
    kb,
    meeting: {
      categories: cleanList(meetingRaw.categories).length
        ? cleanList(meetingRaw.categories)
        : [...DEFAULT_PREFERENCES.meeting.categories],
      tags: cleanList(meetingRaw.tags).length ? cleanList(meetingRaw.tags) : [...DEFAULT_PREFERENCES.meeting.tags],
    },
    places: {
      categories: cleanList(placesRaw.categories).length
        ? cleanList(placesRaw.categories)
        : [...DEFAULT_PREFERENCES.places.categories],
      tags: cleanList(placesRaw.tags).length ? cleanList(placesRaw.tags) : [...DEFAULT_PREFERENCES.places.tags],
    },
  };
}

export function userPreferences(user) {
  return mergePreferencesRaw(user?.preferences);
}

export function kbPresets(prefs, section = "knowledge") {
  const sec = prefs?.kb?.[section] || DEFAULT_PREFERENCES.kb[section] || DEFAULT_PREFERENCES.kb.knowledge;
  return { categories: sec.categories || [], tags: sec.tags || [] };
}

export function calendarList(prefs) {
  return prefs?.calendar?.calendars?.length ? prefs.calendar.calendars : DEFAULT_PREFERENCES.calendar.calendars;
}

export function calendarByName(name, prefs) {
  const list = calendarList(prefs);
  return list.find((c) => c.name === name) || list[0];
}

/** 필터용: 전체 + 연락처 데이터의 회사명(가나다순) */
export function mergedContactCompanies(contacts = []) {
  const names = new Set();
  for (const c of contacts) {
    const co = (c.co || c.company || "").trim();
    if (co) names.add(co);
  }
  return ["전체", ...[...names].sort((a, b) => a.localeCompare(b, "ko"))];
}

/** 필터용: 전체 + 프리셋 그룹 + 데이터에만 있는 그룹 */
export function mergedContactGroups(prefs, contacts = []) {
  const preset = prefs?.contacts?.groups || [];
  const extra = new Set();
  for (const c of contacts) {
    if (c.group && c.group !== "미분류") extra.add(c.group);
  }
  const ordered = [...preset];
  for (const g of extra) {
    if (!ordered.includes(g)) ordered.push(g);
  }
  return ["전체", ...ordered];
}

/** 선택용: 미분류 + 프리셋 + 데이터 그룹 */
export function contactGroupOptions(prefs, contacts = []) {
  const preset = prefs?.contacts?.groups || [];
  const extra = new Set();
  for (const c of contacts) {
    if (c.group && c.group !== "미분류") extra.add(c.group);
  }
  const ordered = ["미분류", ...preset];
  for (const g of extra) {
    if (g !== "미분류" && !ordered.includes(g)) ordered.push(g);
  }
  return ordered;
}

/** 이름+연락처 동일인 묶기 (리스트 렌더용) */
function normalizePhoneClient(phone) {
  if (!phone?.trim()) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 10) digits = `0${digits.slice(2)}`;
  if (digits.startsWith("10") && digits.length === 10) digits = `0${digits}`;
  return digits;
}

export function computeContactIdentityKey(c) {
  if (c.identityKey || c._raw?.identityKey) return c.identityKey || c._raw?.identityKey;
  const name = (c.person || "").trim().replace(/\s+/g, " ").toLowerCase();
  const tel = normalizePhoneClient(c.phone);
  if (!name || !tel || tel.length < 9) return null;
  return `${name}|${tel}`;
}

export function layoutContactsByIdentity(contacts = []) {
  const byKey = new Map();
  for (const c of contacts) {
    const key = computeContactIdentityKey(c);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(c);
  }
  const emitted = new Set();
  const rows = [];
  for (const c of contacts) {
    const key = computeContactIdentityKey(c);
    if (!key) {
      rows.push({ kind: "contact", contact: c });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const members = byKey.get(key) || [c];
    if (members.length > 1) {
      rows.push({ kind: "identityGroup", key, members });
    } else {
      rows.push({ kind: "contact", contact: c });
    }
  }
  return rows;
}

export function hashTagColor(tag) {
  const palette = ["gray", "blue", "green", "amber", "accent"];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function tagColor(tag) {
  return TAG_COLORS[tag] || hashTagColor(tag);
}

/** 설정 화면 요약 */
export function prefsSummary(prefs) {
  const p = prefs || DEFAULT_PREFERENCES;
  return {
    contacts: { groups: p.contacts?.groups?.length || 0, tags: p.contacts?.tags?.length || 0 },
    calendar: p.calendar?.calendars?.length || 0,
    meeting: { categories: p.meeting?.categories?.length || 0, tags: p.meeting?.tags?.length || 0 },
    places: { categories: p.places?.categories?.length || 0, tags: p.places?.tags?.length || 0 },
    kb: Object.keys(p.kb || {}).length,
  };
}
