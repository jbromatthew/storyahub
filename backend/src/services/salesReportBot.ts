import { getSalesDaily, type SalesDailyData } from "./salesDaily.js";
import { runAutoSync } from "./salesAutoSync.js";

/**
 * 문의/결제 대시보드 요약을 채널톡 그룹(팀챗)으로 자동 보고.
 * 평일 KST 12:00(오전 중간) / 15:00(오후 중간) / 18:30(마감). 환경변수 없으면 조용히 비활성.
 *  - CHANNELTALK_ACCESS_KEY / CHANNELTALK_ACCESS_SECRET: 채널톡 Open API 키
 *  - CHANNELTALK_GROUP_ID: 보낼 그룹(팀챗) ID
 */
const SLOTS = ["12:00", "15:00", "18:30"];
let lastRunKey = "";

function kstNow(): { date: string; hhmm: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}
/** 주말엔 볼 사람이 없다 — 자동 보고만 막고 수동 발송은 그대로 둔다 */
const isWeekend = (weekday: string) => weekday === "Sat" || weekday === "Sun";

// 결제율 분석의 빠른 검색 분류와 동일 — 그 외 업종은 기타업종으로 집계
const INDUSTRY_GROUPS: Array<{ label: string; industries: string[] }> = [
  { label: "헬스/PT", industries: ["헬스장", "PT샵"] },
  { label: "스튜디오", industries: ["필라테스", "요가", "바레", "폴댄스"] },
  { label: "체육관", industries: ["복싱", "주짓수", "유도", "합기도", "레슬링", "검도", "MMA", "크로스핏", "체육교실", "태권도"] },
];

function totalsOf(d: SalesDailyData): { inq: number; ord: number } {
  return d.rows.reduce((a, r) => ({ inq: a.inq + r.inquiries, ord: a.ord + r.orders }), { inq: 0, ord: 0 });
}

function groupLines(d: SalesDailyData, field: "inquiries" | "orders"): string[] {
  const counts = new Map<string, number>();
  for (const r of d.rows) {
    const n = r[field];
    if (!n) continue;
    const grp = INDUSTRY_GROUPS.find((g) => g.industries.includes(r.industry));
    counts.set(grp ? grp.label : "기타", (counts.get(grp ? grp.label : "기타") ?? 0) + n);
  }
  return [...INDUSTRY_GROUPS.map((g) => g.label), "기타"].map((l) => ` • ${l} : ${counts.get(l) ?? 0}건`);
}

async function sendToChannelTalk(text: string): Promise<void> {
  const key = process.env.CHANNELTALK_ACCESS_KEY;
  const secret = process.env.CHANNELTALK_ACCESS_SECRET;
  const groupId = process.env.CHANNELTALK_GROUP_ID;
  if (!key || !secret || !groupId) {
    console.log("[sales-report-bot] 채널톡 키 미설정 — 발송 생략 (CHANNELTALK_ACCESS_KEY/SECRET/GROUP_ID)");
    return;
  }
  const res = await fetch(`https://api.channel.io/open/v5/groups/${groupId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-key": key,
      "x-access-secret": secret,
    },
    body: JSON.stringify({ blocks: [{ type: "text", value: text }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`채널톡 발송 실패 ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function buildSalesReportTexts(hhmm: string): Promise<{ inquiry: string; order: string }> {
  const [day, week, month] = await Promise.all([
    getSalesDaily({ period: "day" }),
    getSalesDaily({ period: "week" }),
    getSalesDaily({ period: "month" }),
  ]);
  const kind = hhmm <= "13:00" ? "오전 중간" : hhmm <= "16:00" ? "오후 중간" : "마감";
  const inquiry = [
    `[문의 ${kind} 보고]`,
    `당일 문의 : ${totalsOf(day).inq}건`,
    ...groupLines(day, "inquiries"),
    "",
    `주간 문의 : ${totalsOf(week).inq}건`,
    "",
    `당월 문의 : ${totalsOf(month).inq}건`,
  ].join("\n");
  const order = [
    `[결제 ${kind} 보고]`,
    `당일 결제 : ${totalsOf(day).ord}건`,
    ...groupLines(day, "orders"),
    "",
    `주간 결제 : ${totalsOf(week).ord}건`,
    "",
    `당월 결제 : ${totalsOf(month).ord}건`,
  ].join("\n");
  return { inquiry, order };
}

/** 수동 발송 (테스트·즉시 보고용) — 키 미설정이면 텍스트만 반환 */
export async function sendSalesReportNow(): Promise<{ sent: boolean; text: string }> {
  const { hhmm } = kstNow();
  const { inquiry, order } = await buildSalesReportTexts(hhmm);
  const configured = !!(process.env.CHANNELTALK_ACCESS_KEY && process.env.CHANNELTALK_ACCESS_SECRET && process.env.CHANNELTALK_GROUP_ID);
  if (configured) { await sendToChannelTalk(inquiry); await sendToChannelTalk(order); }
  return { sent: configured, text: `${inquiry}\n\n${order}` };
}

async function runReport(hhmm: string): Promise<void> {
  try {
    // 보고 직전에 시트 동기화 → 항상 최신 데이터 기준으로 발송
    const day = Number(kstNow().date.slice(8, 10));
    await runAutoSync(day);
    const { inquiry, order } = await buildSalesReportTexts(hhmm);
    await sendToChannelTalk(inquiry);
    await sendToChannelTalk(order);
    console.log(`[sales-report-bot] ${hhmm} 보고 발송 완료`);
  } catch (e) {
    console.error("[sales-report-bot] 실패:", e instanceof Error ? e.message : e);
  }
}

export function startSalesReportBot(): void {
  setInterval(() => {
    const { date, hhmm, weekday } = kstNow();
    if (!SLOTS.includes(hhmm)) return;
    const key = `${date} ${hhmm}`;
    if (lastRunKey === key) return;
    lastRunKey = key;
    if (isWeekend(weekday)) {
      console.log(`[sales-report-bot] ${key} (${weekday}) 주말이라 건너뜁니다`);
      return;
    }
    void runReport(hhmm);
  }, 30 * 1000);
}
