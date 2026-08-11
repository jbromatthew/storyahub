import { getSalesDaily, type SalesDailyData } from "./salesDaily.js";
import { runAutoSync } from "./salesAutoSync.js";

/**
 * 문의/결제 대시보드 요약을 채널톡 그룹(팀챗)으로 자동 보고.
 * 매일 KST 15:00 / 18:30. 환경변수 없으면 조용히 비활성.
 *  - CHANNELTALK_ACCESS_KEY / CHANNELTALK_ACCESS_SECRET: 채널톡 Open API 키
 *  - CHANNELTALK_GROUP_ID: 보낼 그룹(팀챗) ID
 */
const SLOTS = ["15:00", "18:30"];
let lastRunKey = "";

function kstNow(): { date: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hhmm: `${get("hour")}:${get("minute")}` };
}

// 결제율 분석의 빠른 검색 분류와 동일 — 그 외 업종은 기타업종으로 집계
const INDUSTRY_GROUPS: Array<{ label: string; industries: string[] }> = [
  { label: "헬스/PT", industries: ["헬스장", "PT샵"] },
  { label: "스튜디오", industries: ["필라테스", "요가", "바레", "폴댄스"] },
  { label: "체육관", industries: ["복싱", "주짓수", "유도", "합기도", "레슬링", "검도", "MMA", "크로스핏", "체육교실", "태권도"] },
];

function totalsOf(d: SalesDailyData): { inq: number; ord: number } {
  return d.rows.reduce((a, r) => ({ inq: a.inq + r.inquiries, ord: a.ord + r.orders }), { inq: 0, ord: 0 });
}

function inquiryGroupLines(d: SalesDailyData): string[] {
  const counts = new Map<string, number>();
  for (const r of d.rows) {
    if (!r.inquiries) continue;
    const grp = INDUSTRY_GROUPS.find((g) => g.industries.includes(r.industry));
    const label = grp ? grp.label : "기타업종";
    counts.set(label, (counts.get(label) ?? 0) + r.inquiries);
  }
  const order = [...INDUSTRY_GROUPS.map((g) => g.label), "기타"];
  return order.map((l) => ` • ${l} : ${counts.get(l === "기타" ? "기타업종" : l) ?? 0}건`);
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

export async function buildSalesReportText(hhmm: string): Promise<string> {
  const [day, week, month] = await Promise.all([
    getSalesDaily({ period: "day" }),
    getSalesDaily({ period: "week" }),
    getSalesDaily({ period: "month" }),
  ]);
  const title = hhmm <= "16:00" ? "[중간보고]" : "[마감보고]";
  const monthLabel = (month.rangeLabel.match(/(\d+)월/) || [])[1] || "";
  const dTot = totalsOf(day);
  const lines = [
    title,
    `당일 문의 : ${dTot.inq}건`,
    ...inquiryGroupLines(day),
    "",
    `주간 문의 : ${totalsOf(week).inq}건`,
    "",
    `당월 문의 : ${totalsOf(month).inq}건`,
    "",
    "금일 신규 결제",
    ` • 현재 : ${dTot.ord}개`,
    "",
    `[${monthLabel}월 총 신규]`,
    ` • 총 : ${totalsOf(month).ord}건`,
  ];
  return lines.join("\n");
}

/** 수동 발송 (테스트·즉시 보고용) — 키 미설정이면 텍스트만 반환 */
export async function sendSalesReportNow(): Promise<{ sent: boolean; text: string }> {
  const { hhmm } = kstNow();
  const text = await buildSalesReportText(hhmm);
  const configured = !!(process.env.CHANNELTALK_ACCESS_KEY && process.env.CHANNELTALK_ACCESS_SECRET && process.env.CHANNELTALK_GROUP_ID);
  if (configured) await sendToChannelTalk(text);
  return { sent: configured, text };
}

async function runReport(hhmm: string): Promise<void> {
  try {
    // 보고 직전에 시트 동기화 → 항상 최신 데이터 기준으로 발송
    const day = Number(kstNow().date.slice(8, 10));
    await runAutoSync(day);
    const text = await buildSalesReportText(hhmm);
    await sendToChannelTalk(text);
    console.log(`[sales-report-bot] ${hhmm} 보고 발송 완료`);
  } catch (e) {
    console.error("[sales-report-bot] 실패:", e instanceof Error ? e.message : e);
  }
}

export function startSalesReportBot(): void {
  setInterval(() => {
    const { date, hhmm } = kstNow();
    if (!SLOTS.includes(hhmm)) return;
    const key = `${date} ${hhmm}`;
    if (lastRunKey === key) return;
    lastRunKey = key;
    void runReport(hhmm);
  }, 30 * 1000);
}
