function formatDue(iso) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff < 7 && diff > 0) return "이번주";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceKm(km) {
  if (km == null || Number.isNaN(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

/** 카카오맵 검색/길찾기용 — 우편번호 등 OCR 잡음 제거 */
export function addressForMaps(address) {
  if (!address) return "";
  let s = address.trim();
  s = s.replace(/^\d{5}[-\s]*/, "");
  s = s.replace(/^\(\s*(?:우\s*)?\d{5}\s*\)\s*/, "");
  s = s.replace(/^우\s*[)）:：]?\s*\d{5}\s*/, "");
  s = s.replace(/^우편(?:번호)?\s*[:：]?\s*\d{5}\s*/, "");
  return s.trim();
}

/** 카카오맵 길찾기 URL — 좌표 우선, 없으면 정제된 주소 검색 */
export function kakaoDirectionsUrl({ address, lat, lng, label = "목적지" }) {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://map.kakao.com/link/to/${encodeURIComponent(label)},${lat},${lng}`;
  }
  const q = addressForMaps(address);
  if (!q) return "";
  return `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;
}

export function contactToUi(c) {
  const co = c.company || "";
  const person = c.person || "";
  const init = (co || person || "?")[0];
  const created = c.createdAt ? new Date(c.createdAt) : null;
  const last = created
    ? `${String(created.getMonth() + 1).padStart(2, "0")}.${String(created.getDate()).padStart(2, "0")}`
    : "";
  return {
    id: c.id,
    person,
    co,
    phone: c.phone || "",
    email: c.email || "",
    group: c.group || "미분류",
    area: c.address || "",
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    dist: c.lat != null && c.lng != null ? "근처" : "",
    last,
    init,
    tags: c.tags || [],
    fav: !!c.favorite,
    won: c.wonAmount || 0,
    meets: c.meetCount || 0,
    refBy: c.referredById || null,
    _raw: c,
  };
}

export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todoSearchText(t) {
  const parts = [t.title, t.detail, t.result];
  const history = Array.isArray(t.history) ? t.history : [];
  for (const h of history) parts.push(h.what, h.who);
  const attachments = Array.isArray(t.attachments) ? t.attachments : [];
  for (const a of attachments) parts.push(a.name);
  const subs = Array.isArray(t.subs) ? t.subs : [];
  for (const s of subs) parts.push(s.text);
  return parts.filter(Boolean).join(" ").toLowerCase();
}

const TODO_STATUS_LABEL = { todo: "할 일", doing: "진행 중", done: "완료" };

export function todoToUi(t) {
  const attachments = Array.isArray(t.attachments) ? t.attachments : [];
  const history = Array.isArray(t.history) ? t.history : [];
  const subs = Array.isArray(t.subs) ? t.subs : [];
  const allSubsDone = subs.length > 0 && subs.every((s) => s.done);
  const done = subs.length ? allSubsDone : t.status === "done";
  return {
    id: t.id,
    t: t.title,
    status: t.status || "todo",
    statusLabel: TODO_STATUS_LABEL[t.status] || "할 일",
    pri: t.priority || "mid",
    due: t.due ? formatDue(t.due) : "-",
    done,
    subs,
    subDone: subs.filter((s) => s.done).length,
    subTotal: subs.length,
    result: t.result || "",
    createdLabel: t.createdAt ? formatWhen(t.createdAt) : "",
    attachments,
    history,
    attachmentCount: attachments.length,
    historyCount: history.length,
    meetingId: t.meetingId || null,
    contactId: t.contactId || null,
    _raw: t,
  };
}

export function eventToUi(e) {
  const d = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : null;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const endTime = end
    ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
    : null;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return {
    id: e.id,
    time,
    endTime,
    title: e.title,
    place: e.place || "",
    savedPlaceId: e.savedPlaceId || null,
    placeLat: e.placeLat ?? null,
    placeLng: e.placeLng ?? null,
    notes: e.notes || "",
    category: e.category || "캘린더",
    color: e.color || null,
    contactId: e.contactId || null,
    contactIds: e.contactIds || [],
    shareToken: e.shareToken || null,
    repeatYearly: !!e.repeatYearly,
    occurrenceYear: e._occurrenceYear ?? d.getFullYear(),
    dateKey: `${d.getFullYear()}-${month}-${day}`,
    day,
    month,
    year: d.getFullYear(),
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    reminders: e.reminders || [],
    _series: e._series || null,
    _raw: e,
  };
}

export const KB_SECTIONS = [
  { id: "book", label: "책", icon: "📚", desc: "독후감 · 책 표지" },
  { id: "lecture", label: "강연", icon: "🎤", desc: "세미나 · 강의 정리" },
  { id: "knowledge", label: "지식", icon: "💡", desc: "노하우 · 레퍼런스" },
];

export const KB_SECTION_DEFAULT_CATS = {
  book: ["문학", "비즈니스", "자기계발", "에세이"],
  lecture: ["세미나", "컨퍼런스", "강의", "워크숍"],
  knowledge: ["노하우", "레퍼런스", "메모", "아이디어"],
};

export function kbSectionLabel(section) {
  return KB_SECTIONS.find((s) => s.id === section)?.label || "지식";
}

export function kbToUi(a) {
  const d = a.updatedAt || a.createdAt;
  const date = d ? new Date(d) : null;
  const section = a.section || "knowledge";
  return {
    id: a.id,
    t: a.title,
    section,
    c: a.category || "미분류",
    d: date
      ? `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
      : "",
    tags: a.tags || [],
    blocks: a.blocks || [],
    bookMeta: a.bookMeta || null,
    _raw: a,
  };
}

