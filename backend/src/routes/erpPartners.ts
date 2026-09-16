/**
 * 브로제이 파트너스 — 제휴 후보부터 계약까지.
 *
 * 등급은 Core > Growth > Specialist 세 단계이고,
 * 상태는 후보 → 접촉 → 검토중 → 협의중 → 계약 으로 올라간다 (보류·종료로 빠질 수 있다).
 * 운영 계획안(2026-08-21, Dorosi)의 카테고리·등급 체계를 그대로 따른다.
 */
import { Router, type Response } from "express";
import express from "express";
import { putObjectBytes, presignGet, r2KeyPrefix } from "../services/r2.js";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
import { env } from "../env.js";

export const erpPartnersRouter = Router();
erpPartnersRouter.use(auth, requireAccess);
if (env.erpMode) erpPartnersRouter.use(requireErpMember);

/** 모집 카테고리 — 계획안 「파트너스 모집 카테고리」 */
export const PARTNER_CATEGORIES = [
  { k: "consulting", t: "컨설팅 (교육업)", desc: "트레이너·지도자 양성, 자격 교육, 아카데미" },
  { k: "facility", t: "락커·시설·인테리어", desc: "락커, 게이트, 사우나, 샤워설비 시공·운영" },
  { k: "equipment", t: "운동기구 제조·유통", desc: "머신, 프리웨이트, 소도구" },
  { k: "goods", t: "운동복·용품", desc: "운동복, 타월, 보충제, 액세서리" },
  { k: "measure", t: "측정·진단 장비", desc: "체성분(인바디), 체력측정, 자세분석" },
  { k: "it", t: "솔루션·SaaS·IT", desc: "마케팅, 회계, 영상, 헬스케어 앱" },
  { k: "etc", t: "기타", desc: "" },
] as const;

/** 등급 — 위가 더 좋다 */
export const PARTNER_TIERS = [
  {
    k: "core", t: "코어", full: "Core Partners",
    desc: "고객사의 성장을 위해 함께 움직이는 핵심 파트너",
    term: "1년 단위 전략 파트너십",
    benefit: "연간 800만원 상당 지원금 · 분기 심층 산업 리포트 · 공동 세미나/컨퍼런스 · 신제품 Beta·PoC + 로드맵 사전 공유",
  },
  {
    k: "growth", t: "그로우스", full: "Growth Partners",
    desc: "프로젝트 기반으로 함께 하는 성장 파트너",
    term: "6~12개월 프로젝트 단위",
    benefit: "프로젝트별 협의 지원 · 홈페이지 브랜드 노출 · 대표자 인터뷰 · 협업 PR · 신제품 Beta/PoC",
  },
  {
    k: "specialist", t: "스페셜리스트", full: "Specialist Partners",
    desc: "브로제이 공식몰 제휴 파트너",
    term: "1년 + 자동갱신",
    benefit: "홈페이지 브랜드 노출 · 대표자 인터뷰 · 협업 PR · 행사 VIP 초청",
  },
] as const;

/** 상태 사다리 — 앞의 넷은 올라가는 길, 뒤의 둘은 빠지는 길 */
export const PARTNER_STATUS = [
  { k: "lead", t: "후보", tone: "gray", flow: true },
  { k: "contact", t: "접촉", tone: "blue", flow: true },
  { k: "review", t: "검토중", tone: "amber", flow: true },
  { k: "nego", t: "협의중", tone: "violet", flow: true },
  { k: "contracted", t: "계약", tone: "green", flow: true },
  { k: "hold", t: "보류", tone: "slate", flow: false },
  { k: "ended", t: "종료", tone: "red", flow: false },
] as const;

/** 기록 유형 — 무슨 일이 있었나 */
export const PARTNER_LOG_KINDS = [
  { k: "meeting", t: "미팅", tone: "violet" },
  { k: "call", t: "통화", tone: "blue" },
  { k: "mail", t: "메일", tone: "slate" },
  { k: "note", t: "메모", tone: "gray" },
  { k: "contract", t: "계약·서류", tone: "green" },
] as const;

