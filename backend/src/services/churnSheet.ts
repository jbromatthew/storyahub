/**
 * 이탈 센터 — 구글시트 「이탈센터 목록」을 읽어 온다.
 *
 * 시트가 원본이다. 우리는 보고 세기만 하므로, 동기화할 때마다 통째로
 * 갈아끼운다 (1,300줄 남짓이라 한 번에 읽어도 무겁지 않다).
 * 머리글은 3행, 값은 4행부터. 오른쪽 R열 너머는 시트 안에서 따로 쓰는
 * 집계표라 건드리지 않는다.
 */
import { google } from "googleapis";
import { prisma } from "../db.js";
import { env } from "../env.js";

const SHEET_TAB = "이탈센터 목록";
const RANGE = `'${SHEET_TAB}'!B3:P3000`;

function sheetId(): string {
  return (process.env.CHURN_SHEET_ID || "1Opw6BmQbUJgldDc0nhC_n1WCcr7lxrHRz_jg0h27rhE").trim();
}

function client() {
  const auth = new google.auth.GoogleAuth({
    keyFile: env.googleSheets.serviceAccountFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

const txt = (v: unknown) => String(v ?? "").trim();

/** "2024-03-05" · "2024. 3. 5" 같은 것을 YYYY-MM-DD 로 */
function isoDate(raw: string): string {
  const s = raw.replace(/\./g, "-").replace(/\s/g, "");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export async function syncChurnCenters(): Promise<{ rows: number; months: number }> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: RANGE,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const grid = res.data.values ?? [];
  if (!grid.length) throw new Error("이탈센터 목록 시트를 읽지 못했습니다");

  const head = (grid[0] ?? []).map((h) => txt(h));
  const col = (name: string) => head.indexOf(name);
  const iDate = col("이탈날짜");
  if (iDate < 0) throw new Error("머리글에서 「이탈날짜」를 찾지 못했습니다");

  const pick = (row: string[], name: string) => {
    const i = col(name);
    return i < 0 ? "" : txt(row[i]);
  };
  // 「비고」가 두 번 나온다 — 앞의 것만 쓴다
  const rows: Array<Record<string, unknown>> = [];
  const months = new Set<string>();

  grid.slice(1).forEach((raw, i) => {
    const row = (raw ?? []) as string[];
    const churnDate = isoDate(txt(row[iDate]));
    if (!churnDate) return;               // 날짜 없는 줄은 데이터가 아니다
    const used = Number(pick(row, "이용개월"));
    const month = churnDate.slice(0, 7);
    months.add(month);
    rows.push({
      sheetRow: i + 4,                    // 머리글이 3행이라 값은 4행부터
      churnDate,
      month,
      kind: pick(row, "구분"),
      industry: pick(row, "업종"),
      centerName: pick(row, "센터명"),
      joinYear: pick(row, "가입 연도"),
      plan: pick(row, "요금제"),
      reason: pick(row, "이탈사유"),
      service: pick(row, "서비스"),
      program: pick(row, "이탈프로그램"),
      detail: pick(row, "세부내용").slice(0, 2000),
      note: pick(row, "비고").slice(0, 500),
      firstPaidAt: pick(row, "첫 결제일"),
      usedMonths: Number.isFinite(used) && pick(row, "이용개월") !== "" ? Math.round(used) : null,
      week: pick(row, "주차"),
    });
  });

  // 통째로 갈아끼운다 — 시트에서 줄이 지워졌으면 여기서도 사라져야 한다
  await prisma.$transaction([
    prisma.erpChurnCenter.deleteMany({}),
    prisma.erpChurnCenter.createMany({ data: rows as never }),
  ]);

  return { rows: rows.length, months: months.size };
}

/* ── 월간 추이 — 이탈률의 분모 ── */

const TREND_SHEET_ID = "1cAQ4v5VlB5e7bfJHDn3RcUFsvrByWNt9h8zYuMjaHGg";
const TREND_TAB = "전체";
/** 이 달부터 쓴다 — 그 앞은 칸이 비어 있어 분모가 없다 */
const TREND_FROM = "2022-01";

/** "3,706" · "-" · "" → 숫자 또는 null */
function num(v: unknown): number | null {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  if (!s || s === "-" || s.startsWith("#")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function syncChurnMonthly(): Promise<{ months: number }> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: (process.env.CHURN_TREND_SHEET_ID || TREND_SHEET_ID).trim(),
    range: `'${TREND_TAB}'!B5:T200`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const grid = res.data.values ?? [];
  if (!grid.length) throw new Error("월간 추이 「전체」 탭을 읽지 못했습니다");

  const head = (grid[0] ?? []).map((h) => txt(h));
  const idx = (name: string) => head.indexOf(name);
  // 「%」 열이 값 열 사이사이에 끼어 있어 이름으로만 집는다
  const iMonth = idx("Month");
  if (iMonth < 0) throw new Error("머리글에서 「Month」를 찾지 못했습니다");

  // 이번 달까지만 — 그 뒤는 시트가 미리 깔아 둔 예상치다
  const nowKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);

  const rows: Array<Record<string, unknown>> = [];
  for (const raw of grid.slice(1)) {
    const row = (raw ?? []) as string[];
    const month = txt(row[iMonth]);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;   // 합계·평균 줄은 걸러진다
    if (month < TREND_FROM || month > nowKst) continue;
    const at = (name: string) => (idx(name) < 0 ? null : num(row[idx(name)]));
    rows.push({
      month,
      activeCenters: at("활성센터"),
      recurring: at("정기결제"),
      yearPass: at("1년권"),
      bankTransfer: at("계좌이체"),
      renewDue: at("재결제 수"),
      churnTotal: at("총 이탈"),
      churnMid: at("중도이탈"),
      churnConv: at("전환이탈"),
      renewed: at("전환결제"),
    });
  }

  await prisma.$transaction([
    prisma.erpChurnMonthly.deleteMany({}),
    prisma.erpChurnMonthly.createMany({ data: rows as never }),
  ]);
  return { months: rows.length };
}

/* ── 매일 한 번 시트에서 다시 읽어 온다 ── */

const SLOT = "18:00";   // KST
let lastRunKey = "";

function kstNow(): { date: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year").replace(".", "");
  const m = get("month").replace(".", "").trim().padStart(2, "0");
  const d = get("day").replace(".", "").trim().padStart(2, "0");
  return { date: `${y}-${m}-${d}`, hhmm: `${get("hour")}:${get("minute")}` };
}

export function startChurnSync(): void {
  setInterval(() => {
    const { date, hhmm } = kstNow();
    if (hhmm !== SLOT) return;
    const key = `${date} ${hhmm}`;
    if (lastRunKey === key) return;
    lastRunKey = key;
    void (async () => {
      try {
        const r = await syncChurnCenters();
        const t = await syncChurnMonthly();
        console.log(`[churn-sync] ${key} ${r.rows}줄 · 월간추이 ${t.months}개월`);
      } catch (e) {
        console.error("[churn-sync] 실패:", e instanceof Error ? e.message : e);
      }
    })();
  }, 30 * 1000);
}
