import { getSalesDaily, type SalesDailyData } from "./salesDaily.js";

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

function summarize(label: string, d: SalesDailyData): string {
  const totals = d.rows.reduce(
    (a, r) => ({ inq: a.inq + r.inquiries, ord: a.ord + r.orders }),
    { inq: 0, ord: 0 }
  );
  const top = d.rows
    .filter((r) => r.inquiries + r.orders > 0)
    .sort((a, b) => b.inquiries + b.orders - (a.inquiries + a.orders))
    .slice(0, 5)
    .map((r) => `${r.industry} 문의${r.inquiries}/결제${r.orders}`)
    .join(" · ");
  return `【${label}】 문의 ${totals.inq}건 · 결제 ${totals.ord}건${top ? `\n  ${top}` : ""}`;
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
  return [
    `📊 문의/결제 자동 보고 (${hhmm} 기준)`,
    summarize(`일일 · ${day.rangeLabel}`, day),
    summarize(`주간 · ${week.rangeLabel}`, week),
    summarize(`월간 · ${month.rangeLabel}`, month),
  ].join("\n\n");
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
