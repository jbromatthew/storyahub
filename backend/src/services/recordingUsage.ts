import { prisma } from "../db.js";
import { getAccessStatus } from "./access.js";

const MS_MONTH = 30 * 86400000;

/** 유료 플랜은 30일마다 녹음·변환 사용량 리셋 + 이벤트 로그 */
export async function incrementRecordingSec(
  userId: string,
  seconds: number,
  opts?: { source?: string; meetingId?: string },
): Promise<void> {
  if (seconds <= 0) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const status = getAccessStatus(user);
  const now = new Date();
  let used = user.usedRecordingSec;
  let periodStart = user.recordingPeriodStart;

  if (status.reason === "paid" && !status.lifetimeAccess) {
    if (!periodStart || now.getTime() - periodStart.getTime() >= MS_MONTH) {
      used = 0;
      periodStart = now;
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        usedRecordingSec: used + seconds,
        recordingPeriodStart: periodStart ?? now,
      },
    }),
    prisma.recordingUsageEvent.create({
      data: {
        userId,
        seconds,
        source: opts?.source ?? "live",
        meetingId: opts?.meetingId ?? null,
        plan: status.lifetimeAccess ? "lifetime" : status.isTrial ? "trial" : status.plan,
      },
    }),
  ]);
}
