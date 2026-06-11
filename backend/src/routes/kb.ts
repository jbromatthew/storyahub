import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";

export const kbRouter = Router();
kbRouter.use(auth, requireAccess);

kbRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await prisma.kbArticle.findMany({ where: { userId: req.userId }, orderBy: { updatedAt: "desc" } }));
});

kbRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, title, category, tags, blocks } = req.body ?? {};
  const data = { title: title ?? "제목 없음", category, tags: tags ?? [], blocks: blocks ?? [] };
  if (id) {
    const existing = await prisma.kbArticle.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: "not found" });
    const art = await prisma.kbArticle.update({ where: { id }, data });
    return res.json(art);
  }
  const art = await prisma.kbArticle.create({ data: { ...data, userId } });
  res.json(art);
});

kbRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const existing = await prisma.kbArticle.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) return res.status(404).json({ error: "not found" });
  await prisma.kbArticle.delete({ where: { id: existing.id } });
  res.status(204).send();
});
