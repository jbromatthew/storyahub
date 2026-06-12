/** 사용자별 카테고리·태그 프리셋 — 인맥 / 캘린더 / 지식백과 / 미팅 / 맛집 */

export type KbSectionId = "book" | "lecture" | "knowledge";

export type KbSectionPresets = { categories: string[]; tags: string[] };

export type CalendarPreset = { id: string; name: string; color: string };

export type UserPreferences = {
  contacts: { groups: string[]; tags: string[] };
  calendar: { calendars: CalendarPreset[] };
  kb: Record<KbSectionId, KbSectionPresets>;
  meeting: { categories: string[]; tags: string[] };
  places: { categories: string[]; tags: string[] };
};

export const DEFAULT_PREFERENCES: UserPreferences = {
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
    lecture: { categories: ["세미나", "컨퍼런스", "강의", "워크숍"], tags: ["핵심", "복습"] },
    knowledge: { categories: ["노하우", "레퍼런스", "메모", "아이디어"], tags: [] },
  },
  meeting: { categories: ["미팅", "통화", "방문", "온라인"], tags: ["후속 필요", "중요"] },
  places: {
    categories: ["한식", "일식", "카페", "미팅용", "회식", "기타"],
    tags: ["추천", "단골", "조용함", "주차"],
  },
};

const KB_IDS: KbSectionId[] = ["book", "lecture", "knowledge"];

const CALENDAR_COLORS = [
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

function cleanList(raw: unknown, max = 40): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s || s.length > 30 || out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function mergeKbSection(raw: unknown, fallback: KbSectionPresets): KbSectionPresets {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const categories = cleanList(o.categories);
  const tags = cleanList(o.tags);
  return {
    categories: categories.length ? categories : [...fallback.categories],
    tags: tags.length ? tags : [...fallback.tags],
  };
}

function mergeCalendars(raw: unknown): CalendarPreset[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PREFERENCES.calendar.calendars];
  const out: CalendarPreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const color = String(o.color ?? "").trim();
    const id = String(o.id ?? "").trim() || `cal-${out.length + 1}`;
    if (!name || !/^#[0-9A-Fa-f]{6}$/.test(color)) continue;
    if (out.some((x) => x.name === name)) continue;
    out.push({ id, name, color });
    if (out.length >= 12) break;
  }
  return out.length ? out : [...DEFAULT_PREFERENCES.calendar.calendars];
}

export function mergePreferences(raw: unknown): UserPreferences {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacyTags = cleanList(o.contactTags);
  const contactsRaw = o.contacts && typeof o.contacts === "object" ? (o.contacts as Record<string, unknown>) : {};
  const kbRaw = o.kb && typeof o.kb === "object" ? (o.kb as Record<string, unknown>) : {};
  const meetingRaw = o.meeting && typeof o.meeting === "object" ? (o.meeting as Record<string, unknown>) : {};
  const placesRaw = o.places && typeof o.places === "object" ? (o.places as Record<string, unknown>) : {};
  const calendarRaw = o.calendar && typeof o.calendar === "object" ? (o.calendar as Record<string, unknown>) : {};

  const kb = {} as Record<KbSectionId, KbSectionPresets>;
  for (const id of KB_IDS) {
    kb[id] = mergeKbSection(kbRaw[id], DEFAULT_PREFERENCES.kb[id]);
  }

  const groups = cleanList(contactsRaw.groups);
  const contactTags = cleanList(contactsRaw.tags);
  const tags = contactTags.length ? contactTags : legacyTags.length ? legacyTags : [...DEFAULT_PREFERENCES.contacts.tags];

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
      tags: cleanList(meetingRaw.tags).length
        ? cleanList(meetingRaw.tags)
        : [...DEFAULT_PREFERENCES.meeting.tags],
    },
    places: {
      categories: cleanList(placesRaw.categories).length
        ? cleanList(placesRaw.categories)
        : [...DEFAULT_PREFERENCES.places.categories],
      tags: cleanList(placesRaw.tags).length
        ? cleanList(placesRaw.tags)
        : [...DEFAULT_PREFERENCES.places.tags],
    },
  };
}

export function normalizePreferencesPatch(patch: unknown): UserPreferences {
  return mergePreferences(patch);
}

export { CALENDAR_COLORS };
