import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { searchKakaoBooks } from "../services/kakaoBook.js";
import { buildUserMediaKey, putObjectBytes, r2Configured } from "../services/r2.js";

export const kbRouter = Router();
kbRouter.use(auth, requireAccess);

kbRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await prisma.kbArticle.findMany({ where: { userId: req.userId }, orderBy: { updatedAt: "desc" } }));
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
    if (!url.startsWith("http")) return res.status(400).json({ error: "표지 URL이 올바르지 않습니다" });
    if (!r2Configured()) return res.status(503).json({ error: "R2가 설정되지 않았습니다" });

    const imgRes = await fetch(url);
    if (!imgRes.ok) return res.status(502).json({ error: "표지 이미지를 불러오지 못했습니다" });

    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (!buf.length) return res.status(400).json({ error: "표지 이미지가 비어 있습니다" });

    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const key = buildUserMediaKey(req.userId!, `covers/${randomUUID()}.${ext}`);
    await putObjectBytes(key, buf, ct.startsWith("image/") ? ct : "image/jpeg");
    res.json({ key });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message || "표지 저장 실패" });
  }
});

const KB_SECTIONS = new Set(["book", "lecture", "knowledge"]);

kbRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, title, section, category, tags, blocks, bookMeta } = req.body ?? {};
  const sec = typeof section === "string" && KB_SECTIONS.has(section) ? section : "knowledge";
  const data = {
    title: title ?? "제목 없음",
    section: sec,
    category,
    tags: tags ?? [],
    blocks: blocks ?? [],
    bookMeta: sec === "book" && bookMeta && typeof bookMeta === "object" ? bookMeta : null,
  };
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
