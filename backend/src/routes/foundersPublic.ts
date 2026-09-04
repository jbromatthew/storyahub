/**
 * BROJ FOUNDERS 참가 신청 — 무계정 공개 라우트.
 *
 * 신청서·개인정보동의서·서약서를 첨부가 아니라 화면에서 직접 받는다.
 * 첨부는 증빙 서류와 IR 자료뿐이다.
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { prisma } from "../db.js";
import { putObjectBytes, r2Configured, r2KeyPrefix } from "../services/r2.js";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

export const foundersPublicRouter = Router();

const TRACKS = ["business", "tech", "content", "product", "next", "market"];
const MAX_FILE = 100 * 1024 * 1024; // 100MB — 발표자료가 무거운 편이다
const OK_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/haansofthwp", "application/x-hwp", "application/vnd.hancom.hwp",
  "image/jpeg", "image/png", "image/webp", "image/heic",
  "application/zip",
];

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const digits = (v: unknown) => String(v ?? "").replace(/[^\d]/g, "");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

function fail(res: Response, msg: string, code = 400) {
  res.status(code).json({ error: msg });
  return null;
}

/** 지금 접수받는 회차 — 없으면 null */
async function openRound() {
  const now = new Date();
  const rounds = await prisma.erpFoundersRound.findMany({
    where: { active: true },
    orderBy: { year: "desc" },
  });
  for (const r of rounds) {
    if (r.opensAt && now < r.opensAt) continue;
    if (r.closesAt && now > r.closesAt) continue;
    return r;
  }
  return rounds[0] ?? null;
}

/** 화면이 마감·안내를 그릴 수 있게 회차 정보를 준다 */
foundersPublicRouter.get("/round", async (_req: Request, res: Response) => {
  const r = await openRound();
  if (!r) return res.json({ round: null });
  const now = new Date();
  const open = (!r.opensAt || now >= r.opensAt) && (!r.closesAt || now <= r.closesAt) && r.active;
  res.json({
    round: {
      id: r.id, year: r.year, title: r.title,
      opensAt: r.opensAt, closesAt: r.closesAt, notice: r.notice, open,
    },
  });
});

/**
 * 손으로 그린 서명을 R2에 넣는다. data URL(PNG)로 받아 저장하고 키만 돌려준다.
 * 서명은 동의의 증거라 접수 본문과 같은 요청에서 함께 받는다.
 */
const MAX_SIGN = 400 * 1024;
async function storeSignature(applyNo: string, dataUrl: unknown): Promise<string> {
  const raw = String(dataUrl ?? "");
  const m = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !r2Configured()) return "";
  const buf = Buffer.from(m[1], "base64");
  if (!buf.length || buf.length > MAX_SIGN) return "";
  const key = `${r2KeyPrefix()}founders/${applyNo}/sign-${Date.now()}.png`;
  await putObjectBytes(key, buf, "image/png");
  return key;
}

/** 참여신청서 본문 — 길이만 자르고 모양은 그대로 담는다 (회차마다 항목이 바뀐다) */
function cleanForm(v: unknown): Record<string, unknown> {
  const cap = (x: unknown, max: number): unknown => {
    if (typeof x === "string") return x.trim().slice(0, max);
    if (Array.isArray(x)) return x.slice(0, 40).map((i) => cap(i, max));
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x as Record<string, unknown>).slice(0, 60)) {
        o[String(k).slice(0, 40)] = cap(val, max);
      }
      return o;
    }
    return typeof x === "number" || typeof x === "boolean" ? x : "";
  };
  const out = cap(v, 4000);
  return out && typeof out === "object" && !Array.isArray(out) ? (out as Record<string, unknown>) : {};
}

/* ─────────── 이어서 작성하기 ───────────
   접수 전에는 ErpFoundersDraft에, 접수 뒤에는 ErpFoundersApply.passHash에 담긴다.
   본인이 정한 짧은 임시 비밀번호라 느리게 검사하고 시도 횟수를 막는다. */

