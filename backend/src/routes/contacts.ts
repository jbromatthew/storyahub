import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { geocodeAddress } from "../services/geocode.js";
import { computeIdentityKey, normalizePhone } from "../services/contactIdentity.js";
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

contactsRouter.post("/import", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rawItems = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  const existing = await prisma.contact.findMany({
    where: { userId },
    select: { identityKey: true, phone: true },
  });
  const identityKeys = new Set(existing.map((c) => c.identityKey).filter(Boolean) as string[]);
  const phones = new Set(
    existing.map((c) => normalizePhone(c.phone)).filter((p) => p.length >= 9),
  );

  let added = 0;
  let skipped = 0;
  for (const raw of rawItems.slice(0, 3000)) {
    const person =
      String(raw?.person ?? raw?.name ?? "").trim() ||
      String(raw?.company ?? "").trim() ||
      "이름 없음";
    const phone = raw?.phone != null ? String(raw.phone).trim() : null;
    const email = raw?.email != null ? String(raw.email).trim() : null;
    const company = raw?.company != null ? String(raw.company).trim() : null;
    const identityKey = computeIdentityKey(person, phone);
    const normPhone = normalizePhone(phone);

    if (identityKey && identityKeys.has(identityKey)) {
      skipped++;
      continue;
    }
    if (normPhone.length >= 9 && phones.has(normPhone)) {
      skipped++;
      continue;
    }

    await prisma.contact.create({
      data: {
        userId,
        person,
        company: company || null,
        phone,
        email: email || null,
        identityKey,
      },
    });
    if (identityKey) identityKeys.add(identityKey);
    if (normPhone.length >= 9) phones.add(normPhone);
    added++;
  }

  const contacts = await prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  res.json({ added, skipped, contacts });
});

contactsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { person, title, department, company, phone, email, address, group, tags, cardImageKey } = req.body ?? {};
  let validatedCardKey: string | null = null;
  try {
    validatedCardKey = optionalUserMediaKey(cardImageKey, userId, "cardImageKey");
  } catch {
    return res.status(400).json({ error: "명함 이미지 키가 올바르지 않습니다" });
  }
  const coords = await applyGeocode(address);
  const personStr = String(person ?? "").trim() || String(company ?? "").trim() || "이름 없음";
  const phoneStr = phone != null ? String(phone).trim() : null;
  const identityKey = computeIdentityKey(personStr, phoneStr);
  const c = await prisma.contact.create({
    data: {
      userId,
      person: personStr,
      title: title ?? null,
      department: department ?? null,
      company,
      phone: phoneStr,
      email,
      address,
      ...coords,
      group,
      tags: tags ?? [],
      cardImageKey: validatedCardKey,
      identityKey,
    },
  });
  const linkedCount = identityKey
    ? await prisma.contact.count({ where: { userId, identityKey } })
    : 1;
  res.status(201).json({ ...c, linkedCount });
});

contactsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const cur = await prisma.contact.findFirst({ where: { id: req.params.id, userId } });
  if (!cur) return res.status(404).json({ error: "not found" });

  const { person, title, department, company, phone, email, address, group, tags, favorite, referredById, meetCount, wonAmount } =
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

  const nextPerson = person ?? cur.person;
  const nextPhone = phone !== undefined ? (phone != null ? String(phone).trim() : null) : cur.phone;
  const identityKey = computeIdentityKey(nextPerson, nextPhone);

  const c = await prisma.contact.update({
    where: { id: cur.id },
    data: {
      person: nextPerson,
      title: title !== undefined ? title : cur.title,
      department: department !== undefined ? department : cur.department,
      company: company ?? cur.company,
      phone: nextPhone,
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
      identityKey,
    },
  });
  res.json(c);
});

contactsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const c = await prisma.contact.findFirst({
    where: { id: req.params.id, userId },
    include: { deals: { orderBy: { createdAt: "desc" } } },
  });
  if (!c) return res.status(404).json({ error: "not found" });
  const [meetings, upcomingEvents, openTodos] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        userId,
        OR: [{ contactId: c.id }, { attendees: { has: c.id } }],
      },
      orderBy: { createdAt: "desc" },
    }),
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
  res.json({ ...c, meetings, upcomingEvents, openTodos });
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
