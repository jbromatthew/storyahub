/**
 * 스마트상점 접수 현황 — 매일 KST 18:00 채널톡 보고.
 *
 * 접수가 마감(회차 deadline)될 때까지만 돈다. 마감이 지나면 스스로 멈춘다.
 * 채널톡 키가 없으면 조용히 건너뛴다.
 */
import { prisma } from "../db.js";

const SLOT = "18:00";
let lastRunKey = "";

function kstNow(): { date: string; hhmm: string; label: string } {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year").replace(".", "");
  const m = get("month").replace(".", "").trim();
  const d = get("day").replace(".", "").trim();
  return {
    date: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    label: `${Number(m)}월 ${Number(d)}일(${get("weekday")})`,
  };
}

/** "9.30(수) 17:00" 같은 안내 문구에서 마감 날짜만 읽는다 */
function deadlineDate(text: string | null, year: number): string | null {
  const m = String(text ?? "").match(/(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (!m) return null;
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function daysLeft(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

export async function buildSmartStoreReport(): Promise<string | null> {
  const round = await prisma.erpSmartStoreRound.findFirst({
    where: { active: true },
    orderBy: [{ year: "desc" }, { round: "desc" }],
  });
  if (!round) return null;

  const rows = await prisma.erpSmartStoreApply.findMany({
    where: { roundId: round.id },
    select: { stage: true, isCustomer: true, source: true, createdAt: true },
  });

  const now = kstNow();
  const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const today = rows.filter((r) => kstDay(r.createdAt) === now.date).length;

  const done = rows.filter((r) => r.stage === "done").length;
  const start = rows.length - done;
  const isNew = rows.filter((r) => r.isCustomer === false).length;
  const isOld = rows.filter((r) => r.isCustomer === true).length;
  const unknownCustomer = rows.length - isNew - isOld;
  const marketing = rows.filter((r) => r.source === "marketing").length;
  const sales = rows.filter((r) => r.source === "sales").length;
  const unknownSource = rows.length - marketing - sales;

  const dl = deadlineDate(round.deadline, round.year);
  const left = dl ? daysLeft(now.date, dl) : null;

  const tail = (n: number) => (n ? ` (미상 ${n})` : "");
  return [
    `[스마트상점 ${round.title}] ${now.label} ${SLOT}`,
    "",
    `접수 총 ${rows.length}건${today ? ` · 오늘 +${today}` : " · 오늘 추가 없음"}`,
    "",
    `신청완료 ${done}건 · 진행중 ${start}건`,
    "",
    `신규 ${isNew}건 · 기존 ${isOld}건${tail(unknownCustomer)}`,
    `마케팅 ${marketing}건 · 세일즈 ${sales}건${tail(unknownSource)}`,
    ...(left === null ? [] : [
      "",
      left > 0 ? `마감까지 ${left}일 (${round.deadline})`
        : left === 0 ? `오늘 마감 (${round.deadline})`
          : `마감 지남 (${round.deadline})`,
    ]),
  ].join("\n");
}

async function sendToChannelTalk(text: string): Promise<void> {
  const key = process.env.CHANNELTALK_ACCESS_KEY;
  const secret = process.env.CHANNELTALK_ACCESS_SECRET;
  const groupId = process.env.CHANNELTALK_GROUP_ID;
  if (!key || !secret || !groupId) {
    console.log("[smartstore-report] 채널톡 키 미설정 — 발송 생략");
    return;
  }
  const res = await fetch(`https://api.channel.io/open/v5/groups/${groupId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-key": key, "x-access-secret": secret },
    body: JSON.stringify({ blocks: [{ type: "text", value: text }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`채널톡 발송 실패 ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** 수동 발송 — 키가 없으면 글만 돌려준다 */
export async function sendSmartStoreReportNow(): Promise<{ sent: boolean; text: string }> {
  const text = await buildSmartStoreReport();
  if (!text) return { sent: false, text: "열려 있는 회차가 없습니다" };
  const configured = !!(process.env.CHANNELTALK_ACCESS_KEY && process.env.CHANNELTALK_ACCESS_SECRET && process.env.CHANNELTALK_GROUP_ID);
  if (configured) await sendToChannelTalk(text);
  return { sent: configured, text };
}

export function startSmartStoreReport(): void {
  setInterval(() => {
    const { date, hhmm } = kstNow();
    if (hhmm !== SLOT) return;
    const key = `${date} ${hhmm}`;
    if (lastRunKey === key) return;
    lastRunKey = key;
    void (async () => {
      try {
        const round = await prisma.erpSmartStoreRound.findFirst({
          where: { active: true }, orderBy: [{ year: "desc" }, { round: "desc" }],
        });
        const dl = round ? deadlineDate(round.deadline, round.year) : null;
        // 마감 다음 날부터는 보내지 않는다 — 끝난 접수를 매일 알릴 이유가 없다
        if (dl && daysLeft(date, dl) < 0) {
          console.log(`[smartstore-report] ${key} 마감(${round?.deadline})이 지나 보내지 않습니다`);
          return;
        }
        const text = await buildSmartStoreReport();
        if (!text) return;
        await sendToChannelTalk(text);
        console.log(`[smartstore-report] ${key} 발송 완료`);
      } catch (e) {
        console.error("[smartstore-report] 실패:", e instanceof Error ? e.message : e);
      }
    })();
  }, 30 * 1000);
}
