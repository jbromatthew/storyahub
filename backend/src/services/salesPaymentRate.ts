import { prisma } from "../db.js";
import { env } from "../env.js";
import { isHistoricalInquiryMonth } from "./googleSheets.js";
import {
  channelTreeForApi,
  matchesChannelSelection,
  matchesLegacyChannel,
} from "./marketingChannels.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";
import { ASSIGNEE_COLORS, mergeAssigneeList } from "./salesAssignees.js";

export type ChannelFilter = "all" | "organic" | "non-organic";

export type PaymentRateGroupInput = {
  id: string;
  label: string;
  months: string[];
};

export type PaymentRateQuery = {
  industry?: string;
  industries?: string[];
  channel?: ChannelFilter;
  channels?: string[];
  assignees?: string[];
  groups: PaymentRateGroupInput[];
};

type Counts = {
  inquiries: number;
  consulting: number;
  openBefore: number;
  absences: number;
  monthlyPayment: number;
  actualPayment: number;
};

export type PaymentRateMetrics = Counts & {
  monthlyRate: number | null;
  actualRate: number | null;
  absenceRate: number | null;
};

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
  "기타",
];

export const PAYMENT_RATE_ROWS = [
  { key: "inquiries", label: "문의수", format: "number" as const },
  { key: "consulting", label: "상담진행&운영중", format: "number" as const },
  { key: "openBefore", label: "오픈전", format: "number" as const },
  { key: "absences", label: "부재", format: "number" as const },
  { key: "absenceRate", label: "부재율(%)", format: "percent" as const },
  { key: "monthlyPayment", label: "당월 결제", format: "number" as const },
  { key: "actualPayment", label: "실결제", format: "number" as const },
  { key: "monthlyRate", label: "당월 결제전환율(%)", format: "percent" as const },
  { key: "actualRate", label: "실 결제전환율(%)", format: "percent" as const },
];

function normalizeMonthSheet(name: string): string {
  const t = name.trim();
  return t.endsWith(".") ? t : `${t}.`;
}

