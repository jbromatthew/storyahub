import { prisma } from "../db.js";
import { getAccessStatus } from "./access.js";
import { listUserObjects } from "./r2.js";
import { deleteObjectKeys } from "./r2.js";

export async function purgeExpiredUsers(): Promise<number> {
  const now = new Date();
  const candidates = await prisma.user.findMany({
    where: {
      lifetimeAccess: false,
      OR: [{ accessEndedAt: { not: null } }, { planUntil: { lt: now } }],
    },
    select: { id: true, email: true, accessEndedAt: true, trialStartedAt: true, planUntil: true, lifetimeAccess: true, plan: true },
  });

  let purged = 0;
  for (const u of candidates) {
    const status = getAccessStatus(u as any, now);
    if (status.hasAccess) continue;
    if (!status.purgeAt || status.purgeAt > now) continue;

    try {
      const keys = (await listUserObjects(u.id)).map((o) => o.key);
      if (keys.length) await deleteObjectKeys(keys);

      await prisma.user.delete({ where: { id: u.id } });
      purged += 1;
      console.log(`[purge] deleted user ${u.email} (${u.id})`);
    } catch (e) {
      console.error(`[purge] failed for ${u.id}`, e);
    }
  }
  return purged;
}

export function startPurgeScheduler(intervalMs = 6 * 3600000) {
  const run = () => {
    purgeExpiredUsers()
      .then((n) => n > 0 && console.log(`[purge] removed ${n} user(s)`))
      .catch((e) => console.error("[purge] scheduler error", e));
  };
  run();
  setInterval(run, intervalMs);
}
