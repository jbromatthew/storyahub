import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { auth, signToken, type AuthedRequest } from "../middleware/auth.js";
import { getAccessStatus, extendPlanUntil } from "../services/access.js";
import { getUserUsage } from "../services/usage.js";
import { mergePreferences, normalizePreferencesPatch } from "../services/preferences.js";
import { clearSessionCookie, setSessionCookie } from "../services/sessionCookie.js";
import { env } from "../env.js";
import { resolveErpAccess } from "../services/erpAccess.js";

export const authRouter = Router();

const BCRYPT_ROUNDS = env.bcryptRounds;

const emailSchema = z.string().email("올바른 이메일을 입력하세요");
const passwordSchema = env.isProduction
  ? z
      .string()
      .min(8, "비밀번호는 8자 이상")
      .regex(/[A-Za-z]/, "영문을 포함해야 합니다")
      .regex(/[0-9]/, "숫자를 포함해야 합니다")
  : z.string().min(6, "비밀번호는 6자 이상");
const loginPasswordSchema = z.string().min(1, "비밀번호를 입력하세요");

/** 회사 메일인가 — b2b 주소가 밖에 열려 있어 도메인부터 막는다 */
function allowedSignupDomain(email: string): boolean {
  const at = email.toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return env.erpSignupDomains.includes(domain);
}

export function publicUser(u: User) {
  const access = getAccessStatus(u);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    provider: u.provider,
    onboardingDone: u.onboardingDone,
    trialStartedAt: u.trialStartedAt,
    trialDaysLeft: access.trialDaysLeft,
    hasAccess: access.hasAccess,
    isTrial: access.isTrial,
    accessReason: access.reason,
    accessUntil: access.accessUntil,
    purgeAt: access.purgeAt,
    lifetimeAccess: access.lifetimeAccess,
    plan: access.plan,
    planUntil: access.planUntil,
    allowFileUpload: access.allowFileUpload,
    recordingUsedSec: access.recordingUsedSec,
    recordingLimitSec: access.recordingLimitSec,
    preferences: mergePreferences(u.preferences),
    createdAt: u.createdAt,
  };
}

function issueAuth(res: Response, user: User, remember: boolean) {
  const token = signToken(user.id, remember);
  setSessionCookie(res, token, remember);
  return { token, user: publicUser(user) };
}

async function userWithErpAccess(user: User) {
  const base = publicUser(user);
  if (!env.erpMode) return base;
  const erpAccess = await resolveErpAccess(user.id, user.email);
  return { ...base, erpAccess };
}

authRouter.post("/register", async (req, res) => {
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      name: z.string().min(1).max(50).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "입력 오류" });

  const { email, password, name } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: "이미 가입된 이메일입니다" });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  if (env.erpMode) {
    if (!allowedSignupDomain(email)) {
      return res.status(403).json({
        error: `회사 메일(@${env.erpSignupDomains[0]})로만 가입할 수 있습니다`,
      });
    }
    const lower = email.toLowerCase();
    const invite = await prisma.erpEmployee.findFirst({ where: { email: lower, userId: null } });

    const user = await prisma.user.create({
      data: {
        email: lower,
        passwordHash,
        name: name ?? invite?.name ?? email.split("@")[0],
        provider: "email",
        trialStartedAt: new Date(),
        onboardingDone: true,
        lifetimeAccess: true,
      },
    });

    // 초대가 있으면 그 자리에 붙이고, 없으면 승인 대기로 새로 만든다.
    // 어느 쪽이든 승인 전에는 토큰을 주지 않는다 — 있으면 그 자체로 열쇠가 된다.
    if (invite) {
      await prisma.erpEmployee.update({
        where: { id: invite.id },
        data: { userId: user.id, name: user.name, email: lower },
      });
    } else {
      await prisma.erpEmployee.create({
        data: {
          userId: user.id,
          name: user.name,
          email: lower,
          employeeNo: lower.split("@")[0],
          memberStatus: "pending",
        },
      });
    }

    const access = await resolveErpAccess(user.id, user.email);
    if (access.status !== "approved") {
      return res.status(202).json({
        pending: true,
        error: "가입 신청이 접수되었습니다. 관리자 승인 후 이용할 수 있습니다.",
      });
    }
    const remember = req.body?.remember !== false;
    const token = signToken(user.id, remember);
    setSessionCookie(res, token, remember);
    return res.status(201).json({ token, user: await userWithErpAccess(user) });
  }

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: name ?? email.split("@")[0],
      provider: "email",
      trialStartedAt: new Date(),
      onboardingDone: false,
    },
  });

  const remember = req.body?.remember !== false;
  res.status(201).json(issueAuth(res, user, remember));
});