function monthKeyFromDate(raw: string | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/\./g, "-");
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.` : null;
}

function rowMatchesChannelFilter(
  data: Record<string, string>,
  channels?: string[],
  legacy?: ChannelFilter
): boolean {
  if (channels?.length) return matchesChannelSelection(channels, data);
  return matchesLegacyChannel(legacy ?? "all", data);
}

function planName(data: Record<string, string>): string {
  const raw = (data["실제 결제 상품"] || data["문의요금제"] || "").trim();
  return raw || "기타";
}

const ASSIGNEE_FIELD_KEYS = [
  "미팅 담당자",
  "담당자",
  "상담담당",
  "상담 담당",
  "문의담당",
  "문의 담당",
  "영업담당",
  "영업 담당",
  "사원명",
  "담당 사원",
  "응대자",
];

function assigneeName(data: Record<string, string>): string {
  for (const key of ASSIGNEE_FIELD_KEYS) {
    const v = String(data[key] ?? "").trim();
    if (v) return v;
  }
  for (const [k, v] of Object.entries(data)) {
    if (/담당|상담사|영업사원/i.test(k)) {
      const t = String(v).trim();
      if (t) return t;
    }
  }
  return "미지정";
}

function sortAssignees(names: string[]): string[] {
  return [...names].sort((a, b) => {
    if (a === "미지정") return 1;
    if (b === "미지정") return -1;
    return a.localeCompare(b, "ko");
  });
}

function consultingStatus(data: Record<string, string>): string {
  return String(data["부재율"] ?? "").trim().replace(/\s+/g, " ");
}

function isOpenBeforeRow(data: Record<string, string>): boolean {
  return String(data["오픈전"] ?? "").trim().toUpperCase() === "TRUE";
}

function isConsultingRow(data: Record<string, string>): boolean {
  if (isOpenBeforeRow(data)) return false;
  const status = consultingStatus(data);
  return status === "상담완료" || status === "부재 상담완료" || status === "부재상담완료";
}

const ABSENCE_STATUSES = new Set(["완전부재", "부재1차", "부재2차"]);

function isAbsenceRow(data: Record<string, string>): boolean {
  const status = consultingStatus(data);
  return ABSENCE_STATUSES.has(status);
}

function isMonthlyPaymentRow(data: Record<string, string>): boolean {
  const inquiryMonth = monthKeyFromDate(data["날짜"] || data["문의 시간"] || data["문의시간"]);
  const paymentMonth = monthKeyFromDate(data["결제일"]);
  return !!(inquiryMonth && paymentMonth && inquiryMonth === paymentMonth);
}

function isActualPaymentRow(data: Record<string, string>): boolean {
  return String(data["실 결제"] ?? "").trim().toUpperCase() === "TRUE";
}

function emptyCounts(): Counts {
  return { inquiries: 0, consulting: 0, openBefore: 0, absences: 0, monthlyPayment: 0, actualPayment: 0 };
}

function withRates(counts: Counts): PaymentRateMetrics {
  return {
    ...counts,
    monthlyRate: counts.consulting > 0 ? counts.monthlyPayment / counts.consulting : null,
    actualRate: counts.consulting > 0 ? counts.actualPayment / counts.consulting : null,
    absenceRate: counts.inquiries > 0 ? counts.absences / counts.inquiries : null,
  };
}

function addToCounts(counts: Counts, data: Record<string, string>) {
  counts.inquiries += 1;
  if (isConsultingRow(data)) counts.consulting += 1;
  if (isOpenBeforeRow(data)) counts.openBefore += 1;
  if (isAbsenceRow(data)) counts.absences += 1;
  if (isMonthlyPaymentRow(data)) counts.monthlyPayment += 1;
  if (isActualPaymentRow(data)) counts.actualPayment += 1;
}

function sumMonthRows(
  rows: Record<string, string>[],
  assigneeFilter: Set<string> | null
): PaymentRateMetrics {
  const counts = emptyCounts();
  for (const data of rows) {
    const assignee = assigneeName(data);
    if (assigneeFilter && !assigneeFilter.has(assignee)) continue;
    addToCounts(counts, data);
  }
  return withRates(counts);
}

function sortPlans(plans: string[]): string[] {
  const order = new Map(PLAN_ORDER.map((p, i) => [p, i]));
  return [...plans].sort((a, b) => {
    const ai = order.get(a) ?? 999;
    const bi = order.get(b) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, "ko");
  });
}

export async function getPaymentRateMeta() {
  const spreadsheetId = env.googleSheets.inquirySpreadsheetId;
  const rows = await prisma.erpSalesInquiry.findMany({
    where: { spreadsheetId },
    select: { sheetName: true, data: true },
  });

  const months = new Set<string>();
  const plans = new Set<string>();
  const dynamicAssignees: string[] = [];

  for (const row of rows) {
    months.add(row.sheetName);
    const data = row.data as Record<string, string>;
    if (data["구분"] !== "신규문의") continue;
    plans.add(planName(data));
    dynamicAssignees.push(assigneeName(data));
  }

  const monthList = [...months].sort((a, b) => b.localeCompare(a));

  return {
    months: monthList,
    industries: [...INDUSTRY_TYPES],
    plans: sortPlans([...plans]),
    assignees: mergeAssigneeList(dynamicAssignees),
    assigneeColors: ASSIGNEE_COLORS,
    presets: buildPresets(monthList),
    channelTree: channelTreeForApi(),
  };
}

function buildPresets(months: string[]) {
  const now = new Date();
  const current = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`;
  const currentMonth = months.includes(current) ? current : months[0];

  const y2025 = months.filter((m) => m.startsWith("2025."));
  const last3 = months.filter((m) => m !== currentMonth).slice(0, 3);

  return [
    { id: "y2025", label: "2025년 전체", months: y2025 },
    { id: "last3", label: "직전 3개월", months: last3 },
    { id: "current", label: "이번 달", months: currentMonth ? [currentMonth] : [] },
  ].filter((p) => p.months.length > 0);
}

