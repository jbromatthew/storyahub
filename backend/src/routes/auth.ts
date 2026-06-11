import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { auth, signToken, type AuthedRequest } from "../middleware/auth.js";
import { getUserUsage } from "../services/usage.js";

export const authRouter = Router();

const emailSchema = z.string().email("올바른 이메일을 입력하세요");
const passwordSchema = z.string().min(6, "비밀번호는 6자 이상");

function publicUser(u: User) {
  const trialDays = 7;
  let trialDaysLeft: number | null = null;
  if (u.trialStartedAt) {
    const elapsed = Math.floor((Date.now() - u.trialStartedAt.getTime()) / 86400000);
    trialDaysLeft = Math.max(0, trialDays - elapsed);
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    provider: u.provider,
    onboardingDone: u.onboardingDone,
    trialStartedAt: u.trialStartedAt,
    trialDaysLeft,
    createdAt: u.createdAt,
  };
}

// 이메일 회원가입 (1차 — 소셜 로그인은 추후)
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

  const passwordHash = await bcrypt.hash(password, 10);
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
  res.status(201).json({ token: signToken(user.id, remember), user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "이메일과 비밀번호를 확인하세요" });

  const { email, password } = parsed.data;
  const remember = req.body?.remember !== false;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user?.passwordHash) return res.status(401).json({ error: "이메일 또는 비밀번호가 맞지 않습니다" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "이메일 또는 비밀번호가 맞지 않습니다" });

  res.json({ token: signToken(user.id, remember), user: publicUser(user) });
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

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true, token: signToken(user.id, true) });
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

// 소셜 로그인 — 추후 OAuth 연동
authRouter.post("/social", async (req, res) => {
  const { provider, code } = req.body ?? {};
  if (!provider || !code) return res.status(400).json({ error: "provider, code 필요" });

  const email = `demo+${provider}@storyahub.com`;
  const name = "데모 사용자";

  const user = await prisma.user.upsert({
    where: { email },
    update: { provider },
    create: { email, name, provider, trialStartedAt: new Date() },
  });

  res.json({ token: signToken(user.id), user: publicUser(user) });
});
