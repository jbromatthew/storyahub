import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { searchKakaoBooks } from "../services/kakaoBook.js";
import { buildUserMediaKey, putObjectBytes, r2Configured } from "../services/r2.js";
import { fetchPublicHttpsImage } from "../services/safeFetch.js";
import { getKbAccess, roleAtLeast } from "../services/shareAccess.js";

export const kbRouter = Router();
kbRouter.use(auth, requireAccess);

kbRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const owned = await prisma.kbArticle.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  const shareRows = await prisma.resourceShare.findMany({
    where: { granteeId: userId, resourceType: "kb" },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });
  const ownedIds = new Set(owned.map((a) => a.id));
  const sharedIds = shareRows.map((s) => s.resourceId).filter((id) => !ownedIds.has(id));
  const shared = sharedIds.length
    ? await prisma.kbArticle.findMany({ where: { id: { in: sharedIds } }, orderBy: { updatedAt: "desc" } })
    : [];
  const shareByResource = new Map(shareRows.map((s) => [s.resourceId, s]));
  const items = [
    ...owned.map((a) => ({ ...a, shareRole: "owner", isShared: false, sharedBy: null })),
    ...shared.map((a) => {
      const sh = shareByResource.get(a.id);
      return {
        ...a,
        shareRole: sh?.role ?? "viewer",
        isShared: true,
        sharedBy: sh?.owner ?? null,
      };
    }),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  res.json(items);
});

/** 카카오 다음 도서 검색 (REST API 키는 서버에서만 사용) */
kbRouter.get("/books/search", async (req: AuthedRequest, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "검색어를 입력하세요" });
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const size = Math.max(1, Math.min(20, parseInt(String(req.query.size ?? "10"), 10) || 10));
    const result = await searchKakaoBooks(q, { page, size });
    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message || "책 검색 실패" });
  }
});

/** 카카오 검색 결과 표지 URL → R2 저장 */
kbRouter.post("/books/cover", async (req: AuthedRequest, res) => {
  try {
    const url = String(req.body?.url ?? "").trim();
    if (!url) return res.status(400).json({ error: "표지 URL이 올바르지 않습니다" });
    if (!r2Configured()) return res.status(503).json({ error: "R2가 설정되지 않았습니다" });

    const { buffer: buf, contentType: ct } = await fetchPublicHttpsImage(url);
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const key = buildUserMediaKey(req.userId!, `covers/${randomUUID()}.${ext}`);
    await putObjectBytes(key, buf, ct);
    res.json({ key });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message || "표지 저장 실패" });
  }
});

const KB_SECTIONS = new Set(["book", "lecture", "knowledge"]);

kbRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, title, section, category, tags, blocks, bookMeta, status, visibility } = req.body ?? {};
  const sec = typeof section === "string" && KB_SECTIONS.has(section) ? section : "knowledge";
  const data = {
    title: title ?? "제목 없음",
    section: sec,
    category,
    tags: tags ?? [],
    blocks: blocks ?? [],
    bookMeta: sec === "book" && bookMeta && typeof bookMeta === "object" ? bookMeta : sec === "lecture" && bookMeta && typeof bookMeta === "object" ? bookMeta : null,
    ...(status !== undefined ? { status: String(status) } : {}),
    ...(visibility !== undefined ? { visibility: String(visibility) } : {}),
  };
  if (id) {
    const access = await getKbAccess(userId, String(id));
    if (!access || !roleAtLeast(access.role, "editor")) return res.status(404).json({ error: "not found" });
    const art = await prisma.kbArticle.update({ where: { id: String(id) }, data });
    return res.json(art);
  }
  const art = await prisma.kbArticle.create({ data: { ...data, userId } });
  res.json(art);
});

kbRouter.get("/:id", async (req: AuthedRequest, res) => {
  const access = await getKbAccess(req.userId!, req.params.id);
  if (!access) return res.status(404).json({ error: "not found" });
  res.json({
    ...access.article,
    shareRole: access.role,
    isShared: access.role !== "owner",
    sharedBy: access.sharedBy ?? null,
  });
});

kbRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const access = await getKbAccess(req.userId!, req.params.id);
  if (!access || access.role !== "owner") return res.status(404).json({ error: "not found" });
  await prisma.kbArticle.delete({ where: { id: access.article.id } });
  res.status(204).send();
});
