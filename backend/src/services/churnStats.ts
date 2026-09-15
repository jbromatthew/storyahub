/**
 * 이탈 통계 — 로우데이터를 어느 각도로든 세어 본다.
 *
 * 세일즈 통계와 같은 방식으로 비교군을 여럿 놓고 견준다.
 * 자를 축은 이탈사유·업종·요금제·구분·이탈프로그램 중에서 고른다.
 */
import { prisma } from "../db.js";

export const CHURN_AXES = [
  { k: "reason", t: "이탈사유" },
  { k: "industry", t: "업종" },
  { k: "plan", t: "요금제" },
  { k: "kind", t: "구분" },
  { k: "program", t: "이탈프로그램" },
  { k: "joinYear", t: "가입 연도" },
] as const;

export type ChurnAxis = (typeof CHURN_AXES)[number]["k"];
export type ChurnGroup = { id: string; label: string; months: string[] };

/**
 * 이탈률 — 분모가 달라 셋을 따로 낸다.
 *   전체   = 총 이탈 ÷ 활성센터
 *   중도   = 중도이탈 ÷ 당월 정기결제수
 *   전환   = 전환이탈 ÷ 전환결제 해야 하는 대상수(재결제 수)
 * 건수·분모는 「월간 추이」 시트가 세어 둔 값을 그대로 쓴다.
 */
