import type { Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { env } from "../env.js";
import type { AuthedRequest } from "./auth.js";
import { resolveErpAccess, type ErpAccessInfo } from "../services/erpAccess.js";

export interface ErpMemberRequest extends AuthedRequest {
  erpAccess?: ErpAccessInfo;
}

// 접속기록 — (이메일, KST 날짜)당 1분에 최대 1회만 DB 기록 (hits = 활동 분 수 근사치)
const accessLogThrottle = new Map<string, number>();

function kstDate(now: number): string {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function logErpAccess(email: string, name?: string | null): void {
  if (!email) return;
  const now = Date.now();
  const date = kstDate(now);
  const key = `${email}|${date}`;
  const prev = accessLogThrottle.get(key) ?? 0;
  if (now - prev < 60_000) return;
  accessLogThrottle.set(key, now);
  if (accessLogThrottle.size > 5000) {
    // 날짜가 지난 키 정리
    for (const k of accessLogThrottle.keys()) {
      if (!k.endsWith(date)) accessLogThrottle.delete(k);
    }
  }
  void prisma.erpAccessLog
    .upsert({
      where: { email_date: { email, date } },
      create: { email, date, name: name || null },
      update: { lastAt: new Date(), hits: { increment: 1 }, ...(name ? { name } : {}) },
    })
    .catch(() => {});
}

export async function requireErpMember(req: ErpMemberRequest, res: Response, next: NextFunction) {
  if (!env.erpMode) return next();
  if (!req.userId) return res.status(401).json({ error: "no token" });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: "not found" });

  const access = await resolveErpAccess(user.id, user.email);
  req.erpAccess = access;
  logErpAccess(user.email.trim().toLowerCase(), user.name);

  if (access.status !== "approved") {
    const msg =
      access.status === "pending"
        ? "관리자 승인 대기 중입니다. 승인 후 이용할 수 있습니다."
        : "접근 권한이 없습니다. 관리자에게 초대를 요청하세요.";
    return res.status(403).json({ error: msg, erpAccess: access });
  }

  if (access.employeeId) {
    const emp = await prisma.erpEmployee.findUnique({ where: { id: access.employeeId } });
    if (emp?.status === "resigned") {
      return res.status(403).json({ error: "퇴사 처리된 계정입니다." });
    }
    if (emp?.status === "leave") {
      return res.status(403).json({ error: "휴직 중인 계정입니다." });
    }
  }

  next();
}