const PW_MIN = 4;
const PW_MAX_TRIES = 8;
const PW_LOCK_MIN = 15;

export function hashFoundersPw(pw: string): string {
  return hashPw(pw);
}
function hashPw(pw: string): string {
  const salt = randomBytes(16);
  return "s1$" + salt.toString("hex") + "$" + scryptSync(pw, salt, 32).toString("hex");
}
function checkPw(pw: string, stored: string): boolean {
  const [tag, saltHex, keyHex] = String(stored ?? "").split("$");
  if (tag !== "s1" || !saltHex || !keyHex) return false;
  const want = Buffer.from(keyHex, "hex");
  const got = scryptSync(pw, Buffer.from(saltHex, "hex"), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}
/** 잠겨 있으면 남은 분, 아니면 0 */
function lockLeft(lockedAt: Date | null): number {
  if (!lockedAt) return 0;
  const left = PW_LOCK_MIN * 60000 - (Date.now() - lockedAt.getTime());
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

/** POST /public/founders/draft — 작성 중인 내용을 담아둔다 */
foundersPublicRouter.post("/draft", async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const phone = digits(b.phone);
  const pw = String(b.password ?? "");
  if (phone.length < 10) return fail(res, "연락처를 확인해 주세요");
  if (pw.length < PW_MIN) return fail(res, `임시 비밀번호는 ${PW_MIN}자 이상으로 정해주세요`);

  const step = Math.min(Math.max(Number(b.step) || 1, 1), 7);
  const payload = cleanForm(b.payload);

  // 이미 접수한 연락처는 임시저장이 아니라 첨부 이어하기 대상이다
  const done = await prisma.erpFoundersApply.findFirst({
    where: { repPhone: phone, kind: "applicant" },
    select: { applyNo: true },
  });
  if (done) return fail(res, `이미 ${done.applyNo}으로 접수하신 연락처입니다. 「이어서 작성하기」로 자료 첨부를 이어가실 수 있습니다.`);

  const prev = await prisma.erpFoundersDraft.findUnique({ where: { phone } });
  if (prev) {
    const left = lockLeft(prev.lockedAt);
    if (left) return fail(res, `비밀번호를 여러 번 틀려 ${left}분간 잠겼습니다`, 429);
    if (!checkPw(pw, prev.passHash)) {
      const tries = prev.tries + 1;
      await prisma.erpFoundersDraft.update({
        where: { phone },
        data: { tries, lockedAt: tries >= PW_MAX_TRIES ? new Date() : null },
      });
      return fail(res, "이 연락처로 저장해두신 내용이 있습니다. 그때 정하신 임시 비밀번호를 입력해 주세요");
    }
    await prisma.erpFoundersDraft.update({
      where: { phone },
      data: { step, payload: payload as never, tries: 0, lockedAt: null },
    });
  } else {
    await prisma.erpFoundersDraft.create({
      data: { phone, passHash: hashPw(pw), step, payload: payload as never },
    });
  }
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

/** POST /public/founders/resume — 저장해둔 내용이나 접수건을 되찾는다 */
foundersPublicRouter.post("/resume", async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const phone = digits(b.phone);
  const pw = String(b.password ?? "");
  if (phone.length < 10 || !pw) return fail(res, "연락처와 임시 비밀번호를 입력해 주세요");

  const done = await prisma.erpFoundersApply.findFirst({
    where: { repPhone: phone, kind: "applicant" },
    orderBy: { id: "desc" },
  });
  if (done) {
    if (!done.passHash) {
      return fail(res, `${done.applyNo}으로 접수는 되어 있으나 임시 비밀번호가 설정되지 않은 건입니다. 운영사무국으로 연락 주세요.`);
    }
    if (!checkPw(pw, done.passHash)) return fail(res, "임시 비밀번호가 맞지 않습니다");
    return res.json({
      mode: "apply",
      applyNo: done.applyNo,
      teamName: done.teamName,
      // 이미 올린 것은 화면에 그대로 보여준다 — 다시 올리라고 하면 안 된다
      files: {
        proof: done.proofKey ? { done: true, name: done.proofName || "사업자등록증" } : { done: false },
        ir: done.irKey ? { done: true, name: done.irName || "IR 자료" } : { done: false },
        extra: done.extraKey ? { done: true, name: done.extraName || "추가 자료" } : { done: false },
      },
    });
  }

  const d = await prisma.erpFoundersDraft.findUnique({ where: { phone } });
  if (!d) return fail(res, "이 연락처로 저장해두신 내용이 없습니다", 404);
  const left = lockLeft(d.lockedAt);
  if (left) return fail(res, `비밀번호를 여러 번 틀려 ${left}분간 잠겼습니다`, 429);
  if (!checkPw(pw, d.passHash)) {
    const tries = d.tries + 1;
    await prisma.erpFoundersDraft.update({
      where: { phone },
      data: { tries, lockedAt: tries >= PW_MAX_TRIES ? new Date() : null },
    });
    return fail(res, `임시 비밀번호가 맞지 않습니다 (${PW_MAX_TRIES - tries}번 남음)`);
  }
  await prisma.erpFoundersDraft.update({ where: { phone }, data: { tries: 0, lockedAt: null } });
  res.json({ mode: "draft", step: d.step, payload: d.payload, savedAt: d.updatedAt });
});

/* ─────────── 공동 주최 심사 페이지 ───────────
   드레이퍼 쪽에는 우리 ERP 계정이 없다. 회차마다 정한 비밀번호 하나로 열고,
   신청자 목록을 보고 상태를 바꾸는 것까지만 한다. */

const REVIEW_TTL_H = 12;
const REVIEW_STATUS = ["received", "reviewing", "passed", "rejected"];

function reviewSign(payload: string): string {
  return createHmac("sha256", env.jwtSecret).update(payload).digest("base64url");
}
function reviewToken(roundId: string, who: string): string {
  const body = Buffer.from(
    JSON.stringify({ r: roundId, w: who, e: Date.now() + REVIEW_TTL_H * 3600_000 })
  ).toString("base64url");
  return body + "." + reviewSign(body);
}
function reviewOpen(req: Request): { roundId: string; who: string } | null {
  const raw = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(reviewSign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.e || p.e < Date.now()) return null;
    return { roundId: String(p.r), who: String(p.w ?? "") };
  } catch {
    return null;
  }
}

/** 심사자에게 내보내는 모양 — 우리 내부 메모와 비밀번호 해시는 빼고 준다 */
function forReview(a: Record<string, unknown>) {
  const {
    passHash: _pw, memo: _memo, submittedIp: _ip, roundId: _rid, ...rest
  } = a as Record<string, unknown> & { passHash?: string };
  return rest;
}

/** POST /public/founders/review/login */
foundersPublicRouter.post("/review/login", async (req: Request, res: Response) => {
  const pw = String((req.body ?? {}).password ?? "");
  const who = str((req.body ?? {}).who, 40);
  if (!pw) return fail(res, "비밀번호를 입력해 주세요");

  const rounds = await prisma.erpFoundersRound.findMany({
    where: { active: true }, orderBy: { year: "desc" },
  });
  const round = rounds.find((r) => r.reviewPassHash && checkPw(pw, r.reviewPassHash));
  if (!round) return fail(res, "비밀번호가 맞지 않습니다", 401);

  res.json({
    token: reviewToken(round.id, who),
    round: { id: round.id, year: round.year, title: round.title },
    expiresIn: REVIEW_TTL_H * 3600,
  });
});

/** GET /public/founders/review/applies */
foundersPublicRouter.get("/review/applies", async (req: Request, res: Response) => {
  const at = reviewOpen(req);
  if (!at) return fail(res, "다시 로그인해 주세요", 401);
  const rows = await prisma.erpFoundersApply.findMany({
    where: { roundId: at.roundId, kind: "applicant" },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  res.json({ applies: rows.map((r) => forReview(r as unknown as Record<string, unknown>)) });
});

/** PATCH /public/founders/review/applies/:id — 상태와 심사 메모만 */
foundersPublicRouter.patch("/review/applies/:id", async (req: Request, res: Response) => {
  const at = reviewOpen(req);
  if (!at) return fail(res, "다시 로그인해 주세요", 401);
  const row = await prisma.erpFoundersApply.findUnique({ where: { id: String(req.params.id) } });
  if (!row || row.roundId !== at.roundId) return fail(res, "접수 내역을 찾을 수 없습니다", 404);

  const b = req.body ?? {};
  const data: Record<string, unknown> = { reviewedAt: new Date(), reviewedBy: at.who };
  if (b.status !== undefined) {
    const s = str(b.status, 20);
    if (!REVIEW_STATUS.includes(s)) return fail(res, "상태가 올바르지 않습니다");
    data.status = s;
  }
  if (b.reviewNote !== undefined) data.reviewNote = str(b.reviewNote, 2000);

  const saved = await prisma.erpFoundersApply.update({ where: { id: row.id }, data });
  res.json({ ok: true, apply: forReview(saved as unknown as Record<string, unknown>) });
});

/** GET /public/founders/review/applies/:id/file/:kind */
foundersPublicRouter.get("/review/applies/:id/file/:kind", async (req: Request, res: Response) => {
  const at = reviewOpen(req);
  if (!at) return fail(res, "다시 로그인해 주세요", 401);
  const row = await prisma.erpFoundersApply.findUnique({ where: { id: String(req.params.id) } });
  if (!row || row.roundId !== at.roundId) return fail(res, "접수 내역을 찾을 수 없습니다", 404);

  const kind = String(req.params.kind);
  const key = kind === "proof" ? row.proofKey
    : kind === "ir" ? row.irKey
    : kind === "sign" ? row.signKey
    : kind === "extra" ? row.extraKey
    : "";
  if (!key) return fail(res, "첨부가 없습니다", 404);
  try {
    const { presignGet } = await import("../services/r2.js");
    res.json({ url: await presignGet(key) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** BF2026-0001 */
async function nextApplyNo(year: number): Promise<string> {
  const prefix = `BF${year}-`;
  const n = await prisma.erpFoundersApply.count({ where: { applyNo: { startsWith: prefix } } });
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

foundersPublicRouter.post("/apply", async (req: Request, res: Response) => {
  const round = await openRound();
  if (!round) return fail(res, "지금은 접수 기간이 아닙니다");
  const now = new Date();
  if (!round.active) return fail(res, "접수가 마감되었습니다");
  if (round.opensAt && now < round.opensAt) return fail(res, "아직 접수 시작 전입니다");
  if (round.closesAt && now > round.closesAt) return fail(res, "접수가 마감되었습니다");

  const b = req.body ?? {};

  // ─ 필수값 ─
  const tracks = arr(b.tracks).map((t) => str(t, 20)).filter((t) => TRACKS.includes(t));
  if (!tracks.length) return fail(res, "세부 분야를 하나 이상 선택해 주세요");

  const subject = str(b.subject, 200);
  if (!subject) return fail(res, "제품·서비스 한줄소개를 입력해 주세요");

  if (!str(b.teamName, 80)) return fail(res, "기업명 또는 팀명을 입력해 주세요");

  // 공고문이 예비 창업자도 자격으로 인정한다 — 사업자 정보를 강제하지 않는다
  const entryType = ["pre", "early"].includes(str(b.entryType, 10)) ? str(b.entryType, 10) : "early";

  const repName = str(b.repName, 40);
  const repEmail = str(b.repEmail, 120).toLowerCase();
  const repPhone = digits(b.repPhone);
  if (!repName) return fail(res, "대표자명을 입력해 주세요");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(repEmail)) return fail(res, "이메일 형식을 확인해 주세요");
  if (repPhone.length < 10) return fail(res, "휴대전화 번호를 확인해 주세요");

  if (b.privacyAgreed !== true) return fail(res, "개인정보 수집·이용에 동의해 주셔야 접수됩니다");
  if (b.pledgeAgreed !== true) return fail(res, "서약서에 동의해 주셔야 접수됩니다");
  const signerName = str(b.signerName, 40);
  if (!signerName) return fail(res, "동의자 성명을 입력해 주세요");
  if (!String(b.signature ?? "").startsWith("data:image/png;base64,")) {
    return fail(res, "서명을 해주셔야 접수됩니다");
  }

  // ─ 중복 접수 막기 — 같은 회차에 같은 연락처면 덮어쓴다 ─
  const dup = await prisma.erpFoundersApply.findFirst({
    where: { roundId: round.id, OR: [{ repPhone }, { repEmail }] },
    orderBy: { createdAt: "desc" },
  });

  const data = {
    roundId: round.id,
    tracks,
    subject,
    entryType,
    soloTeam: ["solo", "team"].includes(str(b.soloTeam, 10)) ? str(b.soloTeam, 10) : "",
    teamName: str(b.teamName, 80),
    teamSize: Math.min(Math.max(Number(b.teamSize) || 1, 1), 50),
    bizForms: arr(b.bizForms).slice(0, 5).map((f) => {
      const x = (f ?? {}) as Record<string, unknown>;
      return {
        kind: ["personal", "corp", "none"].includes(str(x.kind, 10)) ? str(x.kind, 10) : "none",
        no: digits(x.no).slice(0, 13),
        openedAt: str(x.openedAt, 10),
      };
    }),
    repName,
    repGender: ["M", "F"].includes(str(b.repGender, 2)) ? str(b.repGender, 2) : "",
    repBirth: str(b.repBirth, 10),
    repOrg: str(b.repOrg, 80),
    repEmail,
    repPhone,
    repAddress: str(b.repAddress, 200),
    members: arr(b.members).slice(0, 30).map((m) => {
      const x = (m ?? {}) as Record<string, unknown>;
      return {
        name: str(x.name, 40), birth: str(x.birth, 10),
        phone: digits(x.phone).slice(0, 11), email: str(x.email, 120), org: str(x.org, 80),
      };
    }).filter((m) => m.name),
    privacyAgreed: true,
    privacyAt: now,
    pledgeAgreed: true,
    pledgeAt: now,
    signerName,
    signerTeamName: str(b.signerTeamName, 80),
    kind: "applicant",
    formData: cleanForm(b.formData) as never,
    submittedIp: str(req.ip, 60),
  };

  const applyNo = dup?.applyNo ?? (await nextApplyNo(round.year));
  const signKey = await storeSignature(applyNo, b.signature).catch(() => "");
  const withSign = signKey ? { ...data, signKey } : data;

  // 자료 첨부를 나중에 이어서 하려면 비밀번호가 있어야 한다.
  // 작성 중 임시저장을 하셨다면 그때 정하신 것을 그대로 쓴다.
  const draft = await prisma.erpFoundersDraft.findUnique({ where: { phone: repPhone } });
  const pw = String(b.password ?? "");
  const passHash = pw.length >= PW_MIN ? hashPw(pw) : draft?.passHash ?? dup?.passHash ?? "";

  const row = dup
    ? await prisma.erpFoundersApply.update({ where: { id: dup.id }, data: { ...withSign, passHash } })
    : await prisma.erpFoundersApply.create({ data: { ...withSign, applyNo, passHash } });

  if (draft) await prisma.erpFoundersDraft.delete({ where: { phone: repPhone } }).catch(() => {});

  res.json({
    ok: true,
    applyNo: row.applyNo,
    id: row.id,
    updated: !!dup,
    canResume: !!passHash,
    message: dup ? "기존 접수를 갱신했습니다" : "접수되었습니다",
  });
});

/**
 * 파일 첨부 — 접수 뒤에 이어서 올린다. 접수번호와 연락처가 맞아야 받는다.
 * kind: proof(증빙) | ir(IR 자료) | extra(추가)
 */
foundersPublicRouter.post(
  "/apply/:applyNo/file/:kind",
  express.raw({ type: () => true, limit: "105mb" }),
  async (req: Request, res: Response) => {
    const kind = String(req.params.kind);
    if (!["proof", "ir", "extra"].includes(kind)) return fail(res, "첨부 종류가 올바르지 않습니다");
    if (!r2Configured()) return fail(res, "저장소가 설정되지 않았습니다", 500);

    const row = await prisma.erpFoundersApply.findUnique({ where: { applyNo: String(req.params.applyNo) } });
    if (!row) return fail(res, "접수 내역을 찾을 수 없습니다", 404);
    // 접수번호만으로는 못 올리게 — 본인 연락처를 함께 확인한다
    const phone = digits(req.header("X-Apply-Phone"));
    if (!phone || phone !== row.repPhone) return fail(res, "본인 확인에 실패했습니다", 403);

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) return fail(res, "파일이 비어 있습니다");
    if (body.length > MAX_FILE) return fail(res, "파일은 100MB까지 올릴 수 있습니다", 413);

    const ctype = String(req.header("Content-Type") ?? "application/octet-stream").split(";")[0];
    if (!OK_TYPES.includes(ctype)) {
      return fail(res, "PDF·PPT·HWP·이미지·ZIP만 올릴 수 있습니다");
    }
    const fileName = decodeURIComponent(req.header("X-File-Name") ?? "").trim().slice(0, 120) || "첨부파일";
    const safe = fileName.replace(/[^\w가-힣.\-() ]/g, "_");
    const key = `${r2KeyPrefix()}founders/${row.applyNo}/${kind}-${Date.now()}-${safe}`;

    await putObjectBytes(key, body, ctype);
    await prisma.erpFoundersApply.update({
      where: { id: row.id },
      data: kind === "proof" ? { proofKey: key, proofName: fileName }
        : kind === "ir" ? { irKey: key, irName: fileName }
        : { extraKey: key, extraName: fileName },
    });
    res.json({ ok: true, name: fileName });
  },
);

/** 접수 확인 — 접수번호 + 연락처 */
foundersPublicRouter.get("/apply/lookup", async (req: Request, res: Response) => {
  const applyNo = str(req.query.applyNo, 20).toUpperCase();
  const phone = digits(req.query.phone);
  if (!applyNo || !phone) return fail(res, "접수번호와 연락처를 입력해 주세요");
  const row = await prisma.erpFoundersApply.findUnique({ where: { applyNo } });
  if (!row || row.repPhone !== phone) return fail(res, "접수 내역을 찾을 수 없습니다", 404);
  res.json({
    apply: {
      applyNo: row.applyNo, subject: row.subject, teamName: row.teamName,
      repName: row.repName, status: row.status,
      hasProof: !!row.proofKey, proofName: row.proofName,
      hasIr: !!row.irKey, irName: row.irName,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    },
  });
});

// ─── 참관객 등록 ────────────────────────────────────────────────────────────
//
// 참가비 2만원. 계좌이체로 받고 입금자명으로 대조한다.
// 이름·연락처·소속·직함만 받는다 — 보러 오는 분께 서류를 물을 이유가 없다.

const VISITOR_FEE = 20000;
/// 자유석이다. 자리를 미리 배정하지 않고 오신 순서대로 앉는다.
/// 의자가 차면 스탠딩으로 보게 되고, 정원을 넘으면 마감한다.
const SEAT_LIMIT = 50;   // 현장 의자 수 — 안내용
const TOTAL_LIMIT = 100; // 참관 정원

/** 취소를 뺀 실제 등록 인원 */
function visitorWhere(roundId: string) {
  return { roundId, kind: "visitor", status: { not: "cancelled" } };
}

/** 남은 자리 — 화면이 "좌석 12석 남음"을 그릴 수 있게 */
foundersPublicRouter.get("/visitor/capacity", async (_req: Request, res: Response) => {
  const round = await openRound();
  if (!round) return res.json({ capacity: null });
  const taken = await prisma.erpFoundersApply.count({ where: visitorWhere(round.id) });
  res.json({
    capacity: {
      taken,
      seatLimit: SEAT_LIMIT,
      totalLimit: TOTAL_LIMIT,
      left: Math.max(TOTAL_LIMIT - taken, 0),
      full: taken >= TOTAL_LIMIT,
    },
  });
});

foundersPublicRouter.post("/visitor", async (req: Request, res: Response) => {
  const round = await openRound();
  if (!round) return fail(res, "지금은 접수 기간이 아닙니다");
  const now = new Date();
  if (!round.active) return fail(res, "접수가 마감되었습니다");
  if (round.opensAt && now < round.opensAt) return fail(res, "아직 접수 시작 전입니다");
  if (round.closesAt && now > round.closesAt) return fail(res, "접수가 마감되었습니다");

  const b = req.body ?? {};
  const repName = str(b.name, 40);
  const repPhone = digits(b.phone);
  if (!repName) return fail(res, "성함을 입력해 주세요");
  if (repPhone.length < 10) return fail(res, "연락처를 확인해 주세요");
  if (b.privacyAgreed !== true) return fail(res, "개인정보 수집·이용에 동의해 주셔야 등록됩니다");

  const dup = await prisma.erpFoundersApply.findFirst({
    where: { roundId: round.id, kind: "visitor", repPhone },
    orderBy: { createdAt: "desc" },
  });

  // 자리 배정 — 이미 등록한 분은 원래 자리를 그대로 지킨다
  // 등록 순번은 정원 관리용으로만 남긴다 — 자리 번호가 아니다
  let seatNo = dup?.seatNo ?? null;
  if (!dup) {
    const taken = await prisma.erpFoundersApply.count({ where: visitorWhere(round.id) });
    if (taken >= TOTAL_LIMIT) {
      return fail(res, `참관 정원 ${TOTAL_LIMIT}명이 모두 찼습니다. 대기를 원하시면 운영사무국으로 연락해 주세요.`);
    }
    seatNo = taken + 1;
  }

  const data = {
    roundId: round.id,
    kind: "visitor",
    repName,
    repPhone,
    repEmail: str(b.email, 120).toLowerCase(),
    repOrg: str(b.org, 80),
    repTitle: str(b.title, 60),
    payerName: str(b.payerName, 40) || repName,
    feeAmount: VISITOR_FEE,
    privacyAgreed: true,
    privacyAt: now,
    signerName: repName,
    status: "pending",
    seatNo,
    seatType: "free",
    submittedIp: str(req.ip, 60),
  };

  const applyNo = dup?.applyNo ?? (await nextVisitorNo(round.year));
  const signKey = await storeSignature(applyNo, b.signature).catch(() => "");
  const withSign = signKey ? { ...data, signKey } : data;

  const row = dup
    ? await prisma.erpFoundersApply.update({ where: { id: dup.id }, data: withSign })
    : await prisma.erpFoundersApply.create({ data: { ...withSign, applyNo } });

  const left = Math.max(TOTAL_LIMIT - await prisma.erpFoundersApply.count({ where: visitorWhere(round.id) }), 0);
  res.json({
    ok: true,
    applyNo: row.applyNo,
    fee: VISITOR_FEE,
    payerName: row.payerName,
    seatNo: row.seatNo,
    left,
    updated: !!dup,
  });
});

/** BV2026-0001 */
async function nextVisitorNo(year: number): Promise<string> {
  const prefix = `BV${year}-`;
  const n = await prisma.erpFoundersApply.count({ where: { applyNo: { startsWith: prefix } } });
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}
