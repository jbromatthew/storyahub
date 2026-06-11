import { prisma } from "../db.js";
import { headObjectSize, listUserObjects, r2Configured } from "./r2.js";

const TRIAL_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

type BreakdownKey = "meetings" | "contacts" | "deals" | "todos" | "kb" | "other";

const BREAKDOWN_LABEL: Record<BreakdownKey, string> = {
  meetings: "녹음 · 기록",
  contacts: "명함 · 인맥",
  deals: "딜 · 견적서",
  todos: "할 일 첨부",
  kb: "지식백과",
  other: "기타",
};

function emptyBreakdown() {
  return (Object.keys(BREAKDOWN_LABEL) as BreakdownKey[]).map((k) => ({
    key: k,
    label: BREAKDOWN_LABEL[k],
    bytes: 0,
    count: 0,
  }));
}

function collectKbMediaKeys(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  const keys: string[] = [];
  for (const b of blocks) {
    if (b && typeof b === "object" && "mediaKey" in b && typeof (b as { mediaKey?: string }).mediaKey === "string") {
      keys.push((b as { mediaKey: string }).mediaKey);
    }
  }
  return keys;
}

export async function getUserUsage(userId: string) {
  const [contacts, meetings, todos, deals, kbArticles] = await Promise.all([
    prisma.contact.findMany({ where: { userId }, select: { cardImageKey: true } }),
    prisma.meeting.findMany({ where: { userId }, select: { mediaKey: true } }),
    prisma.todo.findMany({ where: { userId }, select: { attachments: true } }),
    prisma.deal.findMany({ where: { userId }, select: { quoteKey: true } }),
    prisma.kbArticle.findMany({ where: { userId }, select: { blocks: true } }),
  ]);

  const keyCategory = new Map<string, BreakdownKey>();
  for (const m of meetings) {
    if (m.mediaKey) keyCategory.set(m.mediaKey, "meetings");
  }
  for (const c of contacts) {
    if (c.cardImageKey) keyCategory.set(c.cardImageKey, "contacts");
  }
  for (const d of deals) {
    if (d.quoteKey) keyCategory.set(d.quoteKey, "deals");
  }
  for (const t of todos) {
    const attachments = Array.isArray(t.attachments) ? (t.attachments as { key?: string }[]) : [];
    for (const a of attachments) {
      if (a.key) keyCategory.set(a.key, "todos");
    }
  }
  for (const a of kbArticles) {
    for (const key of collectKbMediaKeys(a.blocks)) keyCategory.set(key, "kb");
  }

  const breakdown = emptyBreakdown();
  const bump = (cat: BreakdownKey, bytes: number) => {
    const row = breakdown.find((b) => b.key === cat)!;
    row.bytes += bytes;
    row.count += 1;
  };

  let usedBytes = 0;
  let fileCount = 0;
  let source: "r2" | "db" = "r2";

  if (r2Configured()) {
    const objects = await listUserObjects(userId);
    fileCount = objects.length;
    for (const o of objects) {
      usedBytes += o.size;
      const cat = keyCategory.get(o.key) ?? "other";
      bump(cat, o.size);
    }
  } else {
    source = "db";
    const keys = [...keyCategory.keys()];
    fileCount = keys.length;
    const sizes = await Promise.all(keys.map((k) => headObjectSize(k).catch(() => 0)));
    keys.forEach((key, i) => {
      const size = sizes[i];
      usedBytes += size;
      bump(keyCategory.get(key) ?? "other", size);
    });
  }

  const limitBytes = TRIAL_STORAGE_BYTES;
  const percent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10) : 0;

  return {
    storage: {
      usedBytes,
      limitBytes,
      limitLabel: "5GB",
      fileCount,
      percent,
      source,
      breakdown: breakdown.filter((b) => b.count > 0 || b.bytes > 0),
    },
    counts: {
      contacts: contacts.length,
      meetings: meetings.length,
      todos: todos.length,
      kbArticles: kbArticles.length,
      deals: deals.length,
    },
  };
}
