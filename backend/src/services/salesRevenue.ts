import { env } from "../env.js";
import { batchGetRanges, listMonthSheets } from "./googleSheets.js";

// 매출 분석 — 결제주문내역 시트의 월 탭에서 직접 읽음 (동기화 불필요)
// NBM: 각 월 탭 오른쪽 요약 블록(EM3~ES28, 사장님이 나눠둔 기준) — ER3 = NBM 총매출
// EBM: 같은 블록 옆 문자 충전(EW3)·수수료(EW4)
// NBM 담당자별: 행별 총매출(DQ) 합산에서 문자 충전·수수료·취소/환불 구분 제외 (ER3와 일치 검증됨)

const EXCLUDED_GUBUN = new Set(["문자 충전", "수수료", "취소/환불"]);

function num(v: unknown): number {
  const n = Number(String(v ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type RevenueTrendPoint = { month: string; nbm: number | null; ebm: number | null };
export type RevenueDetail = {
  month: string;
  nbmTotal: number;
  nbmMargin: number;
  ebm: { total: number; margin: number; items: Array<{ label: string; amount: number; margin: number }> };
  categories: Array<{ group: string; item: string; amount: number; margin: number }>;
  assignees: Array<{ name: string; amount: number; share: number }>;
};

function orderId(): string {
  return env.googleSheets.orderSpreadsheetId;
}

/** 월 탭 목록 (2026.01. 이후 — NBM 요약 블록이 있는 탭) */
export async function listRevenueMonths(): Promise<string[]> {
  const months = await listMonthSheets(orderId());
  return months
    .filter((m) => {
      const mm = m.match(/^(\d{4})\.(\d{2})/);
      return mm && Number(mm[1]) * 100 + Number(mm[2]) >= 202601;
    })
    .sort((a, b) => a.localeCompare(b));
}

/** 월별 NBM/EBM 추이 (요약 블록만 batchGet) */
export async function getRevenueTrend(months: string[]): Promise<RevenueTrendPoint[]> {
  const ranges = months.flatMap((m) => [`'${m}'!ER3`, `'${m}'!EW3:EX4`]);
  const out = await batchGetRanges(orderId(), ranges);
  return months.map((m, i) => {
    const nbmGrid = out[i * 2] ?? [];
    const ebmGrid = out[i * 2 + 1] ?? [];
    const nbmRaw = nbmGrid[0]?.[0];
    const nbm = String(nbmRaw ?? "").trim() ? num(nbmRaw) : null;
    const ebm = ebmGrid.length ? num(ebmGrid[0]?.[0]) + num(ebmGrid[1]?.[0]) : null;
    return { month: m.replace(/\.$/, ""), nbm, ebm };
  });
}

/** 선택 월 상세 (카테고리 + 담당자별) */
export async function getRevenueDetail(month: string): Promise<RevenueDetail> {
  const m = month.endsWith(".") ? month : `${month}.`;
  const [block, ebmBlock, rows] = await batchGetRanges(orderId(), [
    `'${m}'!EN3:ES28`,
    `'${m}'!EU3:EX4`,
    `'${m}'!A2:DQ4000`,
  ]);

  // NBM 카테고리 (EN=대분류, EO=항목, ER=결과, ES=마진) — block[0]행이 EN3(총 매출)
  const categories: RevenueDetail["categories"] = [];
  let nbmTotal = 0;
  let nbmMargin = 0;
  let group = "";
  for (let r = 0; r < (block?.length ?? 0); r++) {
    const row = block[r] ?? [];
    const big = String(row[0] ?? "").trim(); // EN
    const item = String(row[1] ?? "").trim(); // EO
    const amount = num(row[4]); // ER
    const margin = num(row[5]); // ES
    if (r === 0) {
      nbmTotal = amount;
      nbmMargin = margin;
      continue;
    }
    if (big) group = big;
    if (!item && !big) continue;
    categories.push({ group, item: item || "-", amount, margin });
  }

  // EBM (EU=라벨, EW=결과, EX=마진)
  const ebmItems = (ebmBlock ?? [])
    .map((row) => ({ label: String(row[0] ?? "").trim(), amount: num(row[2]), margin: num(row[3]) }))
    .filter((it) => it.label);
  const ebm = {
    total: ebmItems.reduce((s, it) => s + it.amount, 0),
    margin: ebmItems.reduce((s, it) => s + it.margin, 0),
    items: ebmItems,
  };

  // 담당자별 NBM (행별 총매출 DQ, 제외 구분 필터)
  const byAssignee = new Map<string, number>();
  const DQ = 120; // A=0 기준 DQ 열 인덱스
  for (const row of rows ?? []) {
    const gubun = String(row[2] ?? "").trim();
    if (!gubun || EXCLUDED_GUBUN.has(gubun)) continue;
    const amt = num(row[DQ]);
    if (!amt) continue;
    const name = String(row[1] ?? "").trim() || "미지정";
    byAssignee.set(name, (byAssignee.get(name) ?? 0) + amt);
  }
  const sum = [...byAssignee.values()].reduce((s, v) => s + v, 0) || 1;
  const assignees = [...byAssignee.entries()]
    .map(([name, amount]) => ({ name, amount, share: Math.round((amount / sum) * 1000) / 10 }))
    .sort((a, b) => b.amount - a.amount);

  return { month: m.replace(/\.$/, ""), nbmTotal, nbmMargin, ebm, categories, assignees };
}
