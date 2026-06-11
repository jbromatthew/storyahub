import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";

export const calendarRouter = Router();
calendarRouter.use(auth, requireAccess);

calendarRouter.get("/", async (req: AuthedRequest, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date("2999-12-31");
  const events = await prisma.event.findMany({
    where: { userId: req.userId, startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: "asc" },
  });
  res.json(events);
});

calendarRouter.post("/", async (req: AuthedRequest, res) => {
  const { title, startsAt, endsAt, place, contactId, reminders } = req.body ?? {};
  const e = await prisma.event.create({
    data: {
      userId: req.userId!,
      title,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      place,
      contactId,
      reminders: reminders ?? ["1시간 전"],
    },
  });
  res.status(201).json(e);
});

calendarRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const cur = await prisma.event.findFirst({ where: { id: req.params.id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  const { title, startsAt, endsAt, place, contactId, reminders } = req.body ?? {};
  const e = await prisma.event.update({
    where: { id: cur.id },
    data: {
      title: title ?? cur.title,
      startsAt: startsAt ? new Date(startsAt) : cur.startsAt,
      endsAt: endsAt !== undefined ? (endsAt ? new Date(endsAt) : null) : cur.endsAt,
      place: place !== undefined ? place : cur.place,
      contactId: contactId !== undefined ? contactId : cur.contactId,
      reminders: reminders ?? cur.reminders,
    },
  });
  res.json(e);
});

calendarRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const cur = await prisma.event.findFirst({ where: { id: req.params.id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  await prisma.event.delete({ where: { id: cur.id } });
  res.status(204).send();
});
