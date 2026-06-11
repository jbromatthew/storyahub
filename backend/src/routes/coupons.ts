import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { extendPlanUntil } from "../services/access.js";
import { publicUser } from "./auth.js";
import { env } from "../env.js";

export const couponsRouter = Router();

couponsRouter.post("/redeem", auth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ code: z.string().min(1).max(64) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "쿠폰 코드를 입력하세요" });

  const code = parsed.data.code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) return res.status(404).json({ error: "유효하지 않은 쿠폰입니다" });
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return res.status(410).json({ error: "만료된 쿠폰입니다" });
  }

  if (coupon.kind === "once" && coupon.useCount >= 1) {
    return res.status(409).json({ error: "이미 사용된 쿠폰입니다" });
  }

  const existing = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId: req.userId! } },
  });
  if (existing && coupon.kind !== "unlimited") {
    return res.status(409).json({ error: "이미 등록한 쿠폰입니다" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "not found" });

  const planDays = coupon.planDays ?? 30;
  const data: Parameters<typeof prisma.user.update>[0]["data"] = {
    accessEndedAt: null,
  };

  if (coupon.lifetimeAccess) {
    data.lifetimeAccess = true;
    data.plan = coupon.plan ?? user.plan ?? "pro";
    data.planUntil = null;
  } else if (coupon.plan) {
    data.lifetimeAccess = false;
    data.plan = coupon.plan;
    data.planUntil = extendPlanUntil(user.planUntil, planDays);
  } else {
    return res.status(400).json({ error: "쿠폰 설정이 올바르지 않습니다" });
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data }),
    prisma.couponRedemption.create({ data: { couponId: coupon.id, userId: user.id } }),
    prisma.coupon.update({ where: { id: coupon.id }, data: { useCount: { increment: 1 } } }),
  ]);

  res.json({ ok: true, user: publicUser(updated) });
});

couponsRouter.post("/admin/create", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!env.couponAdminSecret || secret !== env.couponAdminSecret) {
    return res.status(403).json({ error: "forbidden" });
  }

  const parsed = z
    .object({
      code: z.string().min(3).max(32).optional(),
      kind: z.enum(["once", "multi", "unlimited"]).default("once"),
      plan: z.enum(["lite", "pro", "ultra", "custom"]).optional(),
      planDays: z.number().int().min(1).max(3650).optional(),
      lifetimeAccess: z.boolean().optional(),
      note: z.string().max(200).optional(),
      expiresAt: z.string().datetime().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "입력 오류" });

  const { kind, plan, planDays, lifetimeAccess, note, expiresAt } = parsed.data;
  if (!lifetimeAccess && !plan) {
    return res.status(400).json({ error: "plan 또는 lifetimeAccess가 필요합니다" });
  }

  const code = (parsed.data.code ?? randomBytes(4).toString("hex")).toUpperCase();
  const exists = await prisma.coupon.findUnique({ where: { code } });
  if (exists) return res.status(409).json({ error: "이미 있는 코드입니다" });

  const coupon = await prisma.coupon.create({
    data: {
      code,
      kind,
      plan: plan ?? null,
      planDays: planDays ?? 30,
      lifetimeAccess: lifetimeAccess ?? false,
      note: note ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  res.status(201).json({ coupon });
});
