import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";

export const productsRouter = Router();
productsRouter.use(auth, requireAccess);

productsRouter.get("/", async (req: AuthedRequest, res) => {
  const activeOnly = req.query.active !== "0";
  const products = await prisma.product.findMany({
    where: { userId: req.userId!, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(products);
});

productsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, name, category, unit, sellPrice, cost, description, active, sortOrder } = req.body ?? {};

  if (id) {
    const existing = await prisma.product.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: "not found" });

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim() || existing.name;
    if (category !== undefined) data.category = category ? String(category).trim() : null;
    if (unit !== undefined) data.unit = String(unit).trim() || "식";
    if (sellPrice !== undefined) data.sellPrice = Math.max(0, Math.round(Number(sellPrice) || 0));
    if (cost !== undefined) data.cost = Math.max(0, Math.round(Number(cost) || 0));
    if (description !== undefined) data.description = description || null;
    if (active !== undefined) data.active = !!active;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;

    const product = await prisma.product.update({ where: { id }, data });
    return res.json(product);
  }

  const trimmed = String(name ?? "").trim();
  if (!trimmed) return res.status(400).json({ error: "품목명을 입력하세요" });

  const count = await prisma.product.count({ where: { userId } });
  const product = await prisma.product.create({
    data: {
      userId,
      name: trimmed,
      category: category ? String(category).trim() : null,
      unit: String(unit ?? "식").trim() || "식",
      sellPrice: Math.max(0, Math.round(Number(sellPrice) || 0)),
      cost: Math.max(0, Math.round(Number(cost) || 0)),
      description: description || null,
      active: active !== false,
      sortOrder: sortOrder ?? count,
    },
  });
  res.json(product);
});

productsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId } });
  if (!product) return res.status(404).json({ error: "not found" });
  await prisma.product.update({ where: { id: product.id }, data: { active: false } });
  res.status(204).send();
});
