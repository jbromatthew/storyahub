/**
 * 센터 여정관리 — CRM 센터를 우리 DB로 하루 1회 받아 둔다.
 *
 * 여정의 축은 group_key다. 새로 쌓는 기록(AS·자산·접점)은 전부 이 값으로
 * 매달리므로 이름 추측 매칭이 필요 없다. 과거 결제주문내역은 붙이지 않는다.
 *
 * 문자포인트는 매일 찍어 둔다 — 오른 날은 충전, 내린 만큼이 소진이다.
 * 결제주문내역을 안 쓰기로 해서 충전 이력을 여기서 만든다.
 */
import { prisma } from "../db.js";
import { crmGroups, crmGroupCount } from "./openApiGateway.js";

const PAGE = 200;
const PARALLEL = 6;

/** KST 기준 오늘 (YYYY-MM-DD) */
export function kstDate(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  // CRM은 미접속을 1970-01-01로 준다 — 값 없음으로 본다
  return d.getFullYear() < 1990 ? null : d;
}

type CrmItem = {
  group?: Record<string, unknown>;
  ticket?: Record<string, unknown>;
  information?: Record<string, unknown>;
  primary_information?: Record<string, unknown>;
};

function shape(item: CrmItem) {
  const g = item.group ?? {};
  const t = item.ticket ?? {};
  const info = item.information ?? {};
  const pi = item.primary_information ?? {};
  const biz = String(g.business_number ?? "").trim();

  return {
    groupKey: Number(g.key),
    name: String(g.name ?? ""),
    primaryName: String(g.primary_name ?? ""),
    // 미입력분이 문자열 "undefined"로 오는 경우가 있어 걸러낸다
    bizNo: biz && biz !== "undefined" ? biz.replace(/[^\d]/g, "") : "",
    ownerName: String(pi.member_name ?? ""),
    ownerId: String(pi.member_id ?? ""),
    ownerPhone: String(pi.member_phone ?? ""),
    phone: String(g.main_phone_number ?? ""),
    types: Array.isArray(g.group_types) ? (g.group_types as string[]) : [],
    paymentStatus: String(g.payment_status ?? ""),
    ticketName: t.name ? String(t.name) : "",
    ticketExpiredAt: asDate(t.expired_at),
    ticketRegular: t.is_regularly === true,
    messagePoint: Number(g.remain_message_service_point) || 0,
    installTeam: String(info.installer_team_name ?? ""),
    kioskKeys: Object.entries(info).filter(([k, v]) => k.startsWith("use_kiosk_") && v === true).map(([k]) => k),
    crmCreatedAt: asDate(g.created_at),
    lastAccessedAt: asDate(g.last_accessed_at),
  };
}

export type SyncResult = {
  total: number;
  fetched: number;
  coverage: number; // 0~1
  passes: number;
  added: number;
  updated: number;
  snapped: number;
  charges: number;
  ms: number;
};

/**
 * CRM 페이징은 안정적이지 않다. 정렬 기준이 이용권 만료일 하나뿐인데 동점이 많아
 * 페이지마다 순서가 흔들린다 — 한 번 훑으면 20%가 빠지고 그만큼 중복이 온다
 * (실측: 9,369건 중 고유 7,538건).
 *
 * 그래서 정렬 방향과 상태 필터를 바꿔가며 여러 번 훑어 합집합을 만든다.
 * 새로 나오는 게 없어질 때까지 돌리면 실측 99% 이상 모인다. 매일 도는 작업이라
 * 남은 몇 건도 다음 날 채워진다.
 */
async function collectAll(): Promise<{ items: Map<number, CrmItem>; total: number; passes: number }> {
  const total = Number((await crmGroupCount({ groupFirstFilter: "ALL" }))?.result) || 0;
  const items = new Map<number, CrmItem>();

  const sweep = async (first: string, sort: string) => {
    const t = Number((await crmGroupCount({ groupFirstFilter: first }))?.result) || 0;
    const pages = Math.ceil(t / PAGE);
    for (let i = 0; i < pages; i += PARALLEL) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(PARALLEL, pages - i) }, (_, j) =>
          crmGroups({ groupFirstFilter: first, page: i + j, size: PAGE, sort }).catch(() => ({ result: [] })),
        ),
      );
      for (const b of batch) {
        for (const it of (b?.result ?? []) as CrmItem[]) {
          const k = Number(it.group?.key);
          if (Number.isFinite(k) && k > 0) items.set(k, it);
        }
      }
    }
  };

  const plan: [string, string][] = [
    ["ALL", "CLOSED_DTTM_DESC"],
    ["ALL", "CLOSED_DTTM_ASC"],
    ["EXPIRATION", "CLOSED_DTTM_DESC"],
    ["ACTIVE", "CLOSED_DTTM_ASC"],
    ["EXPIRATION", "CLOSED_DTTM_ASC"],
    ["ACTIVE", "CLOSED_DTTM_DESC"],
    ["ISSUE", "CLOSED_DTTM_DESC"],
    ["ISSUE", "CLOSED_DTTM_ASC"],
  ];

  let passes = 0;
  for (const [first, sort] of plan) {
    const before = items.size;
    await sweep(first, sort);
    passes++;
    const gained = items.size - before;
    // 다 모았거나 더는 안 늘면 그만
    if (items.size >= total) break;
    if (passes >= 4 && gained < 5) break;
  }
  // 그래도 모자라면 ALL을 번갈아 몇 번 더
  for (let i = 0; items.size < total && i < 4; i++) {
    const before = items.size;
    await sweep("ALL", i % 2 ? "CLOSED_DTTM_ASC" : "CLOSED_DTTM_DESC");
    passes++;
    if (items.size - before < 3) break;
  }
  return { items, total, passes };
}

