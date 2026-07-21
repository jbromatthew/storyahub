import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  fetchSheetGrid,
  batchUpdateValues,
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

export type DrillItem = DashboardItem & { avg3?: number };

export type IndustryDrilldown = {
  industry: string;
  summary: DashboardItem;
  plans: DrillItem[];
  channels: DrillItem[];
  weekly: DashboardItem[];
  inquiry: { goal: number | null; actual: number; rate: number | null };
};

// 채널별·요금제별 탭에서 항목을 눌렀을 때 보여줄 하위 분해 (읽기 전용, 현황 기준)
export type DimensionDrilldown = {
  key: string;
  summary: DashboardItem;
  byIndustry: DashboardItem[];
  byChannel: DashboardItem[];
  byPlan: DashboardItem[];
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
    inquiryGoal: number | null;
    inquiryActual: number;
    inquiryRate: number | null;
  };
  sections: DashboardSection[];
  industryPlan?: IndustryPlanSection;
  goalOverrides: DashboardGoalOverrides;
  goalWarnings: string[];
  goalsCustomized: boolean;
  weekly: WeeklyBreakdown;
  industryDrilldowns: Record<string, IndustryDrilldown>;
  channelDrilldowns: Record<string, DimensionDrilldown>;
  planDrilldowns: Record<string, DimensionDrilldown>;
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
  byChannelIndustry: Map<string, Map<string, number>>;
  byChannelPlan: Map<string, Map<string, number>>;
  byPlanIndustry: Map<string, Map<string, number>>;
  byPlanChannel: Map<string, Map<string, number>>;
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
    inquiryGoal: findLabeledNumber(grid, /^문의목표$/),
  };
}

/**
 * 시트 상단(요약 영역)에서 라벨이 붙은 숫자를 찾는다.
 * 예) 어느 셀에 '문의 목표'라고 쓰고 바로 오른쪽(또는 같은 줄 다음) 칸에 숫자를 넣으면 읽어온다.
 */
function findLabeledNumber(grid: string[][], pattern: RegExp, maxRow = 6): number | null {
  for (let r = 0; r < Math.min(maxRow, grid.length); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (!pattern.test((row[c] || "").replace(/\s/g, ""))) continue;
      for (let k = c + 1; k < row.length; k++) {
        const v = (row[k] || "").trim();
        if (v !== "") return parseNum(v);
      }
    }
  }
  return null;
}

/** 당월 신규문의 건수 (문의 시트 기준, 결제율 분석과 동일 소스). 업종별 분해도 함께 반환 */
async function loadInquiryStats(monthSheet: string): Promise<{ total: number; byIndustry: Map<string, number> }> {
  const spreadsheetId = env.googleSheets.inquirySpreadsheetId;
  const target = normalizeMonthSheet(monthSheet);
  const rows = await prisma.erpSalesInquiry.findMany({
    where: { spreadsheetId },
    select: { data: true, sheetName: true },
  });
  let total = 0;
  const byIndustry = new Map<string, number>();
  for (const row of rows) {
    if (normalizeMonthSheet(row.sheetName) !== target) continue;
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== "신규문의") continue;
    total += 1;
    const industry = (data["업종"] || "").trim() || "확인불가";
    byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + 1);
  }
  return { total, byIndustry };
}

/** 섹션 안에서 특정 라벨의 행(예: '문의목표')을 열별(업종/채널/요금제)로 읽는다. 없으면 null */
function parseSectionNamedRow(
  grid: string[][],
  sectionRow: number,
  rowLabelPattern: RegExp
): Map<string, number> | null {
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
  let targetRow = -1;
  for (let r = headerRow + 1; r < Math.min(headerRow + 16, grid.length); r++) {
    const lbl = (grid[r]?.[1] || "").replace(/\s/g, "");
    if (/^\d+\./.test(lbl)) break; // 다음 섹션 시작
    if (rowLabelPattern.test(lbl)) {
      targetRow = r;
      break;
    }
  }
  if (targetRow < 0) return null;
  const map = new Map<string, number>();
  labels.forEach((label, i) => map.set(label, parseNum(grid[targetRow]?.[cols[i]])));
  return map;
}

