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
  setSessionCookie(res, signToken(user.id, remember), remember);
  return { user: publicUser(user) };
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
  setSessionCookie(res, signToken(user.id, true), true);
  res.json({ ok: true });
});

authRouter.get("/me", auth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "not found" });
  res.json({ user: publicUser(user) });
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
