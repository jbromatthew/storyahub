/**
 * RND 백로그 — 사업부가 올리고 RND가 받아 처리한다.
 *
 * 흐름: 접수 → 유형 확정 → 기획자 배정 → 개발 착수 → 완료
 *       갈라지는 곳: 반려 · 보류
 * 무엇이 바뀌든 자취를 남기고, 올린 사람에게 알린다.
 */
import { Router, type Response } from "express";
import express from "express";
import { putObjectBytes, presignGet, r2KeyPrefix } from "../services/r2.js";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
import { notifyUser } from "../services/erp.js";
import { env } from "../env.js";

export const erpRndRouter = Router();
erpRndRouter.use(auth, requireAccess);
if (env.erpMode) erpRndRouter.use(requireErpMember);

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
function fail(res: Response, msg: string, code = 400) {
  res.status(code).json({ error: msg });
  return null;
}

/** 요구사항의 성격 판단 기준 — 순위가 낮을수록 먼저 본다 */
export const RND_TYPES = [
  { k: "결함",     rank: 1, desc: "119 진행 (결함/버그/데이터꼬임)" },
  { k: "결정사항", rank: 1, desc: "상부에서 0순위 개발하는 것으로 결정된 사항" },
  { k: "약속",     rank: 1, desc: "CXM & 세일즈와의 우선순위 인식 합의" },
  { k: "필수개발", rank: 1, desc: "서비스적으로 있어야 말이 되고 비교적 빠르게 해야 할 것" },
  { k: "효율개발", rank: 1, desc: "빠르게 개발이 가능한 것" },
  { k: "비즈니스", rank: 1, desc: "비즈니스적인 판단 (매출을 더 벌어들이고, 센터가 더 늘어가는 기능)" },
  { k: "대규모개발", rank: 2, desc: "비교적 빠르게 진행하는 게 필요하지만 기획/개발/디자인이 너무 큰 사항" },
  { k: "옵션개발", rank: 2, desc: "서비스적으로 있어야 말이 되지만 비교적 나중에 해도 될 것" },
  { k: "개선",     rank: 2, desc: "서비스적으로 결함/아쉬움이지만 천천히 대응해도 괜찮은 것" },
  { k: "아이디어", rank: 3, desc: "있으면 좋고 없어도 큰 문제는 없다" },
  { k: "불가능",   rank: 3, desc: "의미 있으나 현재 CRM 방향성으로 구현 불가능한 요구사항" },
  { k: "커스텀",   rank: 3, desc: "맞는 말이지만 너무 개별 센터에 한정된 커스텀 요구사항" },
  { k: "반려",     rank: 3, desc: "잘못된 요구사항" },
];
const TYPE_KEYS = RND_TYPES.map((t) => t.k);

export const RND_KINDS = [
  { k: "defect", t: "결함" },
  { k: "request", t: "요구사항" },
  { k: "improve", t: "개선사항" },
  { k: "biz", t: "사업부 요청사항" },
];
const KIND_KEYS = RND_KINDS.map((k) => k.k);

/** 접수부터 완료까지. 반려·보류는 어디서든 갈 수 있다. */
export const RND_STATUS = [
  { k: "filed",    t: "접수",       hint: "사업부가 올린 상태" },
  { k: "triaged",  t: "유형 확정",  hint: "RND가 유형을 정했다" },
  { k: "planned",  t: "기획자 배정", hint: "기획자가 붙었다" },
  { k: "dev",      t: "개발 착수",  hint: "개발이 시작됐다" },
  { k: "done",     t: "완료",       hint: "" },
  { k: "hold",     t: "보류",       hint: "지금은 진행하지 않는다" },
  { k: "rejected", t: "반려",       hint: "진행하지 않기로 했다" },
];
const STATUS_KEYS = RND_STATUS.map((s) => s.k);
const STATUS_KO = Object.fromEntries(RND_STATUS.map((s) => [s.k, s.t]));

async function me(req: AuthedRequest) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! }, select: { id: true, email: true, name: true },
  });
  const email = (user?.email || "").toLowerCase();
  const emp = await prisma.erpEmployee.findFirst({
    where: { OR: [{ userId: req.userId! }, { email }] }, select: { name: true },
  });
  return { id: req.userId!, email, name: emp?.name || user?.name || email };
}

/* ─────────── 도메인·세부서비스 ─────────── */

erpRndRouter.get("/domains", async (_req: AuthedRequest, res) => {
  const domains = await prisma.erpRndDomain.findMany({
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
  });
  res.json({ domains, types: RND_TYPES, kinds: RND_KINDS, statuses: RND_STATUS });
});

