import { prisma } from "../db.js";
import { getAccessStatus } from "./access.js";
import { PLAN_LIMITS, type PlanId } from "./plans.js";
import { headObjectSize, listUserObjects, r2Configured } from "./r2.js";

type BreakdownKey = "meetings" | "contacts" | "deals" | "todos" | "kb" | "places" | "other";

const BREAKDOWN_LABEL: Record<BreakdownKey, string> = {
  meetings: "녹음 · 기록",
  contacts: "명함 · 인맥",
  deals: "딜 · 견적서",
  todos: "할 일 첨부",
  kb: "지식백과",
  places: "맛집 · 장소",
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

function formatLimitLabel(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${Math.round(bytes / 1024 ** 4)}TB`;
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)}GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

export async function getUserUsage(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("not found");

  const access = getAccessStatus(user);
  const limitBytes = access.storageLimitBytes;

  const [contacts, meetings, todos, deals, kbArticles, savedPlaces] = await Promise.all([
    prisma.contact.findMany({ where: { userId }, select: { cardImageKey: true } }),
    prisma.meeting.findMany({ where: { userId }, select: { mediaKey: true } }),
    prisma.todo.findMany({ where: { userId }, select: { attachments: true } }),
    prisma.deal.findMany({ where: { userId }, select: { quoteKey: true } }),
    prisma.kbArticle.findMany({ where: { userId }, select: { blocks: true } }),
    prisma.savedPlace.findMany({ where: { userId }, select: { photoKeys: true } }),
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
  for (const p of savedPlaces) {
    for (const key of p.photoKeys ?? []) {
      if (key) keyCategory.set(key, "places");
    }
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

  const percent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10) : 0;
  const plan = access.plan as PlanId | null;

  const MS_DAY = 86400000;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [lifetimeAgg, thisMonthAgg, lastMonthAgg] = await Promise.all([
    prisma.recordingUsageEvent.aggregate({
      where: { userId },
      _sum: { seconds: true },
      _count: true,
    }),
    prisma.recordingUsageEvent.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { seconds: true },
    }),
    prisma.recordingUsageEvent.aggregate({
      where: { userId, createdAt: { gte: lastMonthStart, lt: monthStart } },
      _sum: { seconds: true },
    }),
  ]);

  let periodResetAt: string | null = null;
  if (access.reason === "paid" && !access.lifetimeAccess && user.recordingPeriodStart) {
    periodResetAt = new Date(user.recordingPeriodStart.getTime() + 30 * MS_DAY).toISOString();
  }

  return {
    access: {
      isTrial: access.isTrial,
      hasAccess: access.hasAccess,
      allowFileUpload: access.allowFileUpload,
      recordingUsedSec: access.recordingUsedSec,
      recordingLimitSec: access.recordingLimitSec,
      recordingLimitLabel:
        access.recordingLimitSec >= 3600
          ? `${Math.round(access.recordingLimitSec / 3600)}시간`
          : `${Math.round(access.recordingLimitSec / 60)}분`,
      purgeAt: access.purgeAt,
      periodResetAt,
    },
    recording: {
      periodUsedSec: access.recordingUsedSec,
      periodLimitSec: access.recordingLimitSec,
      periodResetAt,
      lifetimeUsedSec: lifetimeAgg._sum.seconds ?? 0,
      lifetimeSessionCount: lifetimeAgg._count,
      thisMonthSec: thisMonthAgg._sum.seconds ?? 0,
      lastMonthSec: lastMonthAgg._sum.seconds ?? 0,
    },
    storage: {
      usedBytes,
      limitBytes,
      limitLabel: formatLimitLabel(limitBytes),
      fileCount,
      percent,
      source,
      breakdown: breakdown.filter((b) => b.count > 0 || b.bytes > 0),
    },
    plan: plan ? PLAN_LIMITS[plan] : null,
    counts: {
      contacts: contacts.length,
      meetings: meetings.length,
      todos: todos.length,
      kbArticles: kbArticles.length,
      deals: deals.length,
      savedPlaces: savedPlaces.length,
    },
  };
}
