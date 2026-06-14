import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { geocodeAddress } from "../services/geocode.js";
import { optionalUserMediaKey } from "../services/mediaValidation.js";

export const contactsRouter = Router();
contactsRouter.use(auth, requireAccess);

async function applyGeocode(address: string | null | undefined, lat?: number | null, lng?: number | null) {
  if (lat != null && lng != null) return { lat, lng };
  if (!address?.trim()) return { lat: null, lng: null };
  const point = await geocodeAddress(address.trim());
  return point ? { lat: point.lat, lng: point.lng } : { lat: null, lng: null };
}

contactsRouter.get("/", async (req: AuthedRequest, res) => {
  const items = await prisma.contact.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
  res.json(items);
});

contactsRouter.post("/geocode-pending", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const pending = await prisma.contact.findMany({
    where: {
      userId,
      address: { not: null },
      OR: [{ lat: null }, { lng: null }],
    },
  });

  let updated = 0;
  for (const c of pending) {
    if (!c.address?.trim()) continue;
    const point = await geocodeAddress(c.address);
    if (!point) continue;
    await prisma.contact.update({
      where: { id: c.id },
      data: { lat: point.lat, lng: point.lng },
    });
    updated++;
  }

  const items = await prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  res.json({ updated, contacts: items });
});

contactsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { person, company, phone, email, address, group, tags, cardImageKey } = req.body ?? {};
  let validatedCardKey: string | null = null;
  try {
    validatedCardKey = optionalUserMediaKey(cardImageKey, userId, "cardImageKey");
  } catch {
    return res.status(400).json({ error: "명함 이미지 키가 올바르지 않습니다" });
  }
  const coords = await applyGeocode(address);
  const c = await prisma.contact.create({
    data: {
      userId,
      person,
      company,
      phone,
      email,
      address,
      ...coords,
      group,
      tags: tags ?? [],
      cardImageKey: validatedCardKey,
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

  const nextAddress = address !== undefined ? address : cur.address;
  const addressChanged = address !== undefined && address !== cur.address;
  let lat = cur.lat;
  let lng = cur.lng;
  if (addressChanged) {
    const coords = await applyGeocode(nextAddress);
    lat = coords.lat;
    lng = coords.lng;
  }

  let nextReferredById = cur.referredById;
  if (referredById !== undefined) {
    if (referredById === null || referredById === "") {
      nextReferredById = null;
    } else {
      const refId = String(referredById);
      if (refId === cur.id) return res.status(400).json({ error: "자기 자신을 소개자로 지정할 수 없습니다" });
      const ref = await prisma.contact.findFirst({ where: { id: refId, userId } });
      if (!ref) return res.status(400).json({ error: "소개자를 찾을 수 없습니다" });
      nextReferredById = ref.id;
    }
  }

  const c = await prisma.contact.update({
    where: { id: cur.id },
    data: {
      person: person ?? cur.person,
      company: company ?? cur.company,
      phone: phone ?? cur.phone,
      email: email ?? cur.email,
      address: nextAddress,
      lat,
      lng,
      group: group !== undefined ? group : cur.group,
      tags: tags ?? cur.tags,
      favorite: favorite !== undefined ? favorite : cur.favorite,
      referredById: nextReferredById,
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

contactsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const id = req.params.id;
  const cur = await prisma.contact.findFirst({ where: { id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });

  await prisma.$transaction([
    prisma.contact.updateMany({ where: { referredById: id }, data: { referredById: null } }),
    prisma.meeting.updateMany({ where: { contactId: id }, data: { contactId: null } }),
    prisma.todo.updateMany({ where: { contactId: id }, data: { contactId: null } }),
    prisma.event.updateMany({ where: { contactId: id }, data: { contactId: null } }),
    prisma.deal.updateMany({ where: { contactId: id }, data: { contactId: null } }),
    prisma.contact.delete({ where: { id } }),
  ]);

  res.status(204).send();
});
