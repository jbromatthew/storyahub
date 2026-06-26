import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { optionalUserMediaKey } from "../services/mediaValidation.js";

export const dealsRouter = Router();
dealsRouter.use(auth, requireAccess);

type LineItemInput = {
  id?: string;
  productId?: string | null;
  name?: string;
  category?: string | null;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  lineDiscount?: number;
  sortOrder?: number;
};

function withVat(supplyAmount: number) {
  return { supplyAmount, vat: Math.round(supplyAmount * 0.1), total: Math.round(supplyAmount * 1.1) };
}

function lineSupply(item: { quantity: number; unitPrice: number; lineDiscount?: number }) {
  const qty = Math.max(1, Math.round(item.quantity));
  const price = Math.round(item.unitPrice);
  const perUnitDiscount = Math.max(0, Math.round(Number(item.lineDiscount) || 0));
  const isDiscountLine = price === 0 && perUnitDiscount > 0;
  const discount = isDiscountLine ? perUnitDiscount : perUnitDiscount * qty;
  return qty * price - discount;
}

function lineCost(item: { quantity: number; unitCost: number }) {
  return Math.max(0, Math.round(item.quantity) * Math.round(item.unitCost));
}

function normalizeLineItems(raw: unknown): LineItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      const r = row as LineItemInput;
      const name = String(r.name ?? "").trim();
      if (!name) return null;
      return {
        productId: r.productId || null,
        name,
        category: r.category ? String(r.category).trim() : null,
        unit: String(r.unit ?? "식").trim() || "식",
        quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
        unitPrice: Math.round(Number(r.unitPrice) || 0),
        unitCost: Math.max(0, Math.round(Number(r.unitCost) || 0)),
        lineDiscount: Math.max(0, Math.round(Number(r.lineDiscount) || 0)),
        sortOrder: r.sortOrder ?? i,
      };
    })
    .filter(Boolean) as LineItemInput[];
}

function computeFromLines(lines: LineItemInput[]) {
  const supplyAmount = lines.reduce((s, l) => s + lineSupply(l as { quantity: number; unitPrice: number }), 0);
  const totalCost = lines.reduce((s, l) => s + lineCost(l as { quantity: number; unitCost: number }), 0);
  const margin = supplyAmount - totalCost;
  const marginRate = supplyAmount > 0 ? Math.round((margin / supplyAmount) * 1000) / 10 : 0;
  return { supplyAmount, totalCost, margin, marginRate };
}

