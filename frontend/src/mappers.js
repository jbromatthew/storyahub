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
    _raw: t,
  };
}

export function eventToUi(e) {
  const d = new Date(e.startsAt);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return {
    id: e.id,
    time,
    title: e.title,
    place: e.place || "",
    dateKey: `${d.getFullYear()}-${month}-${day}`,
    day,
    month,
    year: d.getFullYear(),
    contactId: e.contactId || null,
    _raw: e,
  };
}

export function kbToUi(a) {
  const d = a.updatedAt || a.createdAt;
  const date = d ? new Date(d) : null;
  return {
    id: a.id,
    t: a.title,
    c: a.category || "미분류",
    d: date
      ? `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
      : "",
    tags: a.tags || [],
    blocks: a.blocks || [],
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
  return {
    id: m.id,
    t: m.oneLine || m.summary?.one_line || "기록",
    d: `${label} · 기록`,
    oneLine: m.oneLine || m.summary?.one_line || "",
    mediaKey: m.mediaKey || null,
    source: m.source || "live",
    summary: m.summary || null,
    createdLabel: d ? formatWhen(m.createdAt) : "",
    hasAudio: isAudioMediaKey(m.mediaKey),
    contact: m.contact || null,
    contactId: m.contactId || null,
    todoCount: Array.isArray(m.todos) ? m.todos.length : 0,
    openTodoCount: Array.isArray(m.todos) ? m.todos.filter((t) => t.status !== "done").length : 0,
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

export function kbCategories(articles) {
  const fromData = articles.map((a) => a.c).filter((c) => c && c !== "미분류");
  return ["전체", ...Array.from(new Set(fromData)).sort()];
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
  if (blocks.some((b) => b.type === "cover" && b.mediaKey)) return { color, icon: "img" };
  if (blocks.some((b) => b.type === "image" && b.mediaKey)) return { color, icon: "img" };
  if (blocks.some((b) => b.type === "file")) return { color, icon: "file" };
  return { color, icon: "book" };
}

export function kbDateLabel(article) {
  if (article?.d) return article.d.replace(/^\d{2}\./, (m) => `${parseInt(m, 10)}월 `).replace(".", "일");
  return article?.createdLabel || "";
}
