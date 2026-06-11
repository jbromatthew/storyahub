import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";

export const dealsRouter = Router();
dealsRouter.use(auth, requireAccess);

// 부가세/합계는 저장하지 않고 응답 시 계산(곱셈). AI/토큰 미사용.
function withVat(supplyAmount: number) {
  return { supplyAmount, vat: Math.round(supplyAmount * 0.1), total: Math.round(supplyAmount * 1.1) };
}

dealsRouter.get("/", async (req: AuthedRequest, res) => {
  const deals = await prisma.deal.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });

  // 이번 달 매출 = 이번 달에 성사된 딜의 공급가액 합
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonThisMonth = deals.filter((d) => d.stage === "성사" && d.wonAt && d.wonAt >= monthStart);
  const supplySum = wonThisMonth.reduce((s, d) => s + d.supplyAmount, 0);
  const pipeline = deals.filter((d) => !["성사", "실패"].includes(d.stage)).reduce((s, d) => s + d.supplyAmount, 0);

  res.json({
    deals: deals.map((d) => ({ ...d, ...withVat(d.supplyAmount) })),
    revenueThisMonth: withVat(supplySum),
    pipeline,
  });
});

dealsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, contactId, title, stage, supplyAmount, quoteKey } = req.body ?? {};

  if (id) {
    const existing = await prisma.deal.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: "not found" });

    const data: Record<string, unknown> = {};
    if (contactId !== undefined) data.contactId = contactId;
    if (title !== undefined) data.title = title;
    if (stage !== undefined) {
      data.stage = stage;
      data.wonAt = stage === "성사" ? existing.wonAt ?? new Date() : null;
    }
    if (supplyAmount !== undefined) data.supplyAmount = supplyAmount;
    if (quoteKey !== undefined) data.quoteKey = quoteKey;

    const deal = await prisma.deal.update({ where: { id }, data });
    return res.json({ ...deal, ...withVat(deal.supplyAmount) });
  }

  const deal = await prisma.deal.create({
    data: {
      userId,
      contactId: contactId ?? null,
      title: title ?? "딜",
      stage: stage ?? "리드",
      supplyAmount: supplyAmount ?? 0,
      quoteKey: quoteKey ?? null,
      wonAt: stage === "성사" ? new Date() : null,
    },
  });
  res.json({ ...deal, ...withVat(deal.supplyAmount) });
});

dealsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const d = await prisma.deal.findFirst({ where: { id: req.params.id, userId } });
  if (!d) return res.status(404).json({ error: "not found" });
  await prisma.deal.delete({ where: { id: d.id } });
  res.status(204).send();
});