function normalizeMonthSheet(name: string): string {
  const t = (name ?? "").trim();
  return t.endsWith(".") ? t : `${t}.`;
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
  const byChannelIndustry = new Map<string, Map<string, number>>();
  const byChannelPlan = new Map<string, Map<string, number>>();
  const byPlanIndustry = new Map<string, Map<string, number>>();
  const byPlanChannel = new Map<string, Map<string, number>>();
  const byWeek = new Map<number, WeekBucket>();
  let total = 0;

  const bump = (outer: Map<string, Map<string, number>>, a: string, b: string) => {
    const inner = outer.get(a) ?? new Map<string, number>();
    inner.set(b, (inner.get(b) ?? 0) + 1);
    outer.set(a, inner);
  };

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
    bump(byIndustryPlan, industry, plan);
    bump(byIndustryChannel, industry, channel);
    bump(byChannelIndustry, channel, industry);
    bump(byChannelPlan, channel, plan);
    bump(byPlanIndustry, plan, industry);
    bump(byPlanChannel, plan, channel);

    if (weekNum != null) {
      const bucket = byWeek.get(weekNum) ?? emptyWeekBucket();
      addToWeekBucket(bucket, channel, industry, plan);
      byWeek.set(weekNum, bucket);
    }
  }

  return {
    total,
    byChannel,
    byIndustry,
    byPlan,
    byIndustryPlan,
    byIndustryChannel,
    byChannelIndustry,
    byChannelPlan,
    byPlanIndustry,
    byPlanChannel,
    byWeek,
  };
}

function buildDimensionDrilldowns(
  dim: "channel" | "plan",
  counts: MonthCounts,
  sectionGoals: { labels: string[]; goals: number[] },
  weekLabels: string[]
): Record<string, DimensionDrilldown> {
  const actualMap = dim === "channel" ? counts.byChannel : counts.byPlan;
  const crossIndustry = dim === "channel" ? counts.byChannelIndustry : counts.byPlanIndustry;
  const crossOther = dim === "channel" ? counts.byChannelPlan : counts.byPlanChannel;
  const keyPreferred = dim === "channel" ? [] : PLAN_ORDER;
  const otherPreferred = dim === "channel" ? PLAN_ORDER : [];

  const keys = sortLabels(
    [...new Set([...actualMap.keys(), ...sectionGoals.labels])],
    keyPreferred
  );

  const out: Record<string, DimensionDrilldown> = {};
  for (const key of keys) {
    const gi = sectionGoals.labels.indexOf(key);
    const goal = gi >= 0 ? sectionGoals.goals[gi] ?? 0 : 0;
    const actual = actualMap.get(key) ?? 0;
    if (actual <= 0 && goal <= 0) continue;

    const industryMap = crossIndustry.get(key) ?? new Map<string, number>();
    const byIndustry = sortLabels([...industryMap.keys()], INDUSTRY_TYPES)
      .map((l) => item(l, 0, industryMap.get(l) ?? 0))
      .filter((it) => it.actual > 0);

    const otherMap = crossOther.get(key) ?? new Map<string, number>();
    const byOther = sortLabels([...otherMap.keys()], otherPreferred)
      .map((l) => item(l, 0, otherMap.get(l) ?? 0))
      .filter((it) => it.actual > 0);

    const weekly = weekLabels
      .map((label, idx) => {
        const bucket = counts.byWeek.get(idx + 1);
        const map = dim === "channel" ? bucket?.byChannel : bucket?.byPlan;
        return item(label, 0, map?.get(key) ?? 0);
      })
      .filter((it) => it.actual > 0);

    out[key] = {
      key,
      summary: item(key, goal, actual),
      byIndustry,
      byChannel: dim === "plan" ? byOther : [],
      byPlan: dim === "channel" ? byOther : [],
      weekly,
    };
  }
  return out;
}

type PrevAvg = {
  byIndustryPlan: Map<string, Map<string, number>>;
  byIndustryChannel: Map<string, Map<string, number>>;
  n: number;
};

