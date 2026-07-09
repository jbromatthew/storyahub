import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  fetchSheetGrid,
  listMonthSheets,
  parseOrderRowMonth,
} from "./googleSheets.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";

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

export type DashboardItem = {
  key: string;
  label: string;
  goal: number;
  actual: number;
  gap: number;
  rate: number | null;
};

export type DashboardSection = {
  id: "channel" | "industry" | "plan";
  label: string;
  items: DashboardItem[];
  total: DashboardItem;
};

export type SalesDashboardData = {
  month: string;
  monthLabel: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  filterLabel: string;
  months: string[];
  summary: {
    totalGoal: number;
    actual: number;
    gap: number;
    rate: number | null;
    remainingDays: number | null;
    remainingBusinessDays: number | null;
    sheetActual: number | null;
  };
  sections: DashboardSection[];
  syncedThrough: string | null;
};

type MonthCounts = {
  total: number;
  byChannel: Map<string, number>;
  byIndustry: Map<string, number>;
  byPlan: Map<string, number>;
};

function dashboardSpreadsheetId(): string {
  return env.googleSheets.dashboardSpreadsheetId;
}

function dashboardSpreadsheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${dashboardSpreadsheetId()}/edit`;
}

function sheetMonthToLabel(month: string): string {
  const m = month.trim().match(/^(\d{4})\.(\d{2})/);
  if (!m) return month;
  return `${m[1]}-${m[2]}`;
}

function parseNum(raw: string | undefined): number {
  const s = (raw ?? "").trim().replace(/,/g, "");
  if (!s || s === "-" || s === "—") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function item(label: string, goal: number, actual: number): DashboardItem {
  const gap = actual - goal;
  const rate = goal > 0 ? Math.round((actual / goal) * 1000) / 10 : null;
  return {
    key: label,
    label,
    goal,
    actual,
    gap,
    rate,
  };
}

function findSectionRow(grid: string[][], pattern: RegExp): number {
  for (let i = 0; i < grid.length; i++) {
    const b = (grid[i]?.[1] || "").replace(/\s/g, "");
    if (pattern.test(b)) return i;
  }
  return -1;
}

function parseSectionGoals(
  grid: string[][],
  sectionRow: number
): { labels: string[]; goals: number[] } {
  const headerRow = sectionRow + 1;
  const headers = grid[headerRow] ?? [];
  const labels: string[] = [];
  const cols: number[] = [];

  for (let c = 2; c < headers.length; c++) {
    const h = (headers[c] || "").trim();
    if (!h) continue;
    if (h === "합계") break;
    labels.push(h);
    cols.push(c);
  }

  let goalRow = -1;
  for (let r = headerRow + 1; r < Math.min(headerRow + 8, grid.length); r++) {
    if ((grid[r]?.[1] || "").trim() === "목표") {
      goalRow = r;
      break;
    }
  }
  if (goalRow < 0) return { labels, goals: labels.map(() => 0) };

  let goals = cols.map((c) => parseNum(grid[goalRow]?.[c]));
  if (goals.every((g) => g === 0)) {
    const weekRows: number[] = [];
    for (let r = goalRow + 1; r < Math.min(goalRow + 8, grid.length); r++) {
      const label = (grid[r]?.[1] || "").trim();
      if (/^\d+주차$/.test(label)) weekRows.push(r);
      if (label === "현황") break;
    }
    goals = cols.map((c) =>
      weekRows.reduce((sum, r) => sum + parseNum(grid[r]?.[c]), 0)
    );
  }

  return { labels, goals };
}

function parseSummary(grid: string[][]) {
  const row2 = grid[1] ?? [];
  const row3 = grid[2] ?? [];
  return {
    month: (row2[1] || "").trim(),
    totalGoal: parseNum(row2[8]),
    remainingDays: parseNum(row2[5]) || null,
    remainingBusinessDays: parseNum(row3[2]) || null,
    sheetActual: parseNum(row3[4]) || null,
  };
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

function buildSection(
  id: DashboardSection["id"],
  label: string,
  dimLabels: string[],
  goals: number[],
  actualMap: Map<string, number>,
  preferredOrder: readonly string[]
): DashboardSection {
  const ordered = sortLabels(dimLabels, preferredOrder);
  const items = ordered.map((name, i) => {
    const idx = dimLabels.indexOf(name);
    const goal = idx >= 0 ? goals[idx] : 0;
    const actual = actualMap.get(name) ?? 0;
    return item(name, goal, actual);
  });

  const totalGoal = goals.reduce((s, g) => s + g, 0);
  const totalActual = items.reduce((s, it) => s + it.actual, 0);
  return {
    id,
    label,
    items: items.filter((it) => it.goal > 0 || it.actual > 0),
    total: item("합계", totalGoal, totalActual),
  };
}

async function loadMonthCounts(monthLabel: string): Promise<MonthCounts> {
  const spreadsheetId = env.googleSheets.orderSpreadsheetId;
  const rows = await prisma.erpSalesOrder.findMany({
    where: { spreadsheetId },
    select: { data: true },
  });

  const byChannel = new Map<string, number>();
  const byIndustry = new Map<string, number>();
  const byPlan = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== NEW_CENTER_TYPE) continue;
    const monthKey = parseOrderRowMonth(data);
    if (!monthKey) continue;
    const label = sheetMonthToLabel(monthKey);
    if (label !== monthLabel) continue;

    total += 1;
    const channel = (data["마케팅채널"] || "").trim() || "기타";
    const industry = (data["업종"] || "").trim() || "확인불가";
    const plan = (data["기본 요금제"] || "").trim() || "알 수 없음";

    byChannel.set(channel, (byChannel.get(channel) ?? 0) + 1);
    byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + 1);
    byPlan.set(plan, (byPlan.get(plan) ?? 0) + 1);
  }

  return { total, byChannel, byIndustry, byPlan };
}

export async function listDashboardMonths(): Promise<string[]> {
  return listMonthSheets(dashboardSpreadsheetId());
}

export async function getSalesDashboard(month?: string): Promise<SalesDashboardData> {
  const spreadsheetId = dashboardSpreadsheetId();
  const months = await listDashboardMonths();
  const now = new Date();
  const currentSheet = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`;
  const selectedMonth =
    (month && months.includes(month) ? month : null) ??
    (months.includes(currentSheet) ? currentSheet : months[0] ?? currentSheet);

  const grid = await fetchSheetGrid(spreadsheetId, selectedMonth);
  const summaryMeta = parseSummary(grid);

  const channelRow = findSectionRow(grid, /^1\.채널별/);
  const industryRow = findSectionRow(grid, /^2\.업종별/);
  const planRow = findSectionRow(grid, /^3\.요금제별/);

  const channelParsed = channelRow >= 0 ? parseSectionGoals(grid, channelRow) : { labels: [], goals: [] };
  const industryParsed = industryRow >= 0 ? parseSectionGoals(grid, industryRow) : { labels: [], goals: [] };
  const planParsed = planRow >= 0 ? parseSectionGoals(grid, planRow) : { labels: [], goals: [] };

  const monthLabel = sheetMonthToLabel(selectedMonth);
  const counts = await loadMonthCounts(monthLabel);
  const totalGoal = summaryMeta.totalGoal || industryParsed.goals.reduce((s, g) => s + g, 0);
  const actual = counts.total;

  const latest = await prisma.erpSalesOrder.findFirst({
    where: { spreadsheetId: env.googleSheets.orderSpreadsheetId },
    orderBy: { syncedAt: "desc" },
    select: { sheetName: true },
  });

  return {
    month: selectedMonth,
    monthLabel,
    spreadsheetId,
    spreadsheetUrl: dashboardSpreadsheetUrl(),
    filterLabel: NEW_CENTER_TYPE,
    months,
    summary: {
      totalGoal,
      actual,
      gap: actual - totalGoal,
      rate: totalGoal > 0 ? Math.round((actual / totalGoal) * 1000) / 10 : null,
      remainingDays: summaryMeta.remainingDays,
      remainingBusinessDays: summaryMeta.remainingBusinessDays,
      sheetActual: summaryMeta.sheetActual,
    },
    sections: [
      buildSection("channel", "채널별", channelParsed.labels, channelParsed.goals, counts.byChannel, []),
      buildSection("industry", "업종별", industryParsed.labels, industryParsed.goals, counts.byIndustry, INDUSTRY_TYPES),
      buildSection("plan", "요금제별", planParsed.labels, planParsed.goals, counts.byPlan, PLAN_ORDER),
    ],
    syncedThrough: latest?.sheetName ?? null,
  };
}