export type ChurnRates = {
  months: number;
  activeCenters: number | null;   // 기간 마지막 달 기준
  recurring: number; renewDue: number;
  churnTotal: number; churnMid: number; churnConv: number;
  totalRate: number | null; midRate: number | null; convRate: number | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function churnRatesFor(months: string[]): Promise<ChurnRates> {
  const rows = await prisma.erpChurnMonthly.findMany({
    where: { month: { in: months } },
    orderBy: { month: "asc" },
  });
  const sum = (f: (r: (typeof rows)[number]) => number | null) =>
    rows.reduce((a, r) => a + (f(r) ?? 0), 0);
  const churnTotal = sum((r) => r.churnTotal);
  const churnMid = sum((r) => r.churnMid);
  const churnConv = sum((r) => r.churnConv);
  const recurring = sum((r) => r.recurring);
  const renewDue = sum((r) => r.renewDue);
  // 활성센터는 쌓는 값이 아니라 그 시점의 수다 — 기간 마지막 달을 쓴다
  const last = [...rows].reverse().find((r) => r.activeCenters != null);
  // 여러 달을 묶어 볼 때 전체 이탈률은 달마다의 분모를 더해 낸다
  const activeSum = sum((r) => r.activeCenters);
  return {
    months: rows.length,
    activeCenters: last?.activeCenters ?? null,
    recurring, renewDue, churnTotal, churnMid, churnConv,
    totalRate: pct(churnTotal, activeSum),
    midRate: pct(churnMid, recurring),
    convRate: pct(churnConv, renewDue),
  };
}

export async function getChurnMeta() {
  const rows = await prisma.erpChurnCenter.findMany({
    select: { month: true, industry: true, plan: true, reason: true, kind: true },
  });
  const uniq = (list: string[]) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  return {
    months: [...new Set(rows.map((r) => r.month))].filter(Boolean).sort((a, b) => b.localeCompare(a)),
    industries: uniq(rows.map((r) => r.industry)),
    plans: uniq(rows.map((r) => r.plan)),
    reasons: uniq(rows.map((r) => r.reason)),
    kinds: uniq(rows.map((r) => r.kind)),
    axes: CHURN_AXES,
    total: rows.length,
  };
}

/** 월별 이탈 수 — 추이용. 축과 상관없이 늘 같이 준다. */
export async function getChurnTimeline() {
  const [rows, trend] = await Promise.all([
    prisma.erpChurnCenter.groupBy({ by: ["month"], _count: { _all: true }, orderBy: { month: "asc" } }),
    prisma.erpChurnMonthly.findMany({ orderBy: { month: "asc" } }),
  ]);
  const byMonth = new Map(trend.map((t) => [t.month, t]));
  return rows.filter((r) => r.month).map((r) => {
    const t = byMonth.get(r.month);
    return {
      month: r.month,
      count: r._count._all,                  // 우리가 가진 로우데이터 줄 수
      activeCenters: t?.activeCenters ?? null,
      churnTotal: t?.churnTotal ?? null,     // 시트가 세어 둔 값
      churnMid: t?.churnMid ?? null,
      churnConv: t?.churnConv ?? null,
      totalRate: pct(t?.churnTotal ?? 0, t?.activeCenters ?? 0),
      midRate: pct(t?.churnMid ?? 0, t?.recurring ?? 0),
      convRate: pct(t?.churnConv ?? 0, t?.renewDue ?? 0),
    };
  });
}

export async function computeChurnStats(query: {
  groups: ChurnGroup[];
  axis: ChurnAxis;
  /** 함께 주면 축 × 이 축 교차표까지 만든다 (업종 × 이탈사유 처럼) */
  splitAxis?: ChurnAxis | "";
}) {
  const groups = (query.groups ?? []).filter((g) => g.months?.length);
  if (!groups.length) return { groups: [], items: [], axis: query.axis };

  const months = [...new Set(groups.flatMap((g) => g.months))];
  const rows = await prisma.erpChurnCenter.findMany({
    where: { month: { in: months } },
    select: { month: true, reason: true, industry: true, plan: true, kind: true, program: true, joinYear: true },
  });

  const byMonth = new Map<string, typeof rows>();
  for (const m of months) byMonth.set(m, []);
  for (const r of rows) byMonth.get(r.month)?.push(r);

  const perGroup = groups.map(() => new Map<string, number>());
  const totals = groups.map(() => 0);

  groups.forEach((g, gi) => {
    for (const m of g.months) {
      for (const r of byMonth.get(m) ?? []) {
        const v = String(r[query.axis] ?? "").trim() || "(빈칸)";
        perGroup[gi].set(v, (perGroup[gi].get(v) ?? 0) + 1);
        totals[gi] += 1;
      }
    }
  });

  const keys = [...new Set(perGroup.flatMap((m) => [...m.keys()]))];
  const items = keys.map((label) => {
    const byGroup = perGroup.map((m, gi) => {
      const n = m.get(label) ?? 0;
      return { count: n, share: totals[gi] ? Math.round((n / totals[gi]) * 1000) / 10 : 0 };
    });
    return { label, byGroup, total: byGroup.reduce((a, x) => a + x.count, 0) };
  })
    // 비교군마다 순서가 흔들리면 눈으로 좇기 어렵다 — 전체 합으로 한 번만 세운다
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ko"));

  // 교차표 — 축 × 쪼갤 축. 비교군마다 한 장씩 만든다.
  const split = query.splitAxis && query.splitAxis !== query.axis ? query.splitAxis : "";
  const matrix = !split ? [] : groups.map((g, gi) => {
    const cell = new Map<string, Map<string, number>>();
    const colTotal = new Map<string, number>();
    for (const m of g.months) {
      for (const r of byMonth.get(m) ?? []) {
        const row = String(r[query.axis] ?? "").trim() || "(빈칸)";
        const colK = String(r[split as ChurnAxis] ?? "").trim() || "(빈칸)";
        const line = cell.get(row) ?? new Map<string, number>();
        line.set(colK, (line.get(colK) ?? 0) + 1);
        cell.set(row, line);
        colTotal.set(colK, (colTotal.get(colK) ?? 0) + 1);
      }
    }
    const cols = [...colTotal.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .map(([label, total]) => ({ label, total }));
    const rows = [...cell.entries()]
      .map(([label, line]) => ({
        label,
        total: [...line.values()].reduce((a, b) => a + b, 0),
        cells: cols.map((c) => line.get(c.label) ?? 0),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ko"));
    return { groupId: g.id, label: g.label, cols, rows, total: totals[gi] };
  });

  const rates = await Promise.all(groups.map((g) => churnRatesFor(g.months)));

  return {
    axis: query.axis,
    splitAxis: split,
    groups: groups.map((g, gi) => ({ ...g, total: totals[gi], rates: rates[gi] })),
    items,
    matrix,
  };
}
