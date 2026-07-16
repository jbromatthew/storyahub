import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { google, type sheets_v4 } from "googleapis";
import { env } from "../env.js";

const MONTH_SHEET_RE = /^\d{4}\.\d{2}\.?$/;
const INQUIRY_RAW_SHEET_RE = /2023\.03\s*~\s*Raw/i;
const ORDER_RAW_SHEET_RE = /2022\.06\s*~\s*Raw/i;
/** 2025년 10월 이전(2025.09.까지)은 Raw 시트에서 월별 분리 */
const INQUIRY_HISTORICAL_CUTOFF_YM = 202510;
/** 2026년 1월 이전은 결제 주문 Raw 시트에서 월별 분리 */
export const ORDER_MONTHLY_SYNC_FROM_YM = 202601;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export type SheetRow = {
  sheetRow: number;
  externalKey: string;
  data: Record<string, string>;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

let sheetsClient: sheets_v4.Sheets | null = null;

function resolveServiceAccountPath(filePath: string): string {
  if (!filePath) return "";
  return isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
}

export function isGoogleSheetsConfigured(): boolean {
  const file = env.googleSheets.serviceAccountFile.trim();
  if (file && existsSync(resolveServiceAccountPath(file))) return true;
  return !!env.googleSheets.serviceAccountJson.trim();
}

function parseServiceAccountJson(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("서비스 계정 JSON에 client_email 또는 private_key가 없습니다");
  }
  return parsed;
}

function parseServiceAccount(): ServiceAccount {
  const file = env.googleSheets.serviceAccountFile.trim();
  if (file) {
    const abs = resolveServiceAccountPath(file);
    if (!existsSync(abs)) {
      throw new Error(`서비스 계정 파일을 찾을 수 없습니다: ${file}`);
    }
    try {
      return parseServiceAccountJson(readFileSync(abs, "utf8"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`서비스 계정 파일 파싱 실패: ${msg}`);
    }
  }

  const raw = env.googleSheets.serviceAccountJson.trim();
  if (!raw) {
    throw new Error(
      "GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE 또는 GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON이 설정되지 않았습니다"
    );
  }
  try {
    return parseServiceAccountJson(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`서비스 계정 JSON 파싱 실패: ${msg}`);
  }
}

function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;
  const creds = parseServiceAccount();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [SHEETS_SCOPE],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export function isValidMonthSheetName(name: string): boolean {
  return MONTH_SHEET_RE.test(name.trim());
}

export function isInquiryRawSheetName(name: string): boolean {
  return INQUIRY_RAW_SHEET_RE.test(name.trim());
}

export function isOrderRawSheetName(name: string): boolean {
  return ORDER_RAW_SHEET_RE.test(name.trim());
}

export function isHistoricalInquiryMonth(monthKey: string): boolean {
  const m = monthKey.trim().match(/^(\d{4})\.(\d{2})/);
  if (!m) return false;
  const ym = Number(m[1]) * 100 + Number(m[2]);
  return ym < INQUIRY_HISTORICAL_CUTOFF_YM;
}

export function isHistoricalOrderMonth(monthKey: string): boolean {
  const m = monthKey.trim().match(/^(\d{4})\.(\d{2})/);
  if (!m) return false;
  const ym = Number(m[1]) * 100 + Number(m[2]);
  return ym < ORDER_MONTHLY_SYNC_FROM_YM;
}

/** 결제 주문 행의 날짜 → YYYY.MM. */
export function parseOrderRowMonth(data: Record<string, string>): string | null {
  const candidates = [
    data["날짜"],
    data["입금 날짜"],
    data["입금일"],
    data["결제일"],
    data["_col_1"],
  ];
  for (const [key, val] of Object.entries(data)) {
    if (/날짜/i.test(key)) candidates.push(val);
  }
  for (const raw of candidates.filter(Boolean)) {
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})[-/.](\d{2})/);
    if (m) return `${m[1]}.${m[2]}.`;
  }
  return null;
}

/** 문의 행의 날짜 → YYYY.MM. (문의 시간 / 날짜 컬럼 기준) */
export function parseInquiryRowMonth(data: Record<string, string>): string | null {
  const candidates = [
    data["문의 시간"],
    data["문의시간"],
    data["날짜"],
    data["_col_1"],
    data["_col_2"],
  ];
  for (const [key, val] of Object.entries(data)) {
    if (/^날짜/i.test(key)) candidates.push(val);
  }
  for (const raw of candidates.filter(Boolean)) {
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})[-/.](\d{2})/);
    if (m) return `${m[1]}.${m[2]}.`;
  }
  return null;
}

