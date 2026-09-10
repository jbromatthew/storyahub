/**
 * 스마트상점 접수 알림 — 새 접수가 들어올 때마다 채널톡 방에 한 줄.
 *
 * 매일 18:00 보고와는 별개다. 저쪽은 하루치 요약이고, 이쪽은 그때그때다.
 * 이미 낸 사람이 같은 내용을 다시 내는 것은 알리지 않는다.
 * 발송이 막혀도 접수는 막지 않는다 — 기다리지 않고 던져두고 실패는 로그만 남긴다.
 */
import { prisma } from "../db.js";

export type SmartStoreEvent = "lead" | "done";

function groupId(): string {
  return (process.env.SMARTSTORE_CHANNELTALK_GROUP_ID || process.env.CHANNELTALK_GROUP_ID || "").trim();
}

const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** "9.30(수) 17:00" 같은 안내 문구에서 마감 날짜만 읽는다 */
function deadlineDate(text: string | null, year: number): string | null {
  const m = String(text ?? "").match(/(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (!m) return null;
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

async function send(text: string): Promise<void> {
  const key = process.env.CHANNELTALK_ACCESS_KEY;
  const secret = process.env.CHANNELTALK_ACCESS_SECRET;
  const gid = groupId();
  if (!key || !secret || !gid) return;
  const res = await fetch(`https://api.channel.io/open/v5/groups/${gid}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-key": key, "x-access-secret": secret },
    body: JSON.stringify({ blocks: [{ type: "text", value: text }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`채널톡 발송 실패 ${res.status}: ${body.slice(0, 200)}`);
  }
}

const SOURCE_KO: Record<string, string> = { sales: "세일즈", marketing: "마케팅" };

/** 새 접수 한 건을 알린다 */
export async function notifySmartStoreApply(
  roundId: string,
  event: SmartStoreEvent,
  who: { centerName?: string | null; industry?: string | null; isCustomer?: boolean | null;
         source?: string | null; sourceDetail?: string | null; storeId?: string | null },
): Promise<void> {
  if (!groupId()) return;
  const round = await prisma.erpSmartStoreRound.findUnique({ where: { id: roundId } });
  const rows = await prisma.erpSmartStoreApply.findMany({
    where: { roundId },
    select: { stage: true, createdAt: true },
  });

  const today = kstDay(new Date());
  const todayCount = rows.filter((r) => kstDay(r.createdAt) === today).length;
  const done = rows.filter((r) => r.stage === "done").length;
  const going = rows.length - done;

  const dl = round ? deadlineDate(round.deadline, round.year) : null;
  const left = dl
    ? Math.round((Date.parse(dl + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000)
    : null;

  // 누가 왔는지 한 줄로 — 비어 있는 건 아예 빼서 점이 겹치지 않게
  const chan = who.source ? SOURCE_KO[who.source] ?? who.source : "경로 미상";
  const line = [
    who.centerName || null,
    who.industry || null,
    who.isCustomer === true ? "기존 고객" : who.isCustomer === false ? "신규" : null,
    who.sourceDetail ? `${chan} · ${who.sourceDetail}` : chan,
  ].filter(Boolean).join(" · ");

  await send([
    `[스마트상점 ${round?.title || ""}]`.replace(/ \]$/, "]"),
    "",
    event === "done" ? "신청완료 1건이 올라왔습니다" : "접수 1건이 새로 들어왔습니다",
    line,
    ...(event === "done" && who.storeId ? [`스마트상점 ID ${who.storeId}`] : []),
    "",
    `접수 총 ${rows.length}건${todayCount ? ` · 오늘 ${todayCount}건째` : ""}`,
    `신청완료 ${done}건 · 진행중 ${going}건`,
    ...(left === null ? [] : [
      left > 0 ? `마감까지 ${left}일` : left === 0 ? "오늘 마감" : "마감 지남",
    ]),
  ].join("\n"));
}

/** 접수 흐름에서 부르는 자리 — 기다리지 않는다 */
export function notifySmartStoreApplySoon(
  roundId: string,
  event: SmartStoreEvent,
  who: Parameters<typeof notifySmartStoreApply>[2],
): void {
  if (!groupId()) return;
  void notifySmartStoreApply(roundId, event, who).catch((e) => {
    console.error("[smartstore-notify] 실패:", e instanceof Error ? e.message : e);
  });
}