/** 직전 N개월 업종×요금제/채널 신규센터 건수 합 (목표 설정 참고용 월평균 계산) */
async function loadPrevIndustryAvg(monthLabels: string[]): Promise<PrevAvg> {
  const byIndustryPlan = new Map<string, Map<string, number>>();
  const byIndustryChannel = new Map<string, Map<string, number>>();
  const n = Math.max(1, monthLabels.length);
  if (!monthLabels.length) return { byIndustryPlan, byIndustryChannel, n };
  const labelSet = new Set(monthLabels);
  const rows = await prisma.erpSalesOrder.findMany({
    where: { spreadsheetId: env.googleSheets.orderSpreadsheetId },
    select: { data: true },
  });
  const bump = (outer: Map<string, Map<string, number>>, a: string, b: string) => {
    const inner = outer.get(a) ?? new Map<string, number>();
    inner.set(b, (inner.get(b) ?? 0) + 1);
    outer.set(a, inner);
  };
  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== NEW_CENTER_TYPE) continue;
    const mk = parseOrderRowMonth(data);
    if (!mk || !labelSet.has(sheetMonthToLabel(mk))) continue;
    const industry = (data["업종"] || "").trim() || "확인불가";
    bump(byIndustryPlan, industry, (data["기본 요금제"] || "").trim() || "알 수 없음");
    bump(byIndustryChannel, industry, (data["마케팅채널"] || "").trim() || "기타");
  }
  return { byIndustryPlan, byIndustryChannel, n };
}

function buildIndustryDrilldowns(
  counts: MonthCounts,
  overrides: DashboardGoalOverrides,
  industryWeek: SectionWeekData | null,
  mergedIndustry: { labels: string[]; goals: number[] },
  inquiryByIndustry: Map<string, number>,
  inquiryGoalByIndustry: Map<string, number> | null,
  prevAvg: PrevAvg
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

    const avgPlanMap = prevAvg.byIndustryPlan.get(industry) ?? new Map<string, number>();
    const avgChMap = prevAvg.byIndustryChannel.get(industry) ?? new Map<string, number>();
    const avg3Of = (map: Map<string, number>, key: string) =>
      Math.round(((map.get(key) ?? 0) / prevAvg.n) * 10) / 10;

    const planGoals = overrides.industryPlanGoals[industry] ?? {};
    const planActuals = counts.byIndustryPlan.get(industry) ?? new Map<string, number>();
    const planLabels = sortLabels(
      [...new Set([...PLAN_ORDER, ...planActuals.keys(), ...Object.keys(planGoals), ...avgPlanMap.keys()])],
      PLAN_ORDER
    );
    const plans = planLabels
      .map((plan) => ({ ...item(plan, planGoals[plan] ?? 0, planActuals.get(plan) ?? 0), avg3: avg3Of(avgPlanMap, plan) }))
      .filter((it) => it.goal > 0 || it.actual > 0 || it.avg3 > 0);

    const channelGoals = overrides.industryChannelGoals[industry] ?? {};
    const channelActuals = counts.byIndustryChannel.get(industry) ?? new Map<string, number>();
    const channels = sortLabels(
      [...new Set([...channelActuals.keys(), ...Object.keys(channelGoals), ...avgChMap.keys()])],
      []
    )
      .map((channel) => ({ ...item(channel, channelGoals[channel] ?? 0, channelActuals.get(channel) ?? 0), avg3: avg3Of(avgChMap, channel) }))
      .filter((it) => it.goal > 0 || it.actual > 0 || it.avg3 > 0);

    const weekly = weekLabels.map((label, weekIdx) => {
      const weekNum = weekIdx + 1;
      const goal = industryWeek ? weekGoalForLabel(industryWeek, industry, weekIdx) : 0;
      const weekActual = counts.byWeek.get(weekNum)?.byIndustry.get(industry) ?? 0;
      return item(label, goal, weekActual);
    }).filter((it) => it.goal > 0 || it.actual > 0);

    const iActual = inquiryByIndustry.get(industry) ?? 0;
    const iGoal = inquiryGoalByIndustry?.get(industry) ?? null;
    const iRate = iGoal && iGoal > 0 ? Math.round((iActual / iGoal) * 1000) / 10 : null;

    if (actual <= 0 && industryGoal <= 0 && !plans.length && !channels.length && !weekly.length && iActual <= 0) {
      continue;
    }

    out[industry] = {
      industry,
      summary: item(industry, industryGoal, actual),
      plans,
      channels,
      weekly,
      inquiry: { goal: iGoal, actual: iActual, rate: iRate },
    };
  }

  return out;
}