function hasValidDateValue(raw: unknown): boolean {
  return /^\d{4}[-/.]/.test(String(raw ?? "").trim());
}

function extractDateKey(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function firstDateKey(candidates: unknown[]): string | null {
  for (const raw of candidates) {
    const key = extractDateKey(raw);
    if (key) return key;
  }
  return null;
}

/** 결제 주문 행의 날짜 → YYYY-MM-DD */
export function parseOrderRowDate(data: Record<string, string>): string | null {
  const candidates = [
    data["날짜"],
    data["입금 날짜"],
    data["입금일"],
    data["결제일"],
    data["_col_1"],
  ];
  for (const [key, val] of Object.entries(data)) {
    if (/날짜/i.test(key)) candidates.push(val);
  }
  return firstDateKey(candidates.filter(Boolean));
}

/** 문의 행의 날짜 → YYYY-MM-DD */
export function parseInquiryRowDate(data: Record<string, string>): string | null {
  const candidates = [
    data["문의 시간"],
    data["문의시간"],
    data["날짜"],
    data["_col_1"],
    data["_col_2"],
  ];
  for (const [key, val] of Object.entries(data)) {
    if (/^날짜|문의\s*시간/i.test(key)) candidates.push(val);
  }
  return firstDateKey(candidates.filter(Boolean));
}

/** 결제 주문: 날짜가 있는 행만 실제 주문 (헤더명이 월마다 다름) */
export function isValidOrderRow(
  data: Record<string, string>,
  firstCellValue?: string
): boolean {
  if (hasValidDateValue(firstCellValue)) return true;
  const dateKeys = ["날짜", "입금 날짜", "입금일", "결제일", "G", "_col_1"];
  for (const key of dateKeys) {
    if (hasValidDateValue(data[key])) return true;
  }
  return false;
}

/** 상품 문의: 날짜/문의시간이 있는 행만 실제 리드 */
export function isValidInquiryRow(
  data: Record<string, string>,
  firstCellValue?: string
): boolean {
  if (hasValidDateValue(firstCellValue)) return true;
  if (parseInquiryRowMonth(data)) return true;
  for (const [key, val] of Object.entries(data)) {
    if (/날짜|문의\s*시간/i.test(key) && hasValidDateValue(val)) return true;
  }
  return false;
}

export function normalizeMonthSheetName(name: string): string {
  const trimmed = name.trim();
  if (isInquiryRawSheetName(trimmed) || isOrderRawSheetName(trimmed)) return trimmed;
  if (!isValidMonthSheetName(trimmed)) {
    throw new Error(`유효하지 않은 월별 시트명입니다: ${name}`);
  }
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value).trim();
}

function rowHasContent(cells: string[]): boolean {
  return cells.some((c) => c.trim() !== "");
}

function normalizeHeaderName(
  raw: unknown,
  index: number,
  used: Map<string, number>
): string {
  let name = cellToString(raw);
  if (!name) return "";
  const count = used.get(name) ?? 0;
  if (count > 0) name = `${name}_${count + 1}`;
  used.set(name, count + 1);
  return name;
}

/** 1행 헤더만 사용. 데이터 영역([0, lastNamed]) 안의 빈 헤더 컬럼은 `_col_N`(1-based)으로
 *  유지한다 — 일부 월 탭은 날짜가 헤더 없는 첫 컬럼에 들어있어(예: 2025.11.), 이를 버리면
 *  isValidInquiryRow가 대부분의 행을 "날짜 없음"으로 판단해 누락시킨다(신규문의 314→3).
 *  시트 우측 요약 영역(lastNamed 이후의 빈 헤더)은 여전히 제외된다. */
export function buildSheetHeaders(headerRow: unknown[]): {
  names: string[];
  indices: number[];
} {
  const used = new Map<string, number>();
  let lastNamed = -1;
  for (let i = 0; i < headerRow.length; i++) {
    if (cellToString(headerRow[i])) lastNamed = i;
  }
  if (lastNamed < 0) return { names: [], indices: [] };

  const names: string[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= lastNamed; i++) {
    const name = normalizeHeaderName(headerRow[i], i, used) || `_col_${i + 1}`;
    names.push(name);
    indices.push(i);
  }
  return { names, indices };
}

function rowToRecord(indices: number[], names: string[], row: unknown[]): Record<string, string> {
  const data: Record<string, string> = {};
  for (let j = 0; j < indices.length; j++) {
    data[names[j]] = cellToString(row[indices[j]]);
  }
  return data;
}