erpRndRouter.put("/domains", async (req: AuthedRequest, res) => {
  const rows = Array.isArray(req.body?.domains) ? req.body.domains : [];
  const keep: string[] = [];
  for (const [i, raw] of rows.entries()) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const name = str(d.name, 40);
    if (!name) continue;
    const services = (Array.isArray(d.services) ? d.services : [])
      .map((s) => str(s, 40)).filter(Boolean).slice(0, 60);
    const saved = await prisma.erpRndDomain.upsert({
      where: { name },
      create: { name, services, sortIndex: i, active: d.active !== false },
      update: { services, sortIndex: i, active: d.active !== false },
    });
    keep.push(saved.id);
  }
  // 목록에서 빠진 것은 지운다 — 티켓에는 이름이 글자로 남아 있어 과거 기록은 안 다친다
  await prisma.erpRndDomain.deleteMany({ where: { id: { notIn: keep.length ? keep : ["-"] } } });
  const domains = await prisma.erpRndDomain.findMany({ orderBy: [{ sortIndex: "asc" }] });
  res.json({ domains });
});

/* ─────────── 티켓 ─────────── */

erpRndRouter.get("/tickets", async (req: AuthedRequest, res) => {
  const status = str(req.query.status, 20);
  const domain = str(req.query.domain, 40);
  const mineOnly = String(req.query.mine ?? "") === "1";
  const who = await me(req);
  const where: Record<string, unknown> = {};
  if (status && STATUS_KEYS.includes(status)) where.status = status;
  if (domain) where.domain = domain;
  if (mineOnly) where.authorEmail = who.email;

  const tickets = await prisma.erpRndTicket.findMany({
    where, orderBy: { createdAt: "desc" }, take: 500,
    include: { logs: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  const counts = await prisma.erpRndTicket.groupBy({ by: ["status"], _count: { _all: true } });
  res.json({
    tickets,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    meName: who.name,
  });
});

erpRndRouter.post("/tickets", async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  const title = str(b.title, 200);
  if (!title) return fail(res, "제목을 입력하세요");
  const domain = str(b.domain, 40);
  if (!domain) return fail(res, "도메인을 선택하세요");
  const kind = str(b.kind, 20);
  if (!KIND_KEYS.includes(kind)) return fail(res, "티켓 구분을 선택하세요");

  const who = await me(req);
  const t = await prisma.erpRndTicket.create({
    data: {
      authorId: who.id, authorName: who.name, authorEmail: who.email,
      domain, service: str(b.service, 40), kind, title, body: str(b.body, 4000),
      cxmType: TYPE_KEYS.includes(str(b.cxmType, 20)) ? str(b.cxmType, 20) : "",
      ownerName: str(b.ownerName, 40),
      centerName: str(b.centerName, 80),
      vip: !!b.vip, vipNote: str(b.vipNote, 200),
    },
  });
  res.status(201).json({ ticket: t });
});

/** 상태·유형·담당이 바뀌면 자취를 남기고 올린 사람에게 알린다 */
erpRndRouter.patch("/tickets/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const cur = await prisma.erpRndTicket.findUnique({ where: { id } });
  if (!cur) return fail(res, "티켓을 찾을 수 없습니다", 404);

  const b = req.body ?? {};
  const who = await me(req);
  const data: Record<string, unknown> = {};
  const logs: Array<{ field: string; before: string; after: string; memo: string }> = [];
  const push = (field: string, before: string, after: string, memo = "") => {
    if (before === after) return;
    logs.push({ field, before, after, memo });
  };

  if (b.status !== undefined) {
    const s = str(b.status, 20);
    if (!STATUS_KEYS.includes(s)) return fail(res, "상태가 올바르지 않습니다");
    data.status = s;
    if (s === "planned" && !cur.plannedAt) data.plannedAt = new Date();
    if (s === "dev" && !cur.devAt) data.devAt = new Date();
    if (s === "done" && !cur.doneAt) data.doneAt = new Date();
    push("status", STATUS_KO[cur.status] ?? cur.status, STATUS_KO[s] ?? s, str(b.memo, 500));
  }
  if (b.rndType !== undefined) {
    const t = str(b.rndType, 20);
    if (t && !TYPE_KEYS.includes(t)) return fail(res, "유형이 올바르지 않습니다");
    data.rndType = t;
    push("rndType", cur.rndType, t);
  }
  if (b.cxmType !== undefined) {
    const t = str(b.cxmType, 20);
    if (t && !TYPE_KEYS.includes(t)) return fail(res, "유형이 올바르지 않습니다");
    data.cxmType = t;
    push("cxmType", cur.cxmType, t);
  }
  if (b.plannerName !== undefined) {
    const v = str(b.plannerName, 40);
    data.plannerName = v;
    push("planner", cur.plannerName, v);
  }
  if (b.ownerName !== undefined) {
    const v = str(b.ownerName, 40);
    data.ownerName = v;
    push("owner", cur.ownerName, v);
  }
  if (b.rejectNote !== undefined) data.rejectNote = str(b.rejectNote, 1000);
  for (const f of ["title", "body", "service", "centerName", "vipNote"] as const) {
    if (b[f] !== undefined) data[f] = str(b[f], f === "body" ? 4000 : 200);
  }
  if (b.vip !== undefined) data.vip = !!b.vip;

  const t = await prisma.erpRndTicket.update({ where: { id }, data });
  if (logs.length) {
    await prisma.erpRndTicketLog.createMany({
      data: logs.map((l) => ({ ticketId: id, byName: who.name, byEmail: who.email, ...l })),
    });
    // 자기가 바꾼 것을 자기에게 알리지 않는다
    if (cur.authorId && cur.authorId !== who.id) {
      const head = logs.find((l) => l.field === "status") ?? logs[0];
      const what = head.field === "status" ? `${head.before} → ${head.after}`
        : head.field === "planner" ? `기획자 ${head.after || "해제"}`
        : head.field === "rndType" ? `유형 ${head.after || "해제"}`
        : `${head.before || "없음"} → ${head.after || "없음"}`;
      await notifyUser(cur.authorId, {
        module: "rnd",
        title: `#${id} ${what}`,
        body: `${cur.title}${head.memo ? ` — ${head.memo}` : ""} · ${who.name}`,
        link: `rnd-backlog:${id}`,
      }).catch(() => {});
    }
  }
  res.json({ ticket: t });
});

/* ─────────── 붙임 파일 ───────────
   화면 녹화나 사진이 글 열 줄보다 빠르다. 영상까지 받는다. */
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

erpRndRouter.post(
  "/tickets/:id/files",
  express.raw({ type: () => true, limit: "105mb" }),
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const cur = await prisma.erpRndTicket.findUnique({ where: { id } });
    if (!cur) return fail(res, "티켓을 찾을 수 없습니다", 404);

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) return fail(res, "파일이 비어 있습니다");
    if (body.length > MAX_FILE) return fail(res, "파일은 100MB까지 올릴 수 있습니다", 413);

    const name = decodeURIComponent(req.header("X-File-Name") ?? "").trim().slice(0, 120) || "첨부파일";
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    if (!OK_EXT.includes(ext)) return fail(res, "이미지·영상·문서만 올릴 수 있습니다");

    const safe = name.replace(/[^\w가-힣.\-() ]/g, "_");
    const key = `${r2KeyPrefix()}rnd/${id}/${Date.now()}-${safe}`;
    const type = EXT_TYPE[ext] ?? "application/octet-stream";
    await putObjectBytes(key, body, type);

    const files = [...((cur.files as Attached[]) ?? []), { key, name, size: body.length, type }].slice(0, 20);
    const t = await prisma.erpRndTicket.update({ where: { id }, data: { files: files as never } });
    res.json({ ticket: t });
  },
);