/** CRM 센터 전수를 받아 마스터를 갱신하고, 문자포인트 스냅샷을 남긴다 */
export async function syncCenters(): Promise<SyncResult> {
  const t0 = Date.now();
  const { items: collected, total, passes } = await collectAll();
  const rows = [...collected.values()].map(shape).filter((r) => Number.isFinite(r.groupKey) && r.groupKey > 0);
  const date = kstDate();

  const existing = await prisma.erpCenter.findMany({ select: { groupKey: true } });
  const known = new Set(existing.map((e) => e.groupKey));

  // 직전 스냅샷 — 델타를 내려면 필요하다
  const prevSnaps = await prisma.erpCenterPointSnap.findMany({
    where: { date: { lt: date } },
    orderBy: { date: "desc" },
    take: 20000,
  });
  const lastPoint = new Map<number, number>();
  for (const s of prevSnaps) if (!lastPoint.has(s.groupKey)) lastPoint.set(s.groupKey, s.point);

  let added = 0, updated = 0, snapped = 0, charges = 0;
  const events: { groupKey: number; occurredAt: Date; type: string; title: string; body: string; team: string; amount: number }[] = [];

  for (const r of rows) {
    const { groupKey, ...data } = r;
    await prisma.erpCenter.upsert({
      where: { groupKey },
      create: { groupKey, ...data, crmSyncedAt: new Date() },
      update: { ...data, crmSyncedAt: new Date() },
    });
    known.has(groupKey) ? updated++ : added++;

    const prev = lastPoint.get(groupKey);
    const delta = prev === undefined ? 0 : r.messagePoint - prev;
    await prisma.erpCenterPointSnap.upsert({
      where: { groupKey_date: { groupKey, date } },
      create: { groupKey, date, point: r.messagePoint, delta },
      update: { point: r.messagePoint, delta },
    });
    snapped++;

    // 포인트가 올랐으면 충전으로 본다 — 이게 문자충전 이력이 된다
    if (delta > 0) {
      charges++;
      events.push({
        groupKey,
        occurredAt: new Date(),
        type: "point",
        title: `문자포인트 충전 ${delta.toLocaleString()}P`,
        body: `잔액 ${prev!.toLocaleString()} → ${r.messagePoint.toLocaleString()}P`,
        team: "system",
        amount: delta,
      });
    }
  }

  if (events.length) {
    await prisma.erpCenterEvent.createMany({ data: events });
  }

  return {
    total,
    fetched: rows.length,
    coverage: total ? rows.length / total : 0,
    passes,
    added,
    updated,
    snapped,
    charges,
    ms: Date.now() - t0,
  };
}

/** 매일 KST 05:10에 한 번. 토큰이 없으면 조용히 넘어간다. */
let lastRunDate = "";
export function startCenterSync(): void {
  setInterval(() => {
    const now = new Date(Date.now() + 9 * 3600_000);
    const hhmm = now.toISOString().slice(11, 16);
    const date = now.toISOString().slice(0, 10);
    if (hhmm !== "05:10" || lastRunDate === date) return;
    lastRunDate = date;
    console.log(`[center-sync] run ${date} 05:10 (KST)`);
    void syncCenters()
      .then((r) =>
        console.log(
          `[center-sync] ok — 센터 ${r.fetched}/${r.total} (${(r.coverage * 100).toFixed(1)}%, ${r.passes}회 훑음) ` +
            `· 신규 ${r.added} · 스냅샷 ${r.snapped} · 충전 ${r.charges} · ${(r.ms / 1000).toFixed(1)}s`,
        ),
      )
      .catch((e) => console.error("[center-sync] failed:", (e as Error).message));
  }, 30 * 1000);
}
