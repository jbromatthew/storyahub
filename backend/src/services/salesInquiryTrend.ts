import { prisma } from "../db.js";
import { env } from "../env.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";
import type { TrendColumn, TrendRow } from "./salesTrend.js";

/** 문의 월간 추이 — 상품문의 DB(ErpSalesInquiry, 구분=신규문의) 기준 실시간 집계 */

export const INQUIRY_TREND_TABS = {
  industry: { id: "industry", label: "업종별" },
  "industry-plan": { id: "industry-plan", label: "업종X요금제" },
  "industry-prev": { id: "industry-prev", label: "업종X직전서비스" },
  "industry-feature": { id: "industry-feature", label: "업종X문의기능" },
  "industry-channel-plan": { id: "industry-channel-plan", label: "업종X문의채널X요금제" },
} as const;

export type InquiryTrendTabId = keyof typeof INQUIRY_TREND_TABS;

export type InquiryTrendData = {
  tab: InquiryTrendTabId;
  source: "inquiry";
  filterLabel: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  mode: "industry-cross";
  months: string[];
  columns: TrendColumn[];
  rows: TrendRow[];
  industries: string[];
  selectedIndustries: string[];
  allIndustries: boolean;
  rowCount: number;
  syncedThrough?: string | null;
};

const INQUIRY_TYPE = "신규문의";

const PLAN_ORDER = [
  "Trial",
  "Starter",
  "Lite",
  "Basic",
  "Essential",
  "Standard",
  "Pos",
  "커스텀요금제",
  "알 수 없음",
  "기타",
];

type InquiryRecord = {
  month: string;
  industry: string;
  plan: string;
  prevService: string;
  feature: string;
  channel: string;
};

function inquirySpreadsheetId(): string {
  return env.googleSheets.inquirySpreadsheetId;
}

function normalizeMonthLabel(sheetName: string): string {
  const m = sheetName.trim().match(/^(\d{4})\.(\d{2})/);
  if (!m) return sheetName.trim();
  return `${m[1]}-${m[2]}`;
}

function monthSortKey(label: string): number {
  const m = label.match(/^(\d{4})-(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

function field(data: Record<string, string>, key: string, fallback: string): string {
  const raw = (data[key] || "").trim();
  return raw || fallback;
}

function sortLabels(labels: string[], preferred: readonly string[]): string[] {
  const order = new Map(preferred.map((label, i) => [label, i]));
  return [...labels].sort((a, b) => {
    const ai = order.get(a);
    const bi = order.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b, "ko");
  });
}

async function loadInquiryRecords(): Promise<InquiryRecord[]> {
  const spreadsheetId = inquirySpreadsheetId();
  const rows = await prisma.erpSalesInquiry.findMany({
    where: { spreadsheetId },
    select: { data: true, sheetName: true },
  });

  const records: InquiryRecord[] = [];
  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== INQUIRY_TYPE) continue;
    const month = normalizeMonthLabel(row.sheetName);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    records.push({
      month,
      industry: field(data, "업종", "확인불가"),
      plan: field(data, "문의요금제", "알 수 없음"),
      prevService: field(data, "직전서비스", "없음/미기재"),
      feature: field(data, "문의기능", "미기재"),
      channel: field(data, "마케팅채널", "기타"),
    });
  }
  return records;
}

function dimensionPick(tab: InquiryTrendTabId): (r: InquiryRecord) => string {
  switch (tab) {
    case "industry":
      return (r) => r.industry;
    case "industry-prev":
      return (r) => r.prevService;
    case "industry-feature":
      return (r) => r.feature;
    case "industry-channel-plan":
      return (r) => `${r.channel} · ${r.plan}`;
    default:
      return (r) => r.plan;
  }
}

function preferredOrder(tab: InquiryTrendTabId): readonly string[] {
  if (tab === "industry") return INDUSTRY_TYPES;
  return tab === "industry-plan" ? PLAN_ORDER : [];
}

export function listInquiryTrendTabs() {
  return Object.values(INQUIRY_TREND_TABS);
}

export async function getInquiryTrendData(
  tab: InquiryTrendTabId,
  opts?: { industries?: string[]; all?: boolean }
): Promise<InquiryTrendData> {
  const meta = INQUIRY_TREND_TABS[tab];
  if (!meta) throw new Error("유효하지 않은 추이 탭입니다");

  const records = await loadInquiryRecords();
  const industries = sortLabels(
    [...new Set(records.map((r) => r.industry))],
    INDUSTRY_TYPES
  );

  // 업종별 탭 또는 전체 종합: 업종 필터 없이 전 업종 집계
  const allIndustries = tab === "industry" || !!opts?.all;
  const requested = (opts?.industries || []).filter((name) => industries.includes(name));
  const selectedIndustries = allIndustries
    ? []
    : requested.length
      ? requested
      : industries[0]
        ? [industries[0]]
        : [];

  const industrySet = new Set(selectedIndustries);
  const filtered = selectedIndustries.length
    ? records.filter((r) => industrySet.has(r.industry))
    : records;

  const pick = dimensionPick(tab);
  const monthSet = new Set<string>();
  const dimCounts = new Map<string, Map<string, number>>();
  for (const rec of filtered) {
    monthSet.add(rec.month);
    const dim = pick(rec);
    const byDim = dimCounts.get(rec.month) ?? new Map<string, number>();
    byDim.set(dim, (byDim.get(dim) ?? 0) + 1);
    dimCounts.set(rec.month, byDim);
  }

  const months = [...monthSet].sort((a, b) => monthSortKey(a) - monthSortKey(b));
  const dimLabels = sortLabels(
    [...new Set(filtered.map((r) => pick(r)))],
    preferredOrder(tab)
  );

  const columns: TrendColumn[] = [
    { key: "total", label: "합계", kind: "total" },
    ...dimLabels.map((label) => ({
      key: `d:${label}`,
      label,
      kind: "dimension" as const,
    })),
  ];

  const rows: TrendRow[] = months.map((month) => {
    const byDim = dimCounts.get(month) ?? new Map<string, number>();
    const values: Record<string, number | null> = {};
    let total = 0;
    for (const col of columns) {
      if (col.key === "total") continue;
      const val = byDim.get(col.label) ?? 0;
      values[col.key] = val;
      total += val;
    }
    values.total = total;
    return { month, values };
  });

  const latest = await prisma.erpSalesInquiry.findFirst({
    where: { spreadsheetId: inquirySpreadsheetId() },
    orderBy: { syncedAt: "desc" },
    select: { sheetName: true },
  });

  return {
    tab,
    source: "inquiry",
    filterLabel: INQUIRY_TYPE,
    spreadsheetId: inquirySpreadsheetId(),
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${inquirySpreadsheetId()}/edit`,
    mode: "industry-cross",
    months,
    columns,
    rows,
    industries,
    selectedIndustries,
    allIndustries,
    rowCount: records.length,
    syncedThrough: latest?.sheetName ?? null,
  };
}
