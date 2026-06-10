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
    dist: c.lat && c.lng ? "근처" : "",
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

export function todoToUi(t) {
  return {
    id: t.id,
    t: t.title,
    status: t.status || "todo",
    pri: t.priority || "mid",
    due: t.due ? formatDue(t.due) : "-",
    done: t.status === "done",
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
    contact: m.contact || null,
    contactId: m.contactId || null,
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

export function kbCategories(articles, defaults = ["영업 노하우", "강의 노트", "제품 자료", "시장 조사"]) {
  const fromData = articles.map((a) => a.c).filter((c) => c && c !== "미분류");
  return ["전체", ...Array.from(new Set([...defaults, ...fromData]))];
}