export async function computePaymentRate(query: PaymentRateQuery) {
  const spreadsheetId = env.googleSheets.inquirySpreadsheetId;
  const channel = query.channel ?? "all";
  const channels = query.channels;
  const industryList = (query.industries?.length
    ? query.industries
    : query.industry?.trim()
      ? [query.industry.trim()]
      : []
  ).map((name) => name.trim()).filter(Boolean);
  const industryFilter = industryList.length ? new Set(industryList) : null;
  const assigneeFilter = query.assignees?.length ? new Set(query.assignees) : null;

  const monthSet = new Set<string>();
  for (const group of query.groups) {
    for (const month of group.months) monthSet.add(normalizeMonthSheet(month));
  }

  const monthList = [...monthSet];
  if (!monthList.length) {
    return {
      industry: industryList.length ? industryList.join(" · ") : null,
      industries: industryList,
      channel,
      groups: [],
      rows: PAYMENT_RATE_ROWS.map((row) => ({ ...row, values: [] })),
      planTables: [],
      assigneeTables: [],
      timeline: [],
    };
  }

  const dbRows = await prisma.erpSalesInquiry.findMany({
    where: { spreadsheetId, sheetName: { in: monthList } },
    select: { sheetName: true, data: true },
  });

  const byMonth = new Map<string, Record<string, string>[]>();
  for (const month of monthList) byMonth.set(month, []);
  for (const row of dbRows) {
    const data = row.data as Record<string, string>;
    if (data["구분"] !== "신규문의") continue;
    if (industryFilter && !industryFilter.has((data["업종"] || "").trim())) continue;
    if (!rowMatchesChannelFilter(data, channels, channel)) continue;
    byMonth.get(row.sheetName)?.push(data);
  }

  const groups = query.groups.map((group) => {
    const overall = emptyCounts();
    const byPlan = new Map<string, Counts>();
    const byAssignee = new Map<string, Counts>();

    for (const rawMonth of group.months) {
      const month = normalizeMonthSheet(rawMonth);
      for (const data of byMonth.get(month) ?? []) {
        const assignee = assigneeName(data);
        if (assigneeFilter && !assigneeFilter.has(assignee)) continue;
        addToCounts(overall, data);
        const plan = planName(data);
        const planBucket = byPlan.get(plan) ?? emptyCounts();
        addToCounts(planBucket, data);
        byPlan.set(plan, planBucket);
        const assigneeBucket = byAssignee.get(assignee) ?? emptyCounts();
        addToCounts(assigneeBucket, data);
        byAssignee.set(assignee, assigneeBucket);
      }
    }

    const plans = sortPlans([...byPlan.keys()]);
    const assignees = sortAssignees([...byAssignee.keys()]);
    const monthSeries = group.months
      .map(normalizeMonthSheet)
      .sort((a, b) => a.localeCompare(b))
      .map((month) => ({
        month,
        metrics: sumMonthRows(byMonth.get(month) ?? [], assigneeFilter),
      }));
    return {
      id: group.id,
      label: group.label,
      months: group.months.map(normalizeMonthSheet),
      overall: withRates(overall),
      byMonth: monthSeries,
      byPlan: plans.map((plan) => ({
        plan,
        metrics: withRates(byPlan.get(plan) ?? emptyCounts()),
      })),
      byAssignee: assignees.map((name) => ({
        assignee: name,
        metrics: withRates(byAssignee.get(name) ?? emptyCounts()),
      })),
    };
  });

  const timeline = [...monthSet]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => ({
      month,
      metrics: sumMonthRows(byMonth.get(month) ?? [], assigneeFilter),
    }));

  const rows = PAYMENT_RATE_ROWS.map((row) => ({
    ...row,
    values: groups.map((g) => g.overall[row.key as keyof PaymentRateMetrics]),
  }));

  return {
    industry: industryList.length ? industryList.join(" · ") : null,
    industries: industryList,
    channel,
    channels: channels ?? [],
    assignees: assigneeFilter ? [...assigneeFilter] : [],
    groups: groups.map(({ id, label, months, overall, byMonth }) => ({ id, label, months, overall, byMonth })),
    rows,
    timeline,
    planTables: groups.map((g) => ({
      groupId: g.id,
      groupLabel: g.label,
      plans: g.byPlan,
    })),
    assigneeTables: groups.map((g) => ({
      groupId: g.id,
      groupLabel: g.label,
      assignees: g.byAssignee,
    })),
  };
}
