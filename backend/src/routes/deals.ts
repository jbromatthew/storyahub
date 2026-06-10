import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";

export const dealsRouter = Router();
dealsRouter.use(auth);

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
  const wonAt = stage === "성사" ? new Date() : null;
  const data = { contactId, title, stage: stage ?? "리드", supplyAmount: supplyAmount ?? 0, quoteKey, wonAt };
  if (id) {
    const existing = await prisma.deal.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: "not found" });
    const deal = await prisma.deal.update({ where: { id }, data });
    return res.json({ ...deal, ...withVat(deal.supplyAmount) });
  }
  const deal = await prisma.deal.create({ data: { ...data, userId } });
  res.json({ ...deal, ...withVat(deal.supplyAmount) });
});