// '5. 업종X요금제' 섹션 파싱: 업종별 3열(목표/현황/미달) 블록 × 요금제 행 매트릭스
type IndustryPlanSheet = {
  found: boolean;
  goals: Record<string, Record<string, number>>; // {업종: {요금제: 목표}}
  industryGoalCols: Record<string, number>; // {업종: 목표 열 인덱스}
  planRowIdx: Record<string, number>; // {요금제: 행 인덱스}
};

function parseIndustryPlanSheet(grid: string[][]): IndustryPlanSheet {
  const empty: IndustryPlanSheet = { found: false, goals: {}, industryGoalCols: {}, planRowIdx: {} };
  // 섹션 라벨은 임의 위치(예: AZ31)에 있을 수 있음 — 전체 그리드에서 탐색
  let sectionRow = -1;
  let baseCol = -1;
  outer: for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      const s = String(row[c] ?? "").replace(/\s/g, "");
      if (/^5\.업종[X×]요금제/i.test(s)) {
        sectionRow = i;
        baseCol = c;
        break outer;
      }
    }
  }
  if (sectionRow < 0) return empty;

  const indRow = grid[sectionRow + 1] ?? [];
  const subRow = grid[sectionRow + 2] ?? [];
  // 업종 블록: 업종명이 있는 열부터, 그 아래 줄에서 '목표' 열 찾기
  const industryGoalCols: Record<string, number> = {};
  for (let c = baseCol + 1; c < indRow.length; c++) {
    const name = (indRow[c] || "").trim();
    if (!name || name === "합계") continue;
    for (let k = c; k < Math.min(c + 4, subRow.length); k++) {
      if ((subRow[k] || "").trim() === "목표") {
        industryGoalCols[name] = k;
        break;
      }
    }
  }
  if (!Object.keys(industryGoalCols).length) return empty;

  const goals: Record<string, Record<string, number>> = {};
  const planRowIdx: Record<string, number> = {};
  for (let r = sectionRow + 3; r < grid.length; r++) {
    const label = (grid[r]?.[baseCol] ?? "").trim();
    if (!label) continue;
    if (label === "합계") break;
    if (/^\d+\./.test(label.replace(/\s/g, ""))) break; // 다음 섹션
    planRowIdx[label] = r;
    for (const [ind, col] of Object.entries(industryGoalCols)) {
      const raw = (grid[r]?.[col] ?? "").trim();
      if (raw === "") continue;
      const n = parseNum(raw);
      if (!goals[ind]) goals[ind] = {};
      if (n > 0) goals[ind][label] = n;
    }
  }
  return { found: true, goals, industryGoalCols, planRowIdx };
}