/** 시트 1행 기준 컬럼명 (데이터 보기·필터용 정렬) */
export async function fetchSheetColumnNames(
  spreadsheetId: string,
  sheetName: string
): Promise<string[]> {
  const sheets = getSheetsClient();
  const range = `${quoteSheetName(sheetName)}!1:1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return buildSheetHeaders(res.data.values?.[0] ?? []).names;
}

export function inquiryExternalKey(data: Record<string, string>, sheetRow: number): string {
  const idKeys = ["문의번호", "번호", "ID", "id", "_col_1"];
  for (const key of idKeys) {
    const val = data[key]?.trim();
    if (val && /^\d+$/.test(val)) return `id:${val}`;
  }
  const firstVal = Object.values(data)[0]?.trim();
  if (firstVal && /^\d+$/.test(firstVal)) return `id:${firstVal}`;
  return `row:${sheetRow}`;
}

export function orderExternalKey(sheetRow: number): string {
  return `row:${sheetRow}`;
}

/** 스프레드시트의 모든 탭 이름 (필터 없이) */
export async function listSheetTitles(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return (
    meta.data.sheets?.map((s) => s.properties?.title).filter((t): t is string => !!t) ?? []
  );
}

export async function listMonthSheets(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles =
    meta.data.sheets
      ?.map((s) => s.properties?.title)
      .filter((t): t is string => !!t && isValidMonthSheetName(t)) ?? [];
  return titles.sort((a, b) => b.localeCompare(a));
}

/** 상품 문의: 월별 동기화 대상 (Raw 제외) */
export async function listInquiryMonthlySyncSheets(spreadsheetId: string): Promise<string[]> {
  return listMonthSheets(spreadsheetId);
}

/** 결제 주문: 2026.01. 이후 월별 동기화 대상 */
export async function listOrderMonthlySyncSheets(spreadsheetId: string): Promise<string[]> {
  const sheets = await listMonthSheets(spreadsheetId);
  return sheets.filter((name) => {
    const m = name.match(/^(\d{4})\.(\d{2})/);
    if (!m) return false;
    const ym = Number(m[1]) * 100 + Number(m[2]);
    return ym >= ORDER_MONTHLY_SYNC_FROM_YM;
  });
}

/** 2023.03 ~ Raw 아카이브 탭 이름 (있으면) */
export async function findInquiryRawSheetName(spreadsheetId: string): Promise<string | null> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles =
    meta.data.sheets?.map((s) => s.properties?.title).filter((t): t is string => !!t) ?? [];
  return titles.find(isInquiryRawSheetName) ?? null;
}

/** 2022.06 ~ Raw 아카이브 탭 이름 (있으면) */
export async function findOrderRawSheetName(spreadsheetId: string): Promise<string | null> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles =
    meta.data.sheets?.map((s) => s.properties?.title).filter((t): t is string => !!t) ?? [];
  return titles.find(isOrderRawSheetName) ?? null;
}

export async function fetchSheetRows(
  spreadsheetId: string,
  sheetName: string,
  kind: "inquiry" | "order"
): Promise<SheetRow[]> {
  const sheets = getSheetsClient();
  const range = `${quoteSheetName(sheetName)}!A:ZZ`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = res.data.values ?? [];
  if (values.length < 2) return [];

  const { names, indices } = buildSheetHeaders(values[0] ?? []);
  if (!names.length) return [];

  const rows: SheetRow[] = [];
  const usedKeys = new Set<string>();

  for (let i = 1; i < values.length; i++) {
    const raw = values[i] ?? [];
    const cells = indices.map((idx) => cellToString(raw[idx]));
    if (!rowHasContent(cells)) continue;

    const sheetRow = i + 1;
    const data = rowToRecord(indices, names, raw);
    const firstCell = cellToString(raw[indices[0]]);

    if (kind === "order" && !isValidOrderRow(data, firstCell)) continue;
    if (kind === "inquiry" && !isValidInquiryRow(data, firstCell)) continue;

    let externalKey =
      kind === "inquiry" ? inquiryExternalKey(data, sheetRow) : orderExternalKey(sheetRow);
    // 같은 월에 externalKey가 겹치면 행번호로 유니크하게 보정
    if (usedKeys.has(externalKey)) {
      externalKey = `${externalKey}@row:${sheetRow}`;
    }
    usedKeys.add(externalKey);
    rows.push({ sheetRow, externalKey, data });
  }

  return rows;
}

/** 시트 전체 그리드 (추이 데이터 등 비표준 레이아웃용) */
export async function fetchSheetGrid(
  spreadsheetId: string,
  sheetName: string
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const range = `${quoteSheetName(sheetName)}!A:ZZ`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return (res.data.values ?? []).map((row) =>
    (row ?? []).map((cell) => cellToString(cell))
  );
}