async function nextQuoteNumber(userId: string) {
  const now = new Date();
  const prefix = `Q${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const count = await prisma.deal.count({
    where: { userId, quoteNumber: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

const dealInclude = {
  contact: { select: { id: true, person: true, title: true, department: true, company: true, phone: true, email: true, address: true } },
  organization: true,
  lineItems: { orderBy: { sortOrder: "asc" as const } },
};

function enrichDeal(d: {
  supplyAmount: number;
  lineItems?: { quantity: number; unitPrice: number; unitCost: number }[];
}) {
  const vatFields = withVat(d.supplyAmount);
  const lines = d.lineItems || [];
  const totalCost = lines.reduce((s, l) => s + lineCost(l), 0);
  const margin = d.supplyAmount - totalCost;
  const marginRate = d.supplyAmount > 0 ? Math.round((margin / d.supplyAmount) * 1000) / 10 : 0;
  return { ...d, ...vatFields, totalCost, margin, marginRate };
}

dealsRouter.get("/", async (req: AuthedRequest, res) => {
  const deals = await prisma.deal.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { id: true, person: true, title: true, department: true, company: true } },
      organization: { select: { id: true, name: true } },
      lineItems: { select: { quantity: true, unitPrice: true, unitCost: true } },
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonThisMonth = deals.filter((d) => d.stage === "성사" && d.wonAt && d.wonAt >= monthStart);
  const supplySum = wonThisMonth.reduce((s, d) => s + d.supplyAmount, 0);
  const pipeline = deals.filter((d) => !["성사", "실패"].includes(d.stage)).reduce((s, d) => s + d.supplyAmount, 0);

  res.json({
    deals: deals.map((d) => enrichDeal(d)),
    revenueThisMonth: withVat(supplySum),
    pipeline,
  });
});

dealsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const deal = await prisma.deal.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: dealInclude,
  });
  if (!deal) return res.status(404).json({ error: "not found" });
  res.json(enrichDeal(deal));
});

dealsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const {
    id,
    contactId,
    organizationId,
    title,
    stage,
    supplyAmount,
    quoteKey,
    quoteNumber,
    validUntil,
    notes,
    template,
    lineItems: rawLines,
  } = req.body ?? {};

  let validatedQuoteKey: string | null | undefined;
  if (quoteKey !== undefined) {
    try {
      validatedQuoteKey = optionalUserMediaKey(quoteKey, userId, "quoteKey");
    } catch {
      return res.status(400).json({ error: "견적서 키가 올바르지 않습니다" });
    }
  }

  const lines = rawLines !== undefined ? normalizeLineItems(rawLines) : null;
  const computed = lines && lines.length > 0 ? computeFromLines(lines) : null;
  const resolvedSupply =
    computed?.supplyAmount ??
    (supplyAmount !== undefined ? Math.max(0, Math.round(Number(supplyAmount) || 0)) : undefined);

  if (id) {
    const existing = await prisma.deal.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: "not found" });

    const data: Record<string, unknown> = {};
    if (contactId !== undefined) data.contactId = contactId || null;
    if (organizationId !== undefined) data.organizationId = organizationId || null;
    if (title !== undefined) data.title = title;
    if (stage !== undefined) {
      data.stage = stage;
      data.wonAt = stage === "성사" ? existing.wonAt ?? new Date() : null;
    }
    if (resolvedSupply !== undefined) data.supplyAmount = resolvedSupply;
    if (quoteKey !== undefined) data.quoteKey = validatedQuoteKey;
    if (quoteNumber !== undefined) data.quoteNumber = quoteNumber || null;
    if (validUntil !== undefined) data.validUntil = validUntil ? new Date(validUntil) : null;
    if (notes !== undefined) data.notes = notes || null;
    if (template !== undefined) data.template = template || "standard";

    const deal = await prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({ where: { id }, data });
      if (lines !== null) {
        await tx.dealLineItem.deleteMany({ where: { dealId: id } });
        if (lines.length > 0) {
          await tx.dealLineItem.createMany({
            data: lines.map((l, i) => ({
              dealId: id,
              productId: l.productId || null,
              name: l.name!,
              category: l.category || null,
              unit: l.unit!,
              quantity: l.quantity!,
              unitPrice: l.unitPrice!,
              unitCost: l.unitCost!,
              lineDiscount: l.lineDiscount ?? 0,
              sortOrder: l.sortOrder ?? i,
            })),
          });
        }
      }
      return tx.deal.findFirst({ where: { id }, include: dealInclude });
    });

    return res.json(enrichDeal(deal!));
  }

  const autoQuoteNumber = quoteNumber || (await nextQuoteNumber(userId));
  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        userId,
        contactId: contactId ?? null,
        organizationId: organizationId ?? null,
        title: title ?? "견적",
        stage: stage ?? "견적",
        supplyAmount: resolvedSupply ?? 0,
        quoteKey: validatedQuoteKey ?? null,
        quoteNumber: autoQuoteNumber,
        validUntil: validUntil ? new Date(validUntil) : null,
        notes: notes || null,
        template: template || "standard",
        wonAt: stage === "성사" ? new Date() : null,
      },
    });

    if (lines && lines.length > 0) {
      await tx.dealLineItem.createMany({
        data: lines.map((l, i) => ({
          dealId: created.id,
          productId: l.productId || null,
          name: l.name!,
          category: l.category || null,
          unit: l.unit!,
          quantity: l.quantity!,
          unitPrice: l.unitPrice!,
          unitCost: l.unitCost!,
          lineDiscount: l.lineDiscount ?? 0,
          sortOrder: l.sortOrder ?? i,
        })),
      });
    }

    return tx.deal.findFirst({ where: { id: created.id }, include: dealInclude });
  });

  res.json(enrichDeal(deal!));
});

dealsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const d = await prisma.deal.findFirst({ where: { id: req.params.id, userId } });
  if (!d) return res.status(404).json({ error: "not found" });
  await prisma.deal.delete({ where: { id: d.id } });
  res.status(204).send();
});