authRouter.post("/login", async (req, res) => {
  const parsed = z
    .object({ email: emailSchema, password: loginPasswordSchema })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "이메일과 비밀번호를 확인하세요" });

  const { email, password } = parsed.data;
  const remember = req.body?.remember !== false;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user?.passwordHash) return res.status(401).json({ error: "이메일 또는 비밀번호가 맞지 않습니다" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "이메일 또는 비밀번호가 맞지 않습니다" });

  if (env.erpMode) {
    const erpAccess = await resolveErpAccess(user.id, user.email);
    if (erpAccess.status !== "approved") {
      return res.status(403).json({
        error: erpAccess.status === "pending"
          ? "관리자 승인 대기 중입니다. 승인 후 이용할 수 있습니다."
          : erpAccess.status === "rejected"
            ? "가입이 반려된 계정입니다. 관리자에게 문의하세요."
            : "접근 권한이 없습니다. 관리자에게 초대를 요청하세요.",
      });
    }
    const emp = erpAccess.employeeId
      ? await prisma.erpEmployee.findUnique({ where: { id: erpAccess.employeeId } })
      : await prisma.erpEmployee.findUnique({ where: { userId: user.id } });
    if (emp?.status === "resigned") {
      return res.status(403).json({ error: "퇴사 처리된 계정입니다. 관리자에게 문의하세요" });
    }
    if (emp?.status === "leave") {
      return res.status(403).json({ error: "휴직 중인 계정입니다" });
    }
    const token = signToken(user.id, remember);
    setSessionCookie(res, token, remember);
    return res.json({ token, user: await userWithErpAccess(user) });
  }

  res.json(issueAuth(res, user, remember));
});

/** 결제 완료 후 호출 (PG 연동 전 임시·운영 테스트용) */
authRouter.post("/subscribe", auth, async (req: AuthedRequest, res) => {
  if (env.isProduction && !env.allowTestSubscribe) {
    return res.status(403).json({ error: "결제 연동 후 이용 가능합니다" });
  }
  const parsed = z
    .object({ plan: z.enum(["lite", "pro", "ultra", "custom"]) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "플랜을 선택하세요" });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "not found" });

  const planUntil = extendPlanUntil(user.lifetimeAccess ? null : user.planUntil, 30);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: parsed.data.plan,
      planUntil,
      lifetimeAccess: false,
      accessEndedAt: null,
      usedRecordingSec: 0,
      recordingPeriodStart: new Date(),
    },
  });

  res.json({ ok: true, user: publicUser(updated) });
});

authRouter.get("/me/usage", auth, async (req: AuthedRequest, res) => {
  try {
    res.json(await getUserUsage(req.userId!));
  } catch (e) {
    console.error("usage", e);
    res.status(500).json({ error: "용량 정보를 불러오지 못했습니다" });
  }
});

authRouter.patch("/me/password", auth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      currentPassword: passwordSchema,
      newPassword: passwordSchema,
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "입력 오류" });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.passwordHash) {
    return res.status(400).json({ error: "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다" });
  }

  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: "새 비밀번호는 현재와 달라야 합니다" });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "현재 비밀번호가 맞지 않습니다" });

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  const token = signToken(user.id, true);
  setSessionCookie(res, token, true);
  res.json({ ok: true, token });
});

authRouter.get("/me", auth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "not found" });
  res.json({ user: await userWithErpAccess(user) });
});

authRouter.patch("/me", auth, async (req: AuthedRequest, res) => {
  const { name, onboardingDone } = req.body ?? {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed || trimmed.length > 50) {
      return res.status(400).json({ error: "이름은 1~50자여야 합니다" });
    }
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(onboardingDone !== undefined ? { onboardingDone: Boolean(onboardingDone) } : {}),
    },
  });
  res.json({ user: publicUser(user) });
});

authRouter.patch("/me/preferences", auth, async (req: AuthedRequest, res) => {
  const prefs = normalizePreferencesPatch(req.body?.preferences ?? req.body);
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { preferences: prefs as object },
  });
  res.json({ user: publicUser(user) });
});

authRouter.post("/social", async (req, res) => {
  if (env.isProduction && !env.allowDemoAuth) {
    return res.status(403).json({ error: "소셜 로그인은 준비 중입니다" });
  }
  const { provider, code } = req.body ?? {};
  if (!provider || !code) return res.status(400).json({ error: "provider, code 필요" });

  const email = `demo+${provider}@storyahub.com`;
  const name = "데모 사용자";

  const user = await prisma.user.upsert({
    where: { email },
    update: { provider },
    create: { email, name, provider, trialStartedAt: new Date() },
  });

  res.json(issueAuth(res, user, true));
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});
