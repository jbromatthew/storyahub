import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  fetchSheetGrid,
  listMonthSheets,
  parseOrderRowDate,
  parseOrderRowMonth,
} from "./googleSheets.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";
import {
  loadDashboardGoalOverrides,
  saveDashboardGoalOverrides,
  sumIndustryPlanGoals,
  validateIndustryPlanGoals,
  type DashboardGoalOverrides,
} from "./salesDashboardGoals.js";

export type { DashboardGoalOverrides };
export { saveDashboardGoalOverrides, validateIndustryPlanGoals };

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
  id: "channel" | "industry" | "plan" | "industry-plan";
  label: string;
  items: DashboardItem[];
  total: DashboardItem;
};

export type IndustryPlanRow = {
  industry: string;
  industryGoal: number;
  planGoalSum: number;
  actual: number;
  cells: Array<{
    plan: string;
    goal: number;
    actual: number;
  }>;
};

export type IndustryPlanSection = {
  id: "industry-plan";
  label: string;
  plans: string[];
  rows: IndustryPlanRow[];
  total: DashboardItem;
};

export type WeeklyDimensionRow = {
  label: string;
  goals: number[];
  actuals: number[];
  monthGoal: number;
  monthActual: number;
};

export type WeeklyBreakdown = {
  weekLabels: string[];
  summary: DashboardItem[];
  channel: WeeklyDimensionRow[];
  industry: WeeklyDimensionRow[];
  plan: WeeklyDimensionRow[];
};

export type IndustryDrilldown = {
  industry: string;
  summary: DashboardItem;
  plans: DashboardItem[];
  channels: DashboardItem[];
  weekly: DashboardItem[];
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
    inboundGoal: number;
    actual: number;
    gap: number;
    rate: number | null;
    remainingDays: number | null;
    remainingBusinessDays: number | null;
    sheetActual: number | null;
  };
  sections: DashboardSection[];
  industryPlan?: IndustryPlanSection;
  goalOverrides: DashboardGoalOverrides;
  goalWarnings: string[];
  goalsCustomized: boolean;
  weekly: WeeklyBreakdown;
  industryDrilldowns: Record<string, IndustryDrilldown>;
  syncedThrough: string | null;
};

type WeekBucket = {
  total: number;
  byChannel: Map<string, number>;
  byIndustry: Map<string, number>;
  byPlan: Map<string, number>;
};

type MonthCounts = {
  total: number;
  byChannel: Map<string, number>;
  byIndustry: Map<string, number>;
  byPlan: Map<string, number>;
  byIndustryPlan: Map<string, Map<string, number>>;
  byIndustryChannel: Map<string, Map<string, number>>;
  byWeek: Map<number, WeekBucket>;
};