export function isAudioMediaKey(key) {
  if (!key) return false;
  return /\.(webm|mp4|m4a|wav|mp3|ogg)$/i.test(key);
}

export function isImageMediaKey(key) {
  if (!key) return false;
  return /\.(png|jpe?g|webp|gif|heic)$/i.test(key);
}

export function meetingToUi(m) {
  const d = m.createdAt ? new Date(m.createdAt) : null;
  const label = d
    ? `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
    : "";
  const processStatus = m.processStatus || "done";
  const isProcessing = processStatus === "processing";
  const isFailed = processStatus === "error";
  const oneLine =
    isProcessing
      ? m.oneLine || "변환 중…"
      : isFailed
        ? m.oneLine || "변환 실패"
        : m.oneLine || m.summary?.one_line || "";
  return {
    id: m.id,
    t: oneLine || "기록",
    d: `${label} · 기록`,
    oneLine,
    mediaKey: m.mediaKey || null,
    source: m.source || "live",
    summary: m.summary || null,
    processStatus,
    processError: m.processError || "",
    isProcessing,
    isFailed,
    createdLabel: d ? formatWhen(m.createdAt) : "",
    hasAudio: isAudioMediaKey(m.mediaKey),
    contact: m.contact || null,
    contactId: m.contactId || null,
    todoCount: Array.isArray(m.todos) ? m.todos.length : 0,
    openTodoCount: Array.isArray(m.todos) ? m.todos.filter((t) => t.status !== "done").length : 0,
    category: m.category || "",
    tags: m.tags || [],
    eventId: m.eventId || m.event?.id || null,
    eventTitle: m.event?.title || "",
    eventStartsAt: m.event?.startsAt || null,
    _raw: m,
  };
}

export function contactGroups(contacts) {
  const gs = new Set();
  for (const c of contacts) {
    if (c.group && c.group !== "미분류") gs.add(c.group);
  }
  return ["전체", ...Array.from(gs).sort()];
}

export function kbCategories(articles, section = null) {
  const pool = section ? articles.filter((a) => (a.section || "knowledge") === section) : articles;
  const fromData = pool.map((a) => a.c).filter((c) => c && c !== "미분류");
  return ["전체", ...Array.from(new Set(fromData)).sort()];
}

export function kbCoverKey(article) {
  if (article?.bookMeta?.coverKey) return article.bookMeta.coverKey;
  const blocks = article?.blocks || [];
  const cover = blocks.find((b) => b.type === "cover");
  if (cover?.mediaKey) return cover.mediaKey;
  const img = blocks.find((b) => b.type === "image" && b.mediaKey);
  return img?.mediaKey || null;
}

const KB_COLORS = ["#C2491F", "#7A6FF0", "#3F9A6A", "#C9A23A", "#5C6BC0", "#DB2777"];

export function kbBlockText(b) {
  if (b?.val) return b.val;
  if (b?.type === "table" && b.rows) return b.rows.flat().join(" ");
  if (b?.name) return b.name;
  return "";
}

export function kbExcerpt(article, max = 90) {
  const blocks = article?.blocks || [];
  for (const b of blocks) {
    if (b.type === "cover") continue;
    const t = kbBlockText(b).trim();
    if (t) return t.length > max ? `${t.slice(0, max)}…` : t;
  }
  return "내용 미리보기 없음";
}

export function kbReadMinutes(article) {
  const blocks = article?.blocks || [];
  const chars = blocks.reduce((n, b) => n + kbBlockText(b).length, 0);
  return Math.max(1, Math.round(chars / 400));
}

export function kbFileCount(article) {
  return (article?.blocks || []).filter((b) => b.type === "file").length;
}

export function kbThumbMeta(article) {
  const blocks = article?.blocks || [];
  const id = article?.id || article?.t || "";
  const hash = [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const color = KB_COLORS[hash % KB_COLORS.length];
  const section = article?.section || "knowledge";
  if (kbCoverKey(article)) return { color, icon: "img" };
  if (section === "book") return { color, icon: "book" };
  if (section === "lecture") return { color, icon: "mic" };
  if (blocks.some((b) => b.type === "file")) return { color, icon: "file" };
  return { color, icon: "note" };
}

export function kbDateLabel(article) {
  if (article?.d) return article.d.replace(/^\d{2}\./, (m) => `${parseInt(m, 10)}월 `).replace(".", "일");
  return article?.createdLabel || "";
}

export function placeToUi(p) {
  const name = p.name || "";
  const init = name[0] || "🍽";
  const addr = p.roadAddress || p.address || "";
  return {
    id: p.id,
    name,
    init,
    category: p.category || "미분류",
    tags: p.tags || [],
    address: p.address || "",
    roadAddress: p.roadAddress || "",
    area: addr,
    phone: p.phone || "",
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    kakaoPlaceId: p.kakaoPlaceId || null,
    placeUrl: p.placeUrl || "",
    fav: !!p.favorite,
    notes: p.notes || "",
    photoKeys: p.photoKeys || [],
    _raw: p,
  };
}

export function placeGroups(list) {
  const cats = new Set(list.map((p) => p.category || "미분류"));
  return ["전체", ...Array.from(cats).sort()];
}
