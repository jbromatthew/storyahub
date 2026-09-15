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
  const rows = await prisma.erpChurnCenter.groupBy({
    by: ["month"],
    _count: { _all: true },
    orderBy: { month: "asc" },
  });
  return rows.filter((r) => r.month).map((r) => ({ month: r.month, count: r._count._all }));
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

  return {
    axis: query.axis,
    splitAxis: split,
    groups: groups.map((g, gi) => ({ ...g, total: totals[gi] })),
    items,
    matrix,
  };
}
