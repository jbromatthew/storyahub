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

export const foundersPublicRouter = Router();

const TRACKS = ["business", "tech", "content", "product", "next", "market"];
const MAX_FILE = 30 * 1024 * 1024; // 30MB
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
  if (!subject) return fail(res, "참가작 주제를 입력해 주세요");

  const entryType = str(b.entryType, 10);
  if (!["pre", "early"].includes(entryType)) return fail(res, "참가 구분을 선택해 주세요");

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
    submittedIp: str(req.ip, 60),
  };

  const row = dup
    ? await prisma.erpFoundersApply.update({ where: { id: dup.id }, data })
    : await prisma.erpFoundersApply.create({
        data: { ...data, applyNo: await nextApplyNo(round.year) },
      });

  res.json({
    ok: true,
    applyNo: row.applyNo,
    id: row.id,
    updated: !!dup,
    message: dup ? "기존 접수를 갱신했습니다" : "접수되었습니다",
  });
});

/**
 * 파일 첨부 — 접수 뒤에 이어서 올린다. 접수번호와 연락처가 맞아야 받는다.
 * kind: proof(증빙) | ir(IR 자료) | extra(추가)
 */
foundersPublicRouter.post(
  "/apply/:applyNo/file/:kind",
  express.raw({ type: () => true, limit: "32mb" }),
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
    if (body.length > MAX_FILE) return fail(res, "파일은 30MB까지 올릴 수 있습니다", 413);

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
