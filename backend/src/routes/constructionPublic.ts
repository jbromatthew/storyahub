import { Router, type Request, type Response } from "express";
import express from "express";
import { randomBytes } from "crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { buildUserMediaKey, putObjectBytes, getObjectBytes, r2Configured } from "../services/r2.js";

export const constructionPublicRouter = Router();

type SitePhoto = { name: string; beforeKey: string | null; afterKey: string | null; beforeBy?: string | null; afterBy?: string | null };

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "heic" ? "image/heic" : "image/jpeg";
}

async function resolveShare(token: string, pin: string) {
  if (!token) return null;
  const quote = await prisma.erpConstructionQuote.findUnique({
    where: { shareToken: token },
    include: { apartment: true },
  });
  if (!quote || !quote.shareEnabled) return null;
  if (quote.shareExpiresAt && quote.shareExpiresAt.getTime() < Date.now()) return null;
  if (!quote.sharePin || String(pin).trim() !== quote.sharePin) return null;
  return quote;
}

// PIN 확인 + 현장 정보 (기존 개소 목록)
constructionPublicRouter.post("/site-upload/:token/info", async (req: Request, res: Response) => {
  const quote = await resolveShare(req.params.token, String(req.body?.pin ?? ""));
  if (!quote) return res.status(403).json({ error: "링크 또는 PIN이 올바르지 않거나 만료되었습니다" });
  const sites = (Array.isArray(quote.sitePhotos) ? quote.sitePhotos : []) as SitePhoto[];
  res.json({
    ok: true,
    apartmentName: quote.apartment?.name ?? "(현장)",
    title: quote.title ?? null,
    expiresAt: quote.shareExpiresAt,
    sites: sites.map((s) => ({ name: s.name, hasBefore: !!s.beforeKey, hasAfter: !!s.afterKey, beforeBy: s.beforeBy ?? null, afterBy: s.afterBy ?? null })),
  });
});

// 개소 이름 수정
constructionPublicRouter.post("/site-upload/:token/rename", async (req: Request, res: Response) => {
  const quote = await resolveShare(req.params.token, String(req.body?.pin ?? ""));
  if (!quote) return res.status(403).json({ error: "링크 또는 PIN이 올바르지 않거나 만료되었습니다" });
  const oldName = String(req.body?.oldName ?? "").trim();
  const newName = String(req.body?.newName ?? "").trim();
  if (!oldName || !newName) return res.status(400).json({ error: "개소 이름을 입력하세요" });
  const fresh = await prisma.erpConstructionQuote.findUnique({ where: { id: quote.id }, select: { sitePhotos: true } });
  const sites = (Array.isArray(fresh?.sitePhotos) ? fresh!.sitePhotos : []) as SitePhoto[];
  const site = sites.find((s) => String(s.name).trim() === oldName);
  if (!site) return res.status(404).json({ error: "개소를 찾을 수 없습니다" });
  if (sites.some((s) => s !== site && String(s.name).trim() === newName)) return res.status(409).json({ error: "같은 이름의 개소가 이미 있습니다" });
  site.name = newName;
  await prisma.erpConstructionQuote.update({ where: { id: quote.id }, data: { sitePhotos: sites as unknown as object } });
  res.json({ ok: true });
});

// 개소 삭제
constructionPublicRouter.post("/site-upload/:token/delete", async (req: Request, res: Response) => {
  const quote = await resolveShare(req.params.token, String(req.body?.pin ?? ""));
  if (!quote) return res.status(403).json({ error: "링크 또는 PIN이 올바르지 않거나 만료되었습니다" });
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "개소 이름이 필요합니다" });
  const fresh = await prisma.erpConstructionQuote.findUnique({ where: { id: quote.id }, select: { sitePhotos: true } });
  const sites = (Array.isArray(fresh?.sitePhotos) ? fresh!.sitePhotos : []) as SitePhoto[];
  const next = sites.filter((s) => String(s.name).trim() !== name);
  await prisma.erpConstructionQuote.update({ where: { id: quote.id }, data: { sitePhotos: next as unknown as object } });
  res.json({ ok: true });
});