const KEYS = {
  category: new Set<string>(PARTNER_CATEGORIES.map((c) => c.k)),
  tier: new Set<string>(PARTNER_TIERS.map((t) => t.k)),
  status: new Set<string>(PARTNER_STATUS.map((s) => s.k)),
  logKind: new Set<string>(PARTNER_LOG_KINDS.map((k) => k.k)),
};

const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const day = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};
function fail(res: Response, msg: string, code = 400) {
  res.status(code).json({ error: msg });
  return null;
}

/** 화면이 고르개를 그리는 데 필요한 것 한 벌 */
erpPartnersRouter.get("/meta", async (_req: AuthedRequest, res) => {
  const [rows, people] = await Promise.all([
    prisma.erpPartner.findMany({ select: { status: true, tier: true, category: true, ownerName: true } }),
    prisma.erpEmployee.findMany({
      where: { memberStatus: "approved" },
      select: { name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const count = (key: "status" | "tier" | "category") => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r[key] || ""] = (m[r[key] || ""] ?? 0) + 1;
    return m;
  };
  res.json({
    categories: PARTNER_CATEGORIES,
    tiers: PARTNER_TIERS,
    statuses: PARTNER_STATUS,
    logKinds: PARTNER_LOG_KINDS,
    counts: { status: count("status"), tier: count("tier"), category: count("category") },
    total: rows.length,
    owners: [...new Set(rows.map((r) => r.ownerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    people: people.map((p) => ({ name: p.name, email: p.email })),
  });
});

erpPartnersRouter.get("/", async (_req: AuthedRequest, res) => {
  const [rows, logs] = await Promise.all([
    prisma.erpPartner.findMany({ orderBy: [{ updatedAt: "desc" }] }),
    // 마지막으로 만난 게 언제인지가 표에서 제일 궁금하다
    prisma.erpPartnerLog.groupBy({
      by: ["partnerId"],
      _count: { _all: true },
      _max: { at: true },
    }),
  ]);
  const byId = new Map(logs.map((l) => [l.partnerId, l]));
  res.json({
    rows: rows.map((r) => ({
      ...r,
      logCount: byId.get(r.id)?._count._all ?? 0,
      lastLogAt: byId.get(r.id)?._max.at ?? "",
    })),
  });
});

/** 저장할 값 다듬기 — 없는 칸은 건드리지 않는다 */
function patchOf(b: Record<string, unknown>) {
  const p: Record<string, unknown> = {};
  const text: Array<[string, number]> = [
    ["name", 120], ["field", 200], ["feature", 1000], ["ceoName", 60], ["contact", 60],
    ["email", 120], ["site", 300], ["instagram", 300], ["sns", 300], ["ownerName", 60], ["commission", 300],
    ["benefit", 1000], ["nextStep", 300], ["note", 2000],
  ];
  for (const [k, max] of text) if (b[k] !== undefined) p[k] = str(b[k], max);
  for (const k of ["startAt", "endAt", "nextAt"]) if (b[k] !== undefined) p[k] = day(b[k]);
  if (b.category !== undefined) p.category = KEYS.category.has(str(b.category)) ? str(b.category) : "";
  if (b.tier !== undefined) p.tier = KEYS.tier.has(str(b.tier)) ? str(b.tier) : "";
  return p;
}

erpPartnersRouter.post("/", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = str(b.name, 120);
  if (!name) return fail(res, "업체명을 적어 주세요");
  const status = KEYS.status.has(str(b.status)) ? str(b.status) : "lead";
  const me = await prisma.erpEmployee.findFirst({
    where: { OR: [{ userId: req.userId! }] },
    select: { name: true },
  });
  const row = await prisma.erpPartner.create({
    data: { ...patchOf(b), name, status, statusAt: new Date(), createdBy: me?.name || "" },
  });
  res.json({ row });
});

erpPartnersRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const cur = await prisma.erpPartner.findUnique({ where: { id: req.params.id } });
  if (!cur) return fail(res, "찾지 못했습니다", 404);
  const data = patchOf(b);
  if (b.name !== undefined && !data.name) return fail(res, "업체명을 비울 수 없습니다");
  if (b.status !== undefined) {
    const next = str(b.status);
    if (!KEYS.status.has(next)) return fail(res, "모르는 상태입니다");
    data.status = next;
    // 상태가 실제로 바뀔 때만 날짜를 새로 찍는다 — 다른 칸만 고쳐도 묵은 날이 지워지면 안 된다
    if (next !== cur.status) data.statusAt = new Date();
  }
  const row = await prisma.erpPartner.update({ where: { id: cur.id }, data });
  res.json({ row });
});

erpPartnersRouter.delete("/:id", async (req: AuthedRequest, res) => {
  await prisma.erpPartner.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

/* ── 기록 · 붙임 ── */

const MAX_FILE = 100 * 1024 * 1024;
const OK_EXT = [
  "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp",
  "mp4", "mov", "webm", "m4v",
  "pdf", "hwp", "hwpx", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "csv", "zip",
];
const EXT_TYPE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  pdf: "application/pdf", zip: "application/zip", txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};
type Attached = { key: string; name: string; size: number; type: string };

/** 올라온 바이트를 R2 에 두고 붙임 한 줄을 만든다 */
async function takeFile(req: AuthedRequest, res: Response, dir: string): Promise<Attached | null> {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || !body.length) return fail(res, "파일이 비어 있습니다");
  if (body.length > MAX_FILE) return fail(res, "파일은 100MB까지 올릴 수 있습니다", 413);
  const name = decodeURIComponent(req.header("X-File-Name") ?? "").trim().slice(0, 120) || "첨부파일";
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (!OK_EXT.includes(ext)) return fail(res, "이미지·영상·문서만 올릴 수 있습니다");
  const safe = name.replace(/[^\w가-힣.\-() ]/g, "_");
  const key = `${r2KeyPrefix()}partners/${dir}/${Date.now()}-${safe}`;
  const type = EXT_TYPE[ext] ?? "application/octet-stream";
  await putObjectBytes(key, body, type);
  return { key, name, size: body.length, type };
}

/** 소개자료 — 파트너에 그대로 붙인다 */
erpPartnersRouter.post(
  "/:id/files",
  express.raw({ type: () => true, limit: "105mb" }),
  async (req: AuthedRequest, res) => {
    const cur = await prisma.erpPartner.findUnique({ where: { id: req.params.id } });
    if (!cur) return fail(res, "찾지 못했습니다", 404);
    const f = await takeFile(req, res, cur.id);
    if (!f) return;
    const files = [...((cur.files as Attached[]) ?? []), f].slice(0, 20);
    const row = await prisma.erpPartner.update({ where: { id: cur.id }, data: { files: files as never } });
    res.json({ row });
  },
);

erpPartnersRouter.get("/:id/files/:idx", async (req: AuthedRequest, res) => {
  const cur = await prisma.erpPartner.findUnique({ where: { id: req.params.id } });
  const f = ((cur?.files as Attached[]) ?? [])[Number(req.params.idx)];
  if (!f) return fail(res, "첨부가 없습니다", 404);
  res.json({ url: await presignGet(f.key), name: f.name, type: f.type });
});

erpPartnersRouter.delete("/:id/files/:idx", async (req: AuthedRequest, res) => {
  const cur = await prisma.erpPartner.findUnique({ where: { id: req.params.id } });
  if (!cur) return fail(res, "찾지 못했습니다", 404);
  const files = ((cur.files as Attached[]) ?? []).filter((_, i) => i !== Number(req.params.idx));
  const row = await prisma.erpPartner.update({ where: { id: cur.id }, data: { files: files as never } });
  res.json({ row });
});

/** 그 파트너의 기록 — 최근 것이 위로 */
erpPartnersRouter.get("/:id/logs", async (req: AuthedRequest, res) => {
  const rows = await prisma.erpPartnerLog.findMany({
    where: { partnerId: req.params.id },
    orderBy: [{ at: "desc" }, { createdAt: "desc" }],
  });
  res.json({ rows });
});

function logPatch(b: Record<string, unknown>) {
  const p: Record<string, unknown> = {};
  const text: Array<[string, number]> = [
    ["title", 200], ["body", 5000], ["attendees", 300], ["place", 200], ["nextStep", 300],
  ];
  for (const [k, max] of text) if (b[k] !== undefined) p[k] = str(b[k], max);
  if (b.at !== undefined) p.at = day(b.at);
  if (b.kind !== undefined) p.kind = KEYS.logKind.has(str(b.kind)) ? str(b.kind) : "note";
  return p;
}

erpPartnersRouter.post("/:id/logs", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const cur = await prisma.erpPartner.findUnique({ where: { id: req.params.id } });
  if (!cur) return fail(res, "찾지 못했습니다", 404);
  const data = logPatch(b);
  const at = (data.at as string) || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (!data.title && !data.body) return fail(res, "제목이나 내용 중 하나는 적어 주세요");
  const me = await prisma.erpEmployee.findFirst({ where: { userId: req.userId! }, select: { name: true } });
  const row = await prisma.erpPartnerLog.create({
    data: { ...data, at, partnerId: cur.id, authorName: me?.name || "" },
  });
  // 기록에서 정한 다음 할 일은 파트너 줄에도 올려 둔다 — 표에서 바로 보이라고
  if (row.nextStep) {
    await prisma.erpPartner.update({
      where: { id: cur.id },
      data: { nextStep: row.nextStep.slice(0, 300) },
    });
  }
  res.json({ row });
});

erpPartnersRouter.patch("/logs/:logId", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const cur = await prisma.erpPartnerLog.findUnique({ where: { id: req.params.logId } });
  if (!cur) return fail(res, "기록을 찾지 못했습니다", 404);
  const data = logPatch(b);
  if (data.at === "") delete data.at;   // 날짜를 비우면 예전 날짜를 그대로 둔다
  const row = await prisma.erpPartnerLog.update({ where: { id: cur.id }, data });
  res.json({ row });
});

erpPartnersRouter.delete("/logs/:logId", async (req: AuthedRequest, res) => {
  await prisma.erpPartnerLog.delete({ where: { id: req.params.logId } }).catch(() => null);
  res.json({ ok: true });
});

erpPartnersRouter.post(
  "/logs/:logId/files",
  express.raw({ type: () => true, limit: "105mb" }),
  async (req: AuthedRequest, res) => {
    const cur = await prisma.erpPartnerLog.findUnique({ where: { id: req.params.logId } });
    if (!cur) return fail(res, "기록을 찾지 못했습니다", 404);
    const f = await takeFile(req, res, `${cur.partnerId}/logs`);
    if (!f) return;
    const files = [...((cur.files as Attached[]) ?? []), f].slice(0, 20);
    const row = await prisma.erpPartnerLog.update({ where: { id: cur.id }, data: { files: files as never } });
    res.json({ row });
  },
);

erpPartnersRouter.get("/logs/:logId/files/:idx", async (req: AuthedRequest, res) => {
  const cur = await prisma.erpPartnerLog.findUnique({ where: { id: req.params.logId } });
  const f = ((cur?.files as Attached[]) ?? [])[Number(req.params.idx)];
  if (!f) return fail(res, "첨부가 없습니다", 404);
  res.json({ url: await presignGet(f.key), name: f.name, type: f.type });
});

erpPartnersRouter.delete("/logs/:logId/files/:idx", async (req: AuthedRequest, res) => {
  const cur = await prisma.erpPartnerLog.findUnique({ where: { id: req.params.logId } });
  if (!cur) return fail(res, "기록을 찾지 못했습니다", 404);
  const files = ((cur.files as Attached[]) ?? []).filter((_, i) => i !== Number(req.params.idx));
  const row = await prisma.erpPartnerLog.update({ where: { id: cur.id }, data: { files: files as never } });
  res.json({ row });
});
