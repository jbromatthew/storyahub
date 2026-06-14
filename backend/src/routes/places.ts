import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { searchKakaoPlacesKeyword, searchKakaoPlacesNearby } from "../services/kakaoLocal.js";
import { assertUserMediaKeys } from "../services/mediaValidation.js";

export const placesRouter = Router();
placesRouter.use(auth, requireAccess);

const MAX_PLACE_PHOTOS = 5;

function normalizePhotoKeys(raw: unknown, userId: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  try {
    return assertUserMediaKeys(raw, userId, MAX_PLACE_PHOTOS);
  } catch {
    throw Object.assign(new Error("invalid photoKeys"), { status: 400 });
  }
}

placesRouter.get("/search", async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  const nearby = req.query.nearby === "1" || req.query.nearby === "true";
  const lat = req.query.lat != null ? parseFloat(String(req.query.lat)) : undefined;
  const lng = req.query.lng != null ? parseFloat(String(req.query.lng)) : undefined;
  const page = req.query.page != null ? parseInt(String(req.query.page), 10) : 1;

  try {
    if (nearby && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      if (q) {
        const result = await searchKakaoPlacesKeyword(q, { lat, lng, page, size: 15 });
        return res.json(result);
      }
      const result = await searchKakaoPlacesNearby({ lat, lng, page, size: 15 });
      return res.json(result);
    }
    if (!q) return res.json({ items: [], total: 0, isEnd: true, page: 1 });
    const result = await searchKakaoPlacesKeyword(q, { lat, lng, page, size: 15 });
    res.json(result);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message || "검색 실패" });
  }
});

placesRouter.get("/", async (req: AuthedRequest, res) => {
  const places = await prisma.savedPlace.findMany({
    where: { userId: req.userId! },
    orderBy: [{ favorite: "desc" }, { createdAt: "desc" }],
  });
  res.json(places);
});

placesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const place = await prisma.savedPlace.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!place) return res.status(404).json({ error: "not found" });
  res.json(place);
});

placesRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const {
    name,
    category,
    tags,
    address,
    roadAddress,
    phone,
    lat,
    lng,
    kakaoPlaceId,
    placeUrl,
    notes,
    favorite,
    photoKeys,
  } = req.body ?? {};

  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: "이름과 위치가 필요합니다" });
  }
  const latN = parseFloat(String(lat));
  const lngN = parseFloat(String(lng));
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return res.status(400).json({ error: "좌표가 올바르지 않습니다" });
  }

  if (kakaoPlaceId) {
    const dup = await prisma.savedPlace.findUnique({
      where: { userId_kakaoPlaceId: { userId, kakaoPlaceId: String(kakaoPlaceId) } },
    });
    if (dup) return res.json(dup);
  }

  let normalizedPhotos: string[] = [];
  try {
    normalizedPhotos = normalizePhotoKeys(photoKeys, userId) ?? [];
  } catch {
    return res.status(400).json({ error: "사진 키가 올바르지 않습니다" });
  }

  const place = await prisma.savedPlace.create({
    data: {
      userId,
      name: String(name),
      category: category ?? null,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      address: address ?? null,
      roadAddress: roadAddress ?? null,
      phone: phone ?? null,
      lat: latN,
      lng: lngN,
      kakaoPlaceId: kakaoPlaceId ? String(kakaoPlaceId) : null,
      placeUrl: placeUrl ?? null,
      notes: notes ?? null,
      favorite: !!favorite,
      photoKeys: normalizedPhotos,
    },
  });
  res.status(201).json(place);
});

placesRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const existing = await prisma.savedPlace.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) return res.status(404).json({ error: "not found" });

  const { category, tags, notes, favorite, photoKeys } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (category !== undefined) data.category = category || null;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags.map(String) : [];
  if (notes !== undefined) data.notes = notes || null;
  if (favorite !== undefined) data.favorite = !!favorite;
  if (photoKeys !== undefined) {
    try {
      data.photoKeys = normalizePhotoKeys(photoKeys, userId) ?? [];
    } catch {
      return res.status(400).json({ error: "사진 키가 올바르지 않습니다" });
    }
  }

  const place = await prisma.savedPlace.update({ where: { id: existing.id }, data });
  res.json(place);
});

placesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const existing = await prisma.savedPlace.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) return res.status(404).json({ error: "not found" });
  await prisma.savedPlace.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