// 업로드한 사진 열람 (썸네일/미리보기) — token+PIN 검증 후 해당 견적의 개소 사진만 스트리밍
constructionPublicRouter.get("/site-upload/:token/view", async (req: Request, res: Response) => {
  try {
    const quote = await resolveShare(req.params.token, String(req.query.pin ?? ""));
    if (!quote) return res.status(403).json({ error: "forbidden" });
    const siteName = String(req.query.site ?? "").trim();
    const kind = req.query.kind === "after" ? "after" : "before";
    const sites = (Array.isArray(quote.sitePhotos) ? quote.sitePhotos : []) as SitePhoto[];
    const site = sites.find((s) => String(s.name).trim() === siteName);
    const key = site ? (kind === "after" ? site.afterKey : site.beforeKey) : null;
    if (!key || !r2Configured()) return res.status(404).json({ error: "사진이 없습니다" });
    const buf = await getObjectBytes(key);
    res.setHeader("Content-Type", mimeFromKey(key));
    res.setHeader("Cache-Control", "private, max-age=600");
    res.send(buf);
  } catch (e) {
    console.error("site-view", e);
    res.status(404).json({ error: "사진을 찾을 수 없습니다" });
  }
});

// 사진 업로드 (무계정) — 이미지 바이트 body + 헤더로 메타 전달
constructionPublicRouter.post(
  "/site-upload/:token/photo",
  express.raw({ type: () => true, limit: "45mb" }),
  async (req: Request, res: Response) => {
    try {
      const pin = String(req.header("X-Pin") ?? "");
      const siteName = decodeURIComponent(req.header("X-Site") ?? "").trim();
      const kind = req.header("X-Kind") === "after" ? "after" : "before";
      const uploader = decodeURIComponent(req.header("X-Uploader") ?? "").trim().slice(0, 40);
      const quote = await resolveShare(req.params.token, pin);
      if (!quote) return res.status(403).json({ error: "링크 또는 PIN이 올바르지 않거나 만료되었습니다" });
      if (!siteName) return res.status(400).json({ error: "개소 이름을 입력하세요" });
      if (!r2Configured()) return res.status(500).json({ error: "저장소가 설정되지 않았습니다" });

      const buf = req.body as Buffer;
      const ct = (req.header("Content-Type") || "image/jpeg").split(";")[0].trim();
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: "이미지가 없습니다" });
      if (!/^image\//i.test(ct)) return res.status(400).json({ error: "이미지 파일만 업로드할 수 있습니다" });
      if (buf.length > 40 * 1024 * 1024) return res.status(413).json({ error: "파일이 너무 큽니다 (최대 40MB)" });

      const owner = await prisma.user.findUnique({ where: { email: env.erpOwnerEmail } });
      if (!owner) return res.status(500).json({ error: "소유자 계정을 찾을 수 없습니다" });

      const ext = /png/i.test(ct) ? "png" : /webp/i.test(ct) ? "webp" : /heic|heif/i.test(ct) ? "heic" : "jpg";
      const key = buildUserMediaKey(owner.id, `construction/${quote.id}/${randomBytes(8).toString("hex")}.${ext}`);
      await putObjectBytes(key, buf, ct);

      // 최신 상태로 다시 읽어 병합 (동시 업로드 clobber 최소화)
      const fresh = await prisma.erpConstructionQuote.findUnique({ where: { id: quote.id }, select: { sitePhotos: true } });
      const sites = (Array.isArray(fresh?.sitePhotos) ? fresh!.sitePhotos : []) as SitePhoto[];
      let site = sites.find((s) => String(s.name).trim() === siteName);
      if (!site) { site = { name: siteName, beforeKey: null, afterKey: null, beforeBy: null, afterBy: null }; sites.push(site); }
      if (kind === "after") { site.afterKey = key; site.afterBy = uploader || null; }
      else { site.beforeKey = key; site.beforeBy = uploader || null; }
      await prisma.erpConstructionQuote.update({ where: { id: quote.id }, data: { sitePhotos: sites as unknown as object } });

      res.json({ ok: true });
    } catch (e) {
      console.error("site-photo-upload", e);
      res.status(500).json({ error: "업로드 처리 중 오류가 발생했습니다" });
    }
  }
);