type SectionWeekData = {
  labels: string[];
  cols: number[];
  sumCol: number | null;
  weeks: Array<{ label: string; values: number[] }>;
  monthGoals: number[];
  monthStatus: number[];
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

function parseSectionWeekData(grid: string[][], sectionRow: number): SectionWeekData | null {
  const headerRow = sectionRow + 1;
  const headers = grid[headerRow] ?? [];
  const labels: string[] = [];
  const cols: number[] = [];
  let sumCol: number | null = null;

  for (let c = 2; c < headers.length; c++) {
    const h = (headers[c] || "").trim();
    if (!h) continue;
    if (h === "합계") {
      sumCol = c;
      break;
    }
    labels.push(h);
    cols.push(c);
  }

  let goalRow = -1;
  let statusRow = -1;
  const weeks: Array<{ label: string; values: number[] }> = [];

  for (let r = headerRow + 1; r < Math.min(headerRow + 12, grid.length); r++) {
    const rowLabel = (grid[r]?.[1] || "").trim();
    if (/^\d+\./.test(rowLabel.replace(/\s/g, ""))) break;
    if (rowLabel === "목표") {
      goalRow = r;
      continue;
    }
    if (/^\d+주차$/.test(rowLabel)) {
      weeks.push({
        label: rowLabel,
        values: cols.map((c) => parseNum(grid[r]?.[c])),
      });
      continue;
    }
    if (rowLabel === "현황") {
      statusRow = r;
      break;
    }
  }

  const monthGoals =
    goalRow >= 0
      ? cols.map((c) => parseNum(grid[goalRow]?.[c]))
      : labels.map(() => 0);
  const monthStatus =
    statusRow >= 0
      ? cols.map((c) => parseNum(grid[statusRow]?.[c]))
      : labels.map(() => 0);

  if (!labels.length && sumCol == null) return null;
  return { labels, cols, sumCol, weeks, monthGoals, monthStatus };
}

function weekGoalsFromSection(weekData: SectionWeekData | null): number[] {
  if (!weekData?.weeks.length) return [];
  return weekData.weeks.map((week) => week.values.reduce((s, v) => s + v, 0));
}

function resolveWeekLabels(weekData: SectionWeekData | null, counts: MonthCounts): string[] {
  if (weekData?.weeks.length) return weekData.weeks.map((w) => w.label);
  const nums = [...counts.byWeek.keys()].sort((a, b) => a - b);
  if (nums.length) return nums.map((n) => `${n}주차`);
  return [];
}

function weekGoalForLabel(weekData: SectionWeekData | null, label: string, weekIdx: number): number {
  if (!weekData?.weeks[weekIdx]) return 0;
  const colIdx = weekData.labels.indexOf(label);
  if (colIdx < 0) return 0;
  return weekData.weeks[weekIdx].values[colIdx] ?? 0;
}

function weekOfMonth(dateKey: string, monthLabel: string): number | null {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [my, mm] = monthLabel.split("-").map(Number);
  if (!y || !m || !d || y !== my || m !== mm) return null;
  return Math.min(5, Math.ceil(d / 7));
}

function emptyWeekBucket(): WeekBucket {
  return {
    total: 0,
    byChannel: new Map(),
    byIndustry: new Map(),
    byPlan: new Map(),
  };
}

function addToWeekBucket(bucket: WeekBucket, channel: string, industry: string, plan: string) {
  bucket.total += 1;
  bucket.byChannel.set(channel, (bucket.byChannel.get(channel) ?? 0) + 1);
  bucket.byIndustry.set(industry, (bucket.byIndustry.get(industry) ?? 0) + 1);
  bucket.byPlan.set(plan, (bucket.byPlan.get(plan) ?? 0) + 1);
}

function buildWeeklyDimensionRows(
  weekData: SectionWeekData | null,
  counts: MonthCounts,
  weekLabels: string[],
  dim: "channel" | "industry" | "plan",
  preferredOrder: readonly string[]
): WeeklyDimensionRow[] {
  const actualMap =
    dim === "channel" ? counts.byChannel : dim === "industry" ? counts.byIndustry : counts.byPlan;

  const labels = sortLabels(
    [...new Set([...(weekData?.labels ?? []), ...actualMap.keys()])],
    preferredOrder
  );

  return labels
    .map((label) => {
      const goals = weekLabels.map((_w, idx) =>
        weekData ? weekGoalForLabel(weekData, label, idx) : 0
      );
      const actuals = weekLabels.map((_w, idx) => {
        const weekNum = idx + 1;
        const bucket = counts.byWeek.get(weekNum);
        if (!bucket) return 0;
        const map =
          dim === "channel" ? bucket.byChannel : dim === "industry" ? bucket.byIndustry : bucket.byPlan;
        return map.get(label) ?? 0;
      });
      const colIdx = weekData?.labels.indexOf(label) ?? -1;
      const monthGoal = colIdx >= 0 ? weekData?.monthGoals[colIdx] ?? 0 : 0;
      const monthActual = actualMap.get(label) ?? 0;
      const hasData =
        monthGoal > 0 ||
        monthActual > 0 ||
        goals.some((g) => g > 0) ||
        actuals.some((a) => a > 0);
      if (!hasData) return null;
      return { label, goals, actuals, monthGoal, monthActual };
    })
    .filter((row): row is WeeklyDimensionRow => row != null);
}

function buildWeeklyBreakdown(
  channelWeek: SectionWeekData | null,
  industryWeek: SectionWeekData | null,
  planWeek: SectionWeekData | null,
  counts: MonthCounts
): WeeklyBreakdown {
  const weekLabels = resolveWeekLabels(industryWeek ?? channelWeek ?? planWeek, counts);
  const weekGoals = weekGoalsFromSection(industryWeek ?? channelWeek ?? planWeek);
  const summary = weekLabels.map((label, idx) => {
    const goal = weekGoals[idx] ?? 0;
    const actual = counts.byWeek.get(idx + 1)?.total ?? 0;
    return item(label, goal, actual);
  });

  return {
    weekLabels,
    summary,
    channel: buildWeeklyDimensionRows(channelWeek, counts, weekLabels, "channel", []),
    industry: buildWeeklyDimensionRows(industryWeek, counts, weekLabels, "industry", INDUSTRY_TYPES),
    plan: buildWeeklyDimensionRows(planWeek, counts, weekLabels, "plan", PLAN_ORDER),
  };
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
  const byIndustryPlan = new Map<string, Map<string, number>>();
  const byIndustryChannel = new Map<string, Map<string, number>>();
  const byWeek = new Map<number, WeekBucket>();
  let total = 0;

  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== NEW_CENTER_TYPE) continue;
    const monthKey = parseOrderRowMonth(data);
    if (!monthKey) continue;
    const label = sheetMonthToLabel(monthKey);
    if (label !== monthLabel) continue;

    const dateKey = parseOrderRowDate(data);
    const weekNum = dateKey ? weekOfMonth(dateKey, monthLabel) : null;

    total += 1;
    const channel = (data["마케팅채널"] || "").trim() || "기타";
    const industry = (data["업종"] || "").trim() || "확인불가";
    const plan = (data["기본 요금제"] || "").trim() || "알 수 없음";

    byChannel.set(channel, (byChannel.get(channel) ?? 0) + 1);
    byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + 1);
    byPlan.set(plan, (byPlan.get(plan) ?? 0) + 1);
    const planMap = byIndustryPlan.get(industry) ?? new Map<string, number>();
    planMap.set(plan, (planMap.get(plan) ?? 0) + 1);
    byIndustryPlan.set(industry, planMap);
    const channelMap = byIndustryChannel.get(industry) ?? new Map<string, number>();
    channelMap.set(channel, (channelMap.get(channel) ?? 0) + 1);
    byIndustryChannel.set(industry, channelMap);

    if (weekNum != null) {
      const bucket = byWeek.get(weekNum) ?? emptyWeekBucket();
      addToWeekBucket(bucket, channel, industry, plan);
      byWeek.set(weekNum, bucket);
    }
  }

  return { total, byChannel, byIndustry, byPlan, byIndustryPlan, byIndustryChannel, byWeek };
}