/** 시트 매트릭스(기본) 위에 셀 단위로 시트 값 우선 병합 — 시트에 값이 없으면 DB 오버라이드 사용 */
function mergeIndustryPlanGoals(
  sheet: Record<string, Record<string, number>>,
  db: Record<string, Record<string, number>>
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const inds = new Set([...Object.keys(sheet), ...Object.keys(db)]);
  for (const ind of inds) {
    const row: Record<string, number> = { ...(db[ind] || {}), ...(sheet[ind] || {}) };
    if (Object.keys(row).length) out[ind] = row;
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

function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 앱에서 수정한 목표를 대시보드 시트에 역기록 (업종별 목표 행 + 요금제별 목표 행) */
export async function writeDashboardGoalsToSheet(
  month: string,
  overrides: DashboardGoalOverrides
): Promise<{ updated: number }> {
  const spreadsheetId = dashboardSpreadsheetId();
  const grid = await fetchSheetGrid(spreadsheetId, month);
  const updates: Array<{ range: string; value: number }> = [];

  const collect = (sectionPattern: RegExp, goals: Record<string, number>) => {
    if (!Object.keys(goals).length) return;
    const sectionRow = findSectionRow(grid, sectionPattern);
    if (sectionRow < 0) return;
    const headerRow = sectionRow + 1;
    const headers = grid[headerRow] ?? [];
    let goalRow = -1;
    for (let r = headerRow + 1; r < Math.min(headerRow + 8, grid.length); r++) {
      if ((grid[r]?.[1] || "").trim() === "목표") {
        goalRow = r;
        break;
      }
    }
    if (goalRow < 0) return;
    for (let c = 2; c < headers.length; c++) {
      const h = (headers[c] || "").trim();
      if (h === "합계") break;
      if (!h || goals[h] == null) continue;
      updates.push({ range: `'${month}'!${colLetter(c)}${goalRow + 1}`, value: goals[h] });
    }
  };

  collect(/^2\.업종별/, overrides.industryGoals);
  // 요금제별 목표 행 = 업종×요금제 목표의 요금제별 합계
  const planTotals: Record<string, number> = {};
  for (const row of Object.values(overrides.industryPlanGoals)) {
    for (const [plan, v] of Object.entries(row)) planTotals[plan] = (planTotals[plan] ?? 0) + v;
  }
  collect(/^3\.요금제별/, planTotals);

  // '5. 업종X요금제' 매트릭스에 업종×요금제 목표 셀 단위 역기록
  const ipSheet = parseIndustryPlanSheet(grid);
  if (ipSheet.found) {
    for (const [ind, planGoals] of Object.entries(overrides.industryPlanGoals)) {
      const col = ipSheet.industryGoalCols[ind];
      if (col == null) continue;
      for (const [plan, v] of Object.entries(planGoals)) {
        const row = ipSheet.planRowIdx[plan];
        if (row == null) continue;
        updates.push({ range: `'${month}'!${colLetter(col)}${row + 1}`, value: v });
      }
    }
  }

  await batchUpdateValues(spreadsheetId, updates);
  return { updated: updates.length };
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
  // '5. 업종X요금제' 시트 매트릭스를 기본으로, DB 오버라이드는 시트에 값 없는 셀만 보충
  const sheetIPG = parseIndustryPlanSheet(grid);
  const effOverrides: DashboardGoalOverrides = {
    ...goalOverrides,
    industryPlanGoals: mergeIndustryPlanGoals(sheetIPG.goals, goalOverrides.industryPlanGoals),
  };
  const mergedIndustry = mergeIndustryGoals(
    industryParsed.labels,
    industryParsed.goals,
    goalOverrides
  );

  const monthLabel = sheetMonthToLabel(selectedMonth);
  const counts = await loadMonthCounts(monthLabel);
  const inquiryStats = await loadInquiryStats(selectedMonth);
  const inquiryActual = inquiryStats.total;
  const inquiryGoal = summaryMeta.inquiryGoal;
  const inquiryRate =
    inquiryGoal && inquiryGoal > 0 ? Math.round((inquiryActual / inquiryGoal) * 1000) / 10 : null;
  const inquiryGoalByIndustry = industryRow >= 0 ? parseSectionNamedRow(grid, industryRow, /^문의목표$/) : null;
  const weekly = buildWeeklyBreakdown(channelWeek, industryWeek, planWeek, counts);
  // 직전 3개월 (목표 설정 참고용 월평균)
  const [selY, selM] = monthLabel.split("-").map(Number);
  const prevLabels: string[] = [];
  for (let k = 1; k <= 3; k++) {
    const d = new Date(selY, selM - 1 - k, 1);
    prevLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const prevAvg = await loadPrevIndustryAvg(prevLabels);
  const industryDrilldowns = buildIndustryDrilldowns(
    counts,
    effOverrides,
    industryWeek,
    mergedIndustry,
    inquiryStats.byIndustry,
    inquiryGoalByIndustry,
    prevAvg
  );
  const drillWeekLabels = resolveWeekLabels(industryWeek ?? channelWeek ?? planWeek, counts);
  const channelDrilldowns = buildDimensionDrilldowns("channel", counts, channelParsed, drillWeekLabels);
  const planDrilldowns = buildDimensionDrilldowns("plan", counts, planParsed, drillWeekLabels);
  const industryPlan = buildIndustryPlanSection(effOverrides, counts);
  const inboundGoal = mergedIndustry.goals.reduce((s, g) => s + g, 0);
  const totalGoal = summaryMeta.totalGoal || inboundGoal;
  const actual = counts.total;
  const goalWarnings = validateIndustryPlanGoals(effOverrides);
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
      inquiryGoal,
      inquiryActual,
      inquiryRate,
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
    channelDrilldowns,
    planDrilldowns,
    syncedThrough: latest?.sheetName ?? null,
  };
}
