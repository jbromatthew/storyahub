import { prisma } from "../db.js";
import { env } from "../env.js";
import { parseOrderRowDate, parseOrderRowMonth } from "./googleSheets.js";

/** 세금계산서 발행 대상(세금계산서=필요)인데 아직 발행 안 된(처리여부≠TRUE & 발행날짜 없음) 결제 건 목록 */

const NEW_CENTER_TYPE = "신규센터";

export type TaxInvoiceItem = {
  month: string;
  date: string | null;
  center: string;
  bizNo: string;
  rep: string;
  email: string;
  phone: string;
  receiptType: string;
  manager: string;
  plan: string;
  amount: number;
  memo: string;
};

export type TaxInvoiceData = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  months: string[];
  items: TaxInvoiceItem[];
  totals: { count: number; amount: number };
  syncedThrough: string | null;
};

function field(data: Record<string, string>, key: string): string {
  return (data[key] || "").trim();
}

function parseAmount(raw: string): number {
  const s = (raw || "").replace(/[₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isTaxTarget(data: Record<string, string>): boolean {
  return field(data, "세금계산서") === "필요";
}

function isIssued(data: Record<string, string>): boolean {
  const status = field(data, "처리여부").toUpperCase();
  if (status === "TRUE" || status === "O" || status === "발행" || status === "완료") return true;
  return !!field(data, "발행날짜");
}

function monthLabel(sheetName: string, data: Record<string, string>): string {
  const m = sheetName.trim().match(/^(\d{4})\.(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const rowMonth = parseOrderRowMonth(data);
  if (rowMonth) {
    const mm = rowMonth.match(/^(\d{4})\.(\d{2})/);
    if (mm) return `${mm[1]}-${mm[2]}`;
  }
  return sheetName.trim();
}

export async function getUnissuedTaxInvoices(opts?: { month?: string }): Promise<TaxInvoiceData> {
  const spreadsheetId = env.googleSheets.orderSpreadsheetId;
  const rows = await prisma.erpSalesOrder.findMany({
    where: { spreadsheetId },
    select: { data: true, sheetName: true },
  });

  const items: TaxInvoiceItem[] = [];
  const monthSet = new Set<string>();

  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if (field(data, "구분") !== NEW_CENTER_TYPE) continue;
    if (!isTaxTarget(data)) continue;
    if (isIssued(data)) continue;

    const month = monthLabel(row.sheetName, data);
    monthSet.add(month);
    if (opts?.month && opts.month !== month) continue;

    items.push({
      month,
      date: parseOrderRowDate(data),
      center: field(data, "센터명") || "확인불가",
      bizNo: field(data, "사업자번호"),
      rep: field(data, "대표자"),
      email: field(data, "이메일"),
      phone: field(data, "매장 연락처"),
      receiptType: field(data, "영수/청구"),
      manager: field(data, "결제 담당자"),
      plan: field(data, "기본 요금제"),
      amount: parseAmount(field(data, "총매출") || field(data, "합계")),
      memo: field(data, "상품명 / 비고"),
    });
  }

  items.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.center.localeCompare(b.center, "ko"));

  const latest = await prisma.erpSalesOrder.findFirst({
    where: { spreadsheetId },
    orderBy: { syncedAt: "desc" },
    select: { sheetName: true },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    months: [...monthSet].sort((a, b) => b.localeCompare(a)),
    items,
    totals: { count: items.length, amount: items.reduce((s, it) => s + it.amount, 0) },
    syncedThrough: latest?.sheetName ?? null,
  };
}
