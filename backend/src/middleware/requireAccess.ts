import type { Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "./auth.js";
import { env } from "../env.js";
import { getAccessStatus, inGracePeriod } from "../services/access.js";
import type { AccessStatus } from "../services/access.js";

export interface AccessRequest extends AuthedRequest {
  access?: AccessStatus;
}

async function loadAccess(req: AccessRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: "no token" });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: "not found" });

  const access = getAccessStatus(user);
  req.access = access;

  if (env.erpMode) return next();

  if (!access.hasAccess && !inGracePeriod(user)) {
    if (!user.accessEndedAt) {
      const ended = access.accessUntil ?? new Date();
      await prisma.user.update({ where: { id: user.id }, data: { accessEndedAt: ended } });
    }
    return res.status(402).json({
      error: "이용 기간이 만료되었습니다. 요금제를 선택해 주세요.",
      reason: access.reason,
      purgeAt: access.purgeAt,
    });
  }

  next();
}

/** 읽기는 유예(7일) 중 허용, 쓰기는 체험·유료 활성 시에만 */
export async function requireAccess(req: AccessRequest, res: Response, next: NextFunction) {
  await loadAccess(req, res, () => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.access?.hasAccess) {
      return res.status(402).json({
        error: "결제 유예 기간입니다. 새 기록·수정은 불가하고, 데이터는 곧 삭제됩니다.",
        purgeAt: req.access?.purgeAt,
      });
    }
    next();
  });
}

export const requireAccessChain = [auth, requireAccess];