function buildIndustryDrilldowns(
  counts: MonthCounts,
  overrides: DashboardGoalOverrides,
  industryWeek: SectionWeekData | null,
  mergedIndustry: { labels: string[]; goals: number[] }
): Record<string, IndustryDrilldown> {
  const weekLabels = resolveWeekLabels(industryWeek, counts);
  const industries = sortLabels(
    [
      ...new Set([
        ...counts.byIndustry.keys(),
        ...mergedIndustry.labels,
        ...Object.keys(overrides.industryGoals),
        ...Object.keys(overrides.industryPlanGoals),
      ]),
    ],
    INDUSTRY_TYPES
  );

  const out: Record<string, IndustryDrilldown> = {};

  for (const industry of industries) {
    const idx = mergedIndustry.labels.indexOf(industry);
    const industryGoal =
      overrides.industryGoals[industry] ??
      (idx >= 0 ? mergedIndustry.goals[idx] ?? 0 : 0);
    const actual = counts.byIndustry.get(industry) ?? 0;

    const planGoals = overrides.industryPlanGoals[industry] ?? {};
    const planActuals = counts.byIndustryPlan.get(industry) ?? new Map<string, number>();
    const planLabels = sortLabels(
      [...new Set([...PLAN_ORDER, ...planActuals.keys(), ...Object.keys(planGoals)])],
      PLAN_ORDER
    );
    const plans = planLabels
      .map((plan) => item(plan, planGoals[plan] ?? 0, planActuals.get(plan) ?? 0))
      .filter((it) => it.goal > 0 || it.actual > 0);

    const channelGoals = overrides.industryChannelGoals[industry] ?? {};
    const channelActuals = counts.byIndustryChannel.get(industry) ?? new Map<string, number>();
    const channels = sortLabels([...new Set([...channelActuals.keys(), ...Object.keys(channelGoals)])], [])
      .map((channel) => item(channel, channelGoals[channel] ?? 0, channelActuals.get(channel) ?? 0))
      .filter((it) => it.goal > 0 || it.actual > 0);

    const weekly = weekLabels.map((label, weekIdx) => {
      const weekNum = weekIdx + 1;
      const goal = industryWeek ? weekGoalForLabel(industryWeek, industry, weekIdx) : 0;
      const weekActual = counts.byWeek.get(weekNum)?.byIndustry.get(industry) ?? 0;
      return item(label, goal, weekActual);
    }).filter((it) => it.goal > 0 || it.actual > 0);

    if (actual <= 0 && industryGoal <= 0 && !plans.length && !channels.length && !weekly.length) {
      continue;
    }

    out[industry] = {
      industry,
      summary: item(industry, industryGoal, actual),
      plans,
      channels,
      weekly,
    };
  }

  return out;
}

function mergeIndustryGoals(
  sheetLabels: string[],
  sheetGoals: number[],
  overrides: DashboardGoalOverrides
): { labels: string[]; goals: number[] } {
  const merged = new Map<string, number>();
  for (let i = 0; i < sheetLabels.length; i++) {
    merged.set(sheetLabels[i], sheetGoals[i] ?? 0);
  }
  for (const [label, goal] of Object.entries(overrides.industryGoals)) {
    merged.set(label, goal);
  }
  const labels = sortLabels([...merged.keys()], INDUSTRY_TYPES);
  return { labels, goals: labels.map((label) => merged.get(label) ?? 0) };
}

