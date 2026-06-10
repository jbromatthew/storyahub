import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";

export const contactsRouter = Router();
contactsRouter.use(auth);

contactsRouter.get("/", async (req: AuthedRequest, res) => {
  const items = await prisma.contact.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
  res.json(items);
});

contactsRouter.post("/", async (req: AuthedRequest, res) => {
  const { person, company, phone, email, address, group, tags, cardImageKey } = req.body ?? {};
  const c = await prisma.contact.create({
    data: {
      userId: req.userId!,
      person,
      company,
      phone,
      email,
      address,
      group,
      tags: tags ?? [],
      cardImageKey: cardImageKey ?? null,
    },
  });
  res.status(201).json(c);
});

contactsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const cur = await prisma.contact.findFirst({ where: { id: req.params.id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });

  const { person, company, phone, email, address, group, tags, favorite, referredById, meetCount, wonAmount } =
    req.body ?? {};
  const c = await prisma.contact.update({
    where: { id: cur.id },
    data: {
      person: person ?? cur.person,
      company: company ?? cur.company,
      phone: phone ?? cur.phone,
      email: email ?? cur.email,
      address: address ?? cur.address,
      group: group !== undefined ? group : cur.group,
      tags: tags ?? cur.tags,
      favorite: favorite !== undefined ? favorite : cur.favorite,
      referredById: referredById !== undefined ? referredById : cur.referredById,
      meetCount: meetCount ?? cur.meetCount,
      wonAmount: wonAmount ?? cur.wonAmount,
    },
  });
  res.json(c);
});

contactsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const c = await prisma.contact.findFirst({
    where: { id: req.params.id, userId },
    include: { meetings: { orderBy: { createdAt: "desc" } }, deals: { orderBy: { createdAt: "desc" } } },
  });
  if (!c) return res.status(404).json({ error: "not found" });
  const [upcomingEvents, openTodos] = await Promise.all([
    prisma.event.findMany({
      where: { userId, contactId: c.id, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
    prisma.todo.findMany({
      where: { userId, contactId: c.id, status: { not: "done" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  res.json({ ...c, upcomingEvents, openTodos });
});
