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

/** 읽기는 유예(7일) 중 허용, 쓰기는 체험·유료 활성 시에만.
 *  단 ERP 배포(erpMode)에는 결제/유예/삭제 게이팅을 적용하지 않는다. */
export async function requireAccess(req: AccessRequest, res: Response, next: NextFunction) {
  // 결제 없는 배포(ERP/billingDisabled)에는 체험·구독 만료·유예 개념이 없으므로 통과시킨다.
  if (env.erpMode || env.billingDisabled) return next();

  await loadAccess(req, res, () => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.access?.hasAccess) {
      return res.status(402).json({
        error: "이용 기간이 만료되었습니다. 요금제를 선택해 주세요.",
        purgeAt: req.access?.purgeAt,
      });
    }
    next();
  });
}

export const requireAccessChain = [auth, requireAccess];
