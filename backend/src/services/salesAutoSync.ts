import { listAvailableMonthSheets, syncSalesSheet } from "./salesSync.js";

/**
 * 세일즈 시트 자동 동기화 — 매일 KST 10:00~20:00 매시 정각.
 * (15:00·18:30 채널톡 보고는 발송 직전에 별도로 한 번 더 동기화)
 * 문의·결제 현재 월 탭(월초 3일까지는 지난달 탭도)을 동기화한다.
 * 수동 동기화와 겹쳐도 advisory lock으로 안전.
 */
const SLOTS = Array.from({ length: 11 }, (_, i) => `${String(10 + i).padStart(2, "0")}:00`); // 10:00 ~ 20:00
let lastRunKey = ""; // "YYYY-MM-DD HH:MM" — 같은 슬롯 중복 실행 방지

function kstNow(): { date: string; hhmm: string; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, hhmm: `${get("hour")}:${get("minute")}`, day: Number(get("day")) };
}

export async function runAutoSync(day: number): Promise<void> {
  for (const kind of ["inquiry", "order"] as const) {
    try {
      const sheets = await listAvailableMonthSheets(kind);
      // 최신 월 탭 (+ 월초 3일까지는 그 다음 최신 탭 = 지난달도 마감 반영)
      const targets = sheets.slice(0, day <= 3 ? 2 : 1);
      for (const sheetName of targets) {
        try {
          const r = await syncSalesSheet(kind, sheetName);
          console.log(`[sales-auto-sync] ${kind} ${sheetName} ok (added ${r.added}, deleted ${r.deleted})`);
        } catch (e) {
          console.error(`[sales-auto-sync] ${kind} ${sheetName} failed:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error(`[sales-auto-sync] ${kind} sheet list failed:`, e instanceof Error ? e.message : e);
    }
  }
}

export function startSalesAutoSync(): void {
  setInterval(() => {
    const { date, hhmm, day } = kstNow();
    if (!SLOTS.includes(hhmm)) return;
    const key = `${date} ${hhmm}`;
    if (lastRunKey === key) return;
    lastRunKey = key;
    console.log(`[sales-auto-sync] run ${key} (KST)`);
    void runAutoSync(day);
  }, 30 * 1000);
}
