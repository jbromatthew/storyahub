import { listAvailableMonthSheets, syncSalesSheet } from "./salesSync.js";

/**
 * 세일즈 시트 자동 동기화 — 매일 KST 10:00~20:00, 30분마다.
 * (15:00·18:30 채널톡 보고는 발송 직전에 별도로 한 번 더 동기화)
 * 문의·결제 현재 월 탭(월초 3일까지는 지난달 탭도)을 동기화한다.
 * 수동 동기화와 겹쳐도 advisory lock으로 안전.
 */
// 10:00 ~ 20:00 을 30분으로 끊는다 (10:00, 10:30 … 20:00)
const SLOTS = Array.from({ length: 21 }, (_, i) => {
  const t = 10 * 60 + i * 30;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
});
let lastRunKey = ""; // "YYYY-MM-DD HH:MM" — 같은 슬롯 중복 실행 방지

/** 시트 탭 이름 "YYYY.MM." — offset 0이면 이번 달, -1이면 지난달 (KST 기준) */
function kstMonthTab(offset = 0): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
}

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

/** 방금 끝낸 동기화의 분(minute). 보고 직전 동기화와 정시 슬롯이 겹칠 때 두 번 돌지 않게 한다. */
let lastSyncMinute = "";

export async function runAutoSync(day: number): Promise<void> {
  // 12:00·15:00·18:30은 보고 슬롯이면서 동기화 슬롯이라 1분 안에 두 번 불린다
  const minute = `${kstNow().date} ${kstNow().hhmm}`;
  if (lastSyncMinute === minute) {
    console.log(`[sales-auto-sync] ${minute} 방금 돌았으므로 건너뜁니다`);
    return;
  }
  lastSyncMinute = minute;

  for (const kind of ["inquiry", "order"] as const) {
    try {
      const sheets = await listAvailableMonthSheets(kind);
      /* 이번 달 탭 (+ 월초 3일까지는 지난달 탭도 마감 반영).
         '최신 탭'을 쓰면 다음 달 탭을 미리 만들어둔 순간 이번 달이 동기화에서 빠진다.
         이번 달 탭이 아직 없을 때만 최신 탭으로 물러선다. */
      const wanted = day <= 3 ? [kstMonthTab(0), kstMonthTab(-1)] : [kstMonthTab(0)];
      let targets = wanted.filter((t) => sheets.includes(t));
      if (!targets.length) targets = sheets.slice(0, 1);
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
