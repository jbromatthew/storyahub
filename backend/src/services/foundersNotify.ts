/**
 * FOUNDERS 접수 알림 — 새 접수가 들어올 때마다 채널톡 방에 한 줄.
 *
 * 고쳐서 다시 낸 것은 알리지 않는다. 새로 들어온 것만 알린다.
 * 발송이 막혀도 접수는 막지 않는다 — 기다리지 않고 던져두고 실패는 로그만 남긴다.
 */
import { prisma } from "../db.js";

/** 보낼 방. 따로 정하지 않았으면 기본 방으로 간다. */
function groupId(): string {
  return (process.env.FOUNDERS_CHANNELTALK_GROUP_ID || process.env.CHANNELTALK_GROUP_ID || "").trim();
}

function daysToDeadline(closesAt: Date | null): number | null {
  if (!closesAt) return null;
  const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const a = Date.parse(kst(new Date()) + "T00:00:00Z");
  const b = Date.parse(kst(closesAt) + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
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

/** 새 접수 한 건을 알린다 (참가자·참관객 공통) */
export async function notifyFoundersApply(roundId: string, kind: string): Promise<void> {
  if (!groupId()) return;
  const round = await prisma.erpFoundersRound.findUnique({ where: { id: roundId } });
  const [applicants, visitors] = await Promise.all([
    prisma.erpFoundersApply.count({ where: { roundId, kind: "applicant" } }),
    prisma.erpFoundersApply.count({ where: { roundId, kind: "visitor", status: { not: "cancelled" } } }),
  ]);
  const who = kind === "visitor" ? "참관객" : "참가자";
  const left = daysToDeadline(round?.closesAt ?? null);

  await send([
    // 회차 이름을 그대로 쓴다 — 이름이 바뀌면 알림도 따라간다
    `[${round?.title || "FOUNDERS"}]`,
    "",
    `${who} 1명 추가 신청하였습니다`,
    "",
    `참가자 ${applicants}명 · 참관객 ${visitors}명`,
    ...(left === null ? [] : [
      left > 0 ? `접수 마감까지 ${left}일` : left === 0 ? "오늘 접수 마감" : "접수 마감됨",
    ]),
  ].join("\n"));
}

/** 접수 흐름에서 부르는 자리 — 기다리지 않는다 */
export function notifyFoundersApplySoon(roundId: string, kind: string): void {
  if (!groupId()) return;
  void notifyFoundersApply(roundId, kind).catch((e) => {
    console.error("[founders-notify] 실패:", e instanceof Error ? e.message : e);
  });
}