function buildIndustryPlanSection(
  overrides: DashboardGoalOverrides,
  counts: MonthCounts
): IndustryPlanSection {
  const planLabels = sortLabels(
    [
      ...new Set([
        ...PLAN_ORDER,
        ...counts.byPlan.keys(),
        ...Object.values(overrides.industryPlanGoals).flatMap((row) => Object.keys(row)),
      ]),
    ],
    PLAN_ORDER
  );

  const industries = sortLabels(
    [
      ...new Set([
        ...INDUSTRY_TYPES,
        ...counts.byIndustry.keys(),
        ...Object.keys(overrides.industryGoals),
        ...Object.keys(overrides.industryPlanGoals),
      ]),
    ],
    INDUSTRY_TYPES
  );

  const rows: IndustryPlanRow[] = [];
  let totalGoal = 0;
  let totalActual = 0;

  for (const industry of industries) {
    const industryGoal = overrides.industryGoals[industry] ?? 0;
    const planGoals = overrides.industryPlanGoals[industry] ?? {};
    const planGoalSum = sumIndustryPlanGoals(overrides.industryPlanGoals, industry);
    const actualMap = counts.byIndustryPlan.get(industry) ?? new Map<string, number>();
    const actual = counts.byIndustry.get(industry) ?? 0;
    const cells = planLabels.map((plan) => ({
      plan,
      goal: planGoals[plan] ?? 0,
      actual: actualMap.get(plan) ?? 0,
    }));
    const hasData = industryGoal > 0 || planGoalSum > 0 || actual > 0 || cells.some((c) => c.actual > 0);
    if (!hasData) continue;
    rows.push({ industry, industryGoal, planGoalSum, actual, cells });
    totalGoal += industryGoal > 0 ? industryGoal : planGoalSum;
    totalActual += actual;
  }

  return {
    id: "industry-plan",
    label: "업종×요금제",
    plans: planLabels,
    rows,
    total: item("합계", totalGoal, totalActual),
  };
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

  const channelWeek = channelRow >= 0 ? parseSectionWeekData(grid, channelRow) : null;
  const industryWeek = industryRow >= 0 ? parseSectionWeekData(grid, industryRow) : null;
  const planWeek = planRow >= 0 ? parseSectionWeekData(grid, planRow) : null;

  const goalOverrides = await loadDashboardGoalOverrides(selectedMonth);
  const mergedIndustry = mergeIndustryGoals(
    industryParsed.labels,
    industryParsed.goals,
    goalOverrides
  );

  const monthLabel = sheetMonthToLabel(selectedMonth);
  const counts = await loadMonthCounts(monthLabel);
  const weekly = buildWeeklyBreakdown(channelWeek, industryWeek, planWeek, counts);
  const industryDrilldowns = buildIndustryDrilldowns(
    counts,
    goalOverrides,
    industryWeek,
    mergedIndustry
  );
  const industryPlan = buildIndustryPlanSection(goalOverrides, counts);
  const inboundGoal = mergedIndustry.goals.reduce((s, g) => s + g, 0);
  const totalGoal = summaryMeta.totalGoal || inboundGoal;
  const actual = counts.total;
  const goalWarnings = validateIndustryPlanGoals(goalOverrides);
  const goalsCustomized =
    Object.keys(goalOverrides.industryGoals).length > 0 ||
    Object.keys(goalOverrides.industryPlanGoals).length > 0 ||
    Object.keys(goalOverrides.industryChannelGoals).length > 0;

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
      inboundGoal,
      actual,
      gap: actual - totalGoal,
      rate: totalGoal > 0 ? Math.round((actual / totalGoal) * 1000) / 10 : null,
      remainingDays: summaryMeta.remainingDays,
      remainingBusinessDays: summaryMeta.remainingBusinessDays,
      sheetActual: summaryMeta.sheetActual,
    },
    sections: [
      buildSection("channel", "채널별", channelParsed.labels, channelParsed.goals, counts.byChannel, []),
      buildSection("industry", "업종별", mergedIndustry.labels, mergedIndustry.goals, counts.byIndustry, INDUSTRY_TYPES),
      buildSection("plan", "요금제별", planParsed.labels, planParsed.goals, counts.byPlan, PLAN_ORDER),
    ],
    industryPlan,
    goalOverrides,
    goalWarnings,
    goalsCustomized,
    weekly,
    industryDrilldowns,
    syncedThrough: latest?.sheetName ?? null,
  };
}
