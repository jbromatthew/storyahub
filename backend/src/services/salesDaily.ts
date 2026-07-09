import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  parseInquiryRowDate,
  parseOrderRowDate,
} from "./googleSheets.js";
import { INDUSTRY_TYPES } from "./industryTypes.js";

const INQUIRY_TYPE = "신규문의";
const ORDER_TYPE = "신규센터";
const KST = "Asia/Seoul";

export type DailyPeriod = "day" | "week" | "month";

export type DailyIndustryRow = {
  industry: string;
  inquiries: number;
  orders: number;
};

export type SalesDailyData = {
  period: DailyPeriod;
  date: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  monthSheets: string[];
  timezone: string;
  inquirySource: string;
  orderSource: string;
  inquiryFilter: string;
  orderFilter: string;
  rows: DailyIndustryRow[];
  totals: {
    inquiries: number;
    orders: number;
  };
  syncedInquiryThrough: string | null;
  syncedOrderThrough: string | null;
};

export type SalesDailyQuery = {
  date?: string;
  period?: DailyPeriod;
};

function dateKeyInKst(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateKey(dateKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { y, m, d };
}

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function isValidDateKey(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function isValidPeriod(period: string | undefined): period is DailyPeriod {
  return period === "day" || period === "week" || period === "month";
}

function monthSheetFromDateKey(dateKey: string): string {
  const [y, m] = dateKey.split("-");
  return `${y}.${m}.`;
}

function monthSheetsBetween(startDate: string, endDate: string): string[] {
  const sheets = new Set<string>();
  let cursor = startDate.slice(0, 7) + "-01";
  const endMonth = endDate.slice(0, 7) + "-01";
  while (cursor <= endMonth) {
    sheets.add(monthSheetFromDateKey(cursor));
    const { y, m } = parseDateKey(cursor);
    cursor = toDateKey(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);
  }
  return [...sheets];
}

function resolveRange(anchor: string, period: DailyPeriod): { startDate: string; endDate: string } {
  if (period === "day") {
    return { startDate: anchor, endDate: anchor };
  }
  if (period === "month") {
    const [y, m] = anchor.split("-");
    const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return {
      startDate: `${y}-${m}-01`,
      endDate: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  const { y, m, d } = parseDateKey(anchor);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const sundayOffset = -dow;
  const startDate = addDays(anchor, sundayOffset);
  return { startDate, endDate: addDays(startDate, 6) };
}

function formatDayLabel(dateKey: string): string {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatRangeLabel(
  period: DailyPeriod,
  anchor: string,
  startDate: string,
  endDate: string
): string {
  if (period === "day") return formatDayLabel(anchor);
  if (period === "month") {
    const [y, m] = anchor.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, 1));
    return dt.toLocaleDateString("ko-KR", { timeZone: KST, year: "numeric", month: "long" });
  }
  const start = startDate.replace(/-/g, ".");
  const end = endDate.replace(/-/g, ".");
  return `${start} ~ ${end}`;
}

function industryName(data: Record<string, string>): string {
  const raw = (data["업종"] || "").trim();
  return raw || "확인불가";
}

function sortIndustries(labels: string[]): string[] {
  const order = new Map<string, number>(INDUSTRY_TYPES.map((label, i) => [label, i]));
  return [...labels].sort((a, b) => {
    const ai = order.get(a);
    const bi = order.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b, "ko");
  });
}

function dateInRange(dateKey: string, startDate: string, endDate: string): boolean {
  return dateKey >= startDate && dateKey <= endDate;
}

export async function getSalesDaily(query?: SalesDailyQuery): Promise<SalesDailyData> {
  const period: DailyPeriod = isValidPeriod(query?.period) ? query.period : "day";
  const anchor =
    query?.date && isValidDateKey(query.date) ? query.date : dateKeyInKst();
  const { startDate, endDate } = resolveRange(anchor, period);
  const monthSheets = monthSheetsBetween(startDate, endDate);

  const inquirySpreadsheetId = env.googleSheets.inquirySpreadsheetId;
  const orderSpreadsheetId = env.googleSheets.orderSpreadsheetId;

  const [inquiryRows, orderRows, latestInquiry, latestOrder] = await Promise.all([
    prisma.erpSalesInquiry.findMany({
      where: { spreadsheetId: inquirySpreadsheetId, sheetName: { in: monthSheets } },
      select: { data: true },
    }),
    prisma.erpSalesOrder.findMany({
      where: { spreadsheetId: orderSpreadsheetId, sheetName: { in: monthSheets } },
      select: { data: true },
    }),
    prisma.erpSalesInquiry.findFirst({
      where: { spreadsheetId: inquirySpreadsheetId },
      orderBy: { syncedAt: "desc" },
      select: { sheetName: true },
    }),
    prisma.erpSalesOrder.findFirst({
      where: { spreadsheetId: orderSpreadsheetId },
      orderBy: { syncedAt: "desc" },
      select: { sheetName: true },
    }),
  ]);

  const byIndustry = new Map<string, { inquiries: number; orders: number }>();

  const bump = (industry: string, field: "inquiries" | "orders") => {
    const bucket = byIndustry.get(industry) ?? { inquiries: 0, orders: 0 };
    bucket[field] += 1;
    byIndustry.set(industry, bucket);
  };

  for (const row of inquiryRows) {
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== INQUIRY_TYPE) continue;
    const rowDate = parseInquiryRowDate(data);
    if (!rowDate || !dateInRange(rowDate, startDate, endDate)) continue;
    bump(industryName(data), "inquiries");
  }

  for (const row of orderRows) {
    const data = row.data as Record<string, string>;
    if ((data["구분"] || "").trim() !== ORDER_TYPE) continue;
    const rowDate = parseOrderRowDate(data);
    if (!rowDate || !dateInRange(rowDate, startDate, endDate)) continue;
    bump(industryName(data), "orders");
  }

  const industries = sortIndustries([...byIndustry.keys()]);
  const rows: DailyIndustryRow[] = industries.map((industry) => {
    const counts = byIndustry.get(industry)!;
    return { industry, inquiries: counts.inquiries, orders: counts.orders };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      inquiries: acc.inquiries + row.inquiries,
      orders: acc.orders + row.orders,
    }),
    { inquiries: 0, orders: 0 }
  );

  return {
    period,
    date: anchor,
    startDate,
    endDate,
    rangeLabel: formatRangeLabel(period, anchor, startDate, endDate),
    monthSheets,
    timezone: KST,
    inquirySource: "상품 문의 관리",
    orderSource: "결제 주문 내역",
    inquiryFilter: INQUIRY_TYPE,
    orderFilter: ORDER_TYPE,
    rows,
    totals,
    syncedInquiryThrough: latestInquiry?.sheetName ?? null,
    syncedOrderThrough: latestOrder?.sheetName ?? null,
  };
}
