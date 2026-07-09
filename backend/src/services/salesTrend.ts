import { prisma } from "../db.js";
import { env } from "../env.js";
import { parseOrderRowMonth } from "./googleSheets.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";

export const TREND_TABS = {
  "industry-plan": {
    id: "industry-plan",
    label: "업종X요금제",
  },
  "industry-channel": {
    id: "industry-channel",
    label: "업종X채널",
  },
  industry: {
    id: "industry",
    label: "업종",
  },
  plan: {
    id: "plan",
    label: "요금제",
  },
} as const;

export type TrendTabId = keyof typeof TREND_TABS;

export type TrendColumn = {
  key: string;
  label: string;
  kind: "total" | "dimension";
};

export type TrendRow = {
  month: string;
  values: Record<string, number | null>;
};

export type TrendData = {
  tab: TrendTabId;
  source: "order";
  filterLabel: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  mode: "matrix" | "industry-cross";
  months: string[];
  columns: TrendColumn[];
  rows: TrendRow[];
  industries?: string[];
  selectedIndustry?: string;
  rowCount: number;
  syncedThrough?: string | null;
};

const NEW_CENTER_TYPE = "신규센터";

const PLAN_ORDER = [
  "Trial",
  "Starter",
  "Lite",
  "Basic",
  "Essential",
  "Standard",
  "Pos",
  "Pos (APOS)",
  "Pass (PL)",
  "Pass (알리콘)",
  "Pass (7인치)",
  "Pass&Pos (32인치)",
  "Pass&Pos (PL PAY)",
  "Pass&Pos",
  "커스텀요금제",
  "알 수 없음",
  "기타",
];

type TrendRecord = {
  month: string;
  industry: string;
  channel: string;
  plan: string;
};

function orderSpreadsheetId(): string {
  return env.googleSheets.orderSpreadsheetId;
}

function orderSpreadsheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${orderSpreadsheetId()}/edit`;
}

function normalizeMonthLabel(monthKey: string): string {
  const m = monthKey.trim().match(/^(\d{4})\.(\d{2})/);
  if (!m) return monthKey;
  return `${m[1]}-${m[2]}`;
}

function monthSortKey(label: string): number {
  const m = label.match(/^(\d{4})-(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

function industryName(data: Record<string, string>): string {
  const raw = (data["업종"] || "").trim();
  return raw || "확인불가";
}

function channelName(data: Record<string, string>): string {
  const raw = (data["마케팅채널"] || "").trim();
  return raw || "기타";
}

function planName(data: Record<string, string>): string {
  const raw = (data["기본 요금제"] || "").trim();
  return raw || "알 수 없음";
}

function isNewCenter(data: Record<string, string>): boolean {
  return (data["구분"] || "").trim() === NEW_CENTER_TYPE;
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

async function loadNewCenterRecords(): Promise<TrendRecord[]> {
  const spreadsheetId = orderSpreadsheetId();
  const rows = await prisma.erpSalesOrder.findMany({
    where: { spreadsheetId },
    select: { data: true, syncedAt: true, sheetName: true },
  });

  const records: TrendRecord[] = [];
  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if (!isNewCenter(data)) continue;
    const monthKey = parseOrderRowMonth(data);
    if (!monthKey) continue;
    records.push({
      month: normalizeMonthLabel(monthKey),
      industry: industryName(data),
      channel: channelName(data),
      plan: planName(data),
    });
  }
  return records;
}

function buildMatrix(
  records: TrendRecord[],
  dimensionPick: (r: TrendRecord) => string,
  preferredOrder: readonly string[]
): Pick<TrendData, "months" | "columns" | "rows"> {
  const monthSet = new Set<string>();
  const dimCounts = new Map<string, Map<string, number>>();

  for (const rec of records) {
    monthSet.add(rec.month);
    const dim = dimensionPick(rec);
    const byDim = dimCounts.get(rec.month) ?? new Map<string, number>();
    byDim.set(dim, (byDim.get(dim) ?? 0) + 1);
    dimCounts.set(rec.month, byDim);
  }

  const months = [...monthSet].sort((a, b) => monthSortKey(a) - monthSortKey(b));
  const dimLabels = sortLabels(
    [...new Set(records.map((r) => dimensionPick(r)))],
    preferredOrder
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
      const label = col.label;
      const val = byDim.get(label) ?? 0;
      values[col.key] = val;
      total += val;
    }
    values.total = total;
    return { month, values };
  });

  return { months, columns, rows };
}

function buildIndustryCross(
  records: TrendRecord[],
  industry: string,
  dimensionPick: (r: TrendRecord) => string,
  preferredOrder: readonly string[]
): Pick<TrendData, "months" | "columns" | "rows"> {
  const filtered = records.filter((r) => r.industry === industry);
  const monthSet = new Set<string>();
  const dimCounts = new Map<string, Map<string, number>>();

  for (const rec of filtered) {
    monthSet.add(rec.month);
    const dim = dimensionPick(rec);
    const byDim = dimCounts.get(rec.month) ?? new Map<string, number>();
    byDim.set(dim, (byDim.get(dim) ?? 0) + 1);
    dimCounts.set(rec.month, byDim);
  }

  const months = [...monthSet].sort((a, b) => monthSortKey(a) - monthSortKey(b));
  const dimLabels = sortLabels(
    [...new Set(filtered.map((r) => dimensionPick(r)))],
    preferredOrder
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

  return { months, columns, rows };
}

export function listTrendTabs() {
  return Object.values(TREND_TABS);
}

export async function getTrendData(
  tab: TrendTabId,
  opts?: { industry?: string }
): Promise<TrendData> {
  const meta = TREND_TABS[tab];
  if (!meta) throw new Error("유효하지 않은 추이 탭입니다");

  const records = await loadNewCenterRecords();
  const industries = sortLabels(
    [...new Set(records.map((r) => r.industry))],
    INDUSTRY_TYPES
  );

  const isCross = tab === "industry-plan" || tab === "industry-channel";
  const selectedIndustry =
    (opts?.industry && industries.includes(opts.industry) ? opts.industry : null) ??
    industries[0] ??
    "";

  let parsed: Pick<TrendData, "months" | "columns" | "rows">;
  if (tab === "industry") {
    parsed = buildMatrix(records, (r) => r.industry, INDUSTRY_TYPES);
  } else if (tab === "plan") {
    parsed = buildMatrix(records, (r) => r.plan, PLAN_ORDER);
  } else if (tab === "industry-channel") {
    parsed = buildIndustryCross(records, selectedIndustry, (r) => r.channel, []);
  } else {
    parsed = buildIndustryCross(records, selectedIndustry, (r) => r.plan, PLAN_ORDER);
  }

  const latest = await prisma.erpSalesOrder.findFirst({
    where: { spreadsheetId: orderSpreadsheetId() },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true, sheetName: true },
  });

  return {
    tab,
    source: "order",
    filterLabel: NEW_CENTER_TYPE,
    spreadsheetId: orderSpreadsheetId(),
    spreadsheetUrl: orderSpreadsheetUrl(),
    mode: isCross ? "industry-cross" : "matrix",
    months: parsed.months,
    columns: parsed.columns,
    rows: parsed.rows,
    industries,
    selectedIndustry: isCross ? selectedIndustry : undefined,
    rowCount: records.length,
    syncedThrough: latest?.sheetName ?? null,
  };
}