/** 붙임 열기 — 서명 URL로 넘긴다 */
erpRndRouter.get("/tickets/:id/files/:idx", async (req: AuthedRequest, res) => {
  const cur = await prisma.erpRndTicket.findUnique({ where: { id: Number(req.params.id) } });
  if (!cur) return fail(res, "티켓을 찾을 수 없습니다", 404);
  const f = ((cur.files as Attached[]) ?? [])[Number(req.params.idx)];
  if (!f) return fail(res, "첨부가 없습니다", 404);
  try {
    res.json({ url: await presignGet(f.key), name: f.name, type: f.type });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

erpRndRouter.delete("/tickets/:id/files/:idx", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const cur = await prisma.erpRndTicket.findUnique({ where: { id } });
  if (!cur) return fail(res, "티켓을 찾을 수 없습니다", 404);
  const files = ((cur.files as Attached[]) ?? []).filter((_, i) => i !== Number(req.params.idx));
  const t = await prisma.erpRndTicket.update({ where: { id }, data: { files: files as never } });
  res.json({ ticket: t });
});

erpRndRouter.delete("/tickets/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const cur = await prisma.erpRndTicket.findUnique({ where: { id } });
  if (!cur) return fail(res, "티켓을 찾을 수 없습니다", 404);
  const who = await me(req);
  // 올린 사람과 소유자만 지운다 — 남의 요구사항을 함부로 없애지 못하게
  const owner = who.email === env.erpOwnerEmail;
  if (!owner && cur.authorEmail !== who.email) {
    return fail(res, "올린 사람만 지울 수 있습니다", 403);
  }
  await prisma.erpRndTicket.delete({ where: { id } });
  res.json({ ok: true });
});
