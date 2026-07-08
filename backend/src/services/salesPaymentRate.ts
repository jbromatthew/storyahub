import { prisma } from "../db.js";
import { env } from "../env.js";
import { isHistoricalInquiryMonth } from "./googleSheets.js";
import {
  channelTreeForApi,
  matchesChannelSelection,
  matchesLegacyChannel,
} from "./marketingChannels.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";

export type ChannelFilter = "all" | "organic" | "non-organic";

export type PaymentRateGroupInput = {
  id: string;
  label: string;
  months: string[];
};

export type PaymentRateQuery = {
  industry?: string;
  channel?: ChannelFilter;
  channels?: string[];
  groups: PaymentRateGroupInput[];
};

type Counts = {
  inquiries: number;
  consulting: number;
  monthlyPayment: number;
  actualPayment: number;
};

export type PaymentRateMetrics = Counts & {
  monthlyRate: number | null;
  actualRate: number | null;
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

function isConsultingRow(data: Record<string, string>): boolean {
  const status = String(data["부재율"] ?? "").trim();
  return status === "상담완료" || status === "부재 상담완료";
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
  return { inquiries: 0, consulting: 0, monthlyPayment: 0, actualPayment: 0 };
}

function withRates(counts: Counts): PaymentRateMetrics {
  return {
    ...counts,
    monthlyRate: counts.consulting > 0 ? counts.monthlyPayment / counts.consulting : null,
    actualRate: counts.consulting > 0 ? counts.actualPayment / counts.consulting : null,
  };
}

function addToCounts(counts: Counts, data: Record<string, string>) {
  counts.inquiries += 1;
  if (isConsultingRow(data)) counts.consulting += 1;
  if (isMonthlyPaymentRow(data)) counts.monthlyPayment += 1;
  if (isActualPaymentRow(data)) counts.actualPayment += 1;
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

  for (const row of rows) {
    months.add(row.sheetName);
    const data = row.data as Record<string, string>;
    if (data["구분"] !== "신규문의") continue;
    plans.add(planName(data));
  }

  const monthList = [...months].sort((a, b) => b.localeCompare(a));

  return {
    months: monthList,
    industries: [...INDUSTRY_TYPES],
    plans: sortPlans([...plans]),
    presets: buildPresets(monthList),
    channelTree: channelTreeForApi(),
  };
}

function buildPresets(months: string[]) {
  const now = new Date();
  const current = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.`;
  const currentMonth = months.includes(current) ? current : months[0];

  const y2025 = months.filter((m) => m.startsWith("2025."));
  const last3 = months.filter((m) => !isHistoricalInquiryMonth(m)).slice(0, 3);

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
  const industry = query.industry?.trim() || undefined;

  const monthSet = new Set<string>();
  for (const group of query.groups) {
    for (const month of group.months) monthSet.add(normalizeMonthSheet(month));
  }

  const monthList = [...monthSet];
  if (!monthList.length) {
    return {
      industry: industry ?? null,
      channel,
      groups: [],
      rows: PAYMENT_RATE_ROWS.map((row) => ({ ...row, values: [] })),
      planTables: [],
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
    if (industry && data["업종"] !== industry) continue;
    if (!rowMatchesChannelFilter(data, channels, channel)) continue;
    byMonth.get(row.sheetName)?.push(data);
  }

  const groups = query.groups.map((group) => {
    const overall = emptyCounts();
    const byPlan = new Map<string, Counts>();

    for (const rawMonth of group.months) {
      const month = normalizeMonthSheet(rawMonth);
      for (const data of byMonth.get(month) ?? []) {
        addToCounts(overall, data);
        const plan = planName(data);
        const bucket = byPlan.get(plan) ?? emptyCounts();
        addToCounts(bucket, data);
        byPlan.set(plan, bucket);
      }
    }

    const plans = sortPlans([...byPlan.keys()]);
    return {
      id: group.id,
      label: group.label,
      months: group.months.map(normalizeMonthSheet),
      overall: withRates(overall),
      byPlan: plans.map((plan) => ({
        plan,
        metrics: withRates(byPlan.get(plan) ?? emptyCounts()),
      })),
    };
  });

  const rows = PAYMENT_RATE_ROWS.map((row) => ({
    ...row,
    values: groups.map((g) => g.overall[row.key as keyof PaymentRateMetrics]),
  }));

  return {
    industry: industry ?? null,
    channel,
    channels: channels ?? [],
    groups: groups.map(({ id, label, months, overall }) => ({ id, label, months, overall })),
    rows,
    planTables: groups.map((g) => ({
      groupId: g.id,
      groupLabel: g.label,
      plans: g.byPlan,
    })),
  };
}
