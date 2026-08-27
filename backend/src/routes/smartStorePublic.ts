import { Router } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db.js";
import { env } from "../env.js";

/** 무계정 공개 라우트 — 고객이 스마트상점 가이드에서 접수 정보를 직접 제출.
 *  2단계로 나눠 받는다: 신청 시작 시 리드 정보(연락처 기준) → 신청을 마친 뒤 사업자번호·스마트상점 ID.
 *  중간에 이탈해도 앞 단계 정보는 남는다. */
export const smartStorePublicRouter = Router();

const APPLY_TYPES = new Set(["general", "barrierfree", "rental", "sw"]);
const PRODUCTS = new Set(["premium32", "wall10"]);
const INDUSTRIES = new Set(["헬스장", "PT샵", "필라테스", "체육관", "기타"]);
const BRANCHES = new Set(["1", "2", "3-5", "6-10", "11+"]);

function digits(v: unknown, max = 20): string {
  return String(v ?? "").replace(/[^0-9]/g, "").slice(0, max);
}
function text(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

/** 사업자번호 — 10자리면 숫자만, 미오픈 센터는 '준비중'으로 통일 */
function normalizeBizNo(raw: string): string | null {
  const d = raw.replace(/[^0-9]/g, "");
  if (d.length === 10) return d;
  if (d.length) return null; // 숫자를 넣었는데 10자리가 아니면 오타
  return /준비/.test(raw) ? "준비중" : null;
}

/** 010****5678 — 조회 결과로 연락처 원문을 내보내지 않는다 */
function maskPhone(p: string): string {
  if (p.length < 7) return "*".repeat(p.length);
  return p.slice(0, 3) + "*".repeat(p.length - 7) + p.slice(-4);
}

/** 사업자번호로 기존 접수 건 찾기. '준비중'은 여러 센터가 함께 쓰므로 키가 될 수 없다. */
async function findByBizNo(roundId: string, bizNo: string) {
  if (bizNo === "준비중") return null;
  return prisma.erpSmartStoreApply.findFirst({ where: { roundId, bizNo } });
}

/* 사업자번호는 공개 정보라 훑어가며 연락처를 모을 수 있다.
   응답을 마스킹하는 것과 별개로, 조회 자체에 별도 한도를 둔다. */
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 20 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
});

/** 회차 정보 — 가이드 페이지가 열릴 때 공개 여부/마감 확인 */
smartStorePublicRouter.get("/round/:year/:round", async (req, res) => {
  const year = Number(req.params.year);
  const round = Number(req.params.round);
  if (!year || !round) return res.status(400).json({ error: "잘못된 회차입니다" });
  const r = await prisma.erpSmartStoreRound.findUnique({ where: { year_round: { year, round } } });
  if (!r || !r.active) return res.status(404).json({ error: "접수가 마감되었거나 열리지 않은 회차입니다" });
  res.json({ year: r.year, round: r.round, title: r.title, deadline: r.deadline });
});

/** 앞서 남긴 정보를 되살린다. 시작 화면은 연락처로, 마무리 화면은 사업자번호로 찾는다.
 *  연락처는 마스킹해서만 내보내고, 실제 병합은 서버가 처리하므로 원문이 나갈 일이 없다. */
smartStorePublicRouter.get("/lookup", lookupLimiter, async (req, res) => {
  const year = Number(req.query.year);
  const round = Number(req.query.round);
  const bizNo = normalizeBizNo(text(req.query.bizNo, 30));
  const phone = digits(req.query.phone, 13);
  if (!year || !round) return res.status(400).json({ error: "회차 정보가 올바르지 않습니다" });
  if ((!bizNo || bizNo === "준비중") && phone.length < 9) return res.json({ found: false });

  const r = await prisma.erpSmartStoreRound.findUnique({ where: { year_round: { year, round } } });
  if (!r || !r.active) return res.status(404).json({ error: "접수가 마감되었거나 열리지 않은 회차입니다" });

  let hit = bizNo ? await findByBizNo(r.id, bizNo) : null;
  if (!hit && phone.length >= 9) {
    hit = await prisma.erpSmartStoreApply.findUnique({
      where: { roundId_phone: { roundId: r.id, phone } },
    });
  }
  if (!hit) return res.json({ found: false });

  res.json({
    found: true,
    centerName: hit.centerName,
    phoneMasked: maskPhone(hit.phone),
    industry: hit.industry,
    branchCount: hit.branchCount,
    products: hit.products,
    isCustomer: hit.isCustomer,
    hasBizNo: Boolean(hit.bizNo && hit.bizNo !== "준비중"),
    hasStoreId: Boolean(hit.storeId),
  });
});

smartStorePublicRouter.post("/apply", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const year = Number(b.year);
  const round = Number(b.round);
  const stage = text(b.stage, 10) === "done" ? "done" : "start";
  const phone = digits(b.phone, 13);

  if (!year || !round) return res.status(400).json({ error: "회차 정보가 올바르지 않습니다" });

  const r = await prisma.erpSmartStoreRound.findUnique({ where: { year_round: { year, round } } });
  if (!r || !r.active) return res.status(404).json({ error: "접수가 마감되었거나 열리지 않은 회차입니다" });

  /* 두 단계 모두 기존 건을 먼저 찾는다. 연락처가 고유 키라 그쪽을 우선 보고,
     없으면 사업자번호로 찾는다 — 같은 센터가 다른 번호로 다시 적어도 새 행이 생기지 않게. */
  const bizInput = normalizeBizNo(text(b.bizNo, 30));
  let existing: { id: string; phone: string } | null = null;
  if (phone.length >= 9) {
    existing = await prisma.erpSmartStoreApply.findUnique({
      where: { roundId_phone: { roundId: r.id, phone } },
      select: { id: true, phone: true },
    });
  }
  if (!existing && bizInput) {
    const byBiz = await findByBizNo(r.id, bizInput);
    if (byBiz) existing = { id: byBiz.id, phone: byBiz.phone };
  }
  if (!existing && phone.length < 9) {
    return res.status(400).json({ error: "연락처를 정확히 입력해 주세요" });
  }

  const data: Record<string, unknown> = {};

  if (stage === "start") {
    // 신청 시작 — 리드 판별 정보
    const centerName = text(b.centerName, 120);
    const industry = text(b.industry, 20);
    const branchCount = text(b.branchCount, 10);
    const products = (Array.isArray(b.products) ? b.products : [])
      .map((v) => text(v, 20))
      .filter((v) => PRODUCTS.has(v));

    if (!products.length) return res.status(400).json({ error: "관심 있는 스마트 기술을 하나 이상 선택해 주세요" });
    if (!bizInput) return res.status(400).json({ error: "사업자등록번호 10자리를 입력해 주세요 (미오픈이면 '준비중')" });
    if (!centerName) return res.status(400).json({ error: "센터명을 입력해 주세요" });
    if (!INDUSTRIES.has(industry)) return res.status(400).json({ error: "업종을 선택해 주세요" });
    if (!BRANCHES.has(branchCount)) return res.status(400).json({ error: "지점 수를 선택해 주세요" });
    if (typeof b.isCustomer !== "boolean") return res.status(400).json({ error: "브로제이 서비스 이용 여부를 선택해 주세요" });

    Object.assign(data, { centerName, industry, branchCount, products, isCustomer: b.isCustomer, bizNo: bizInput });
  } else {
    // 신청 완료 — 사업자번호·스마트상점 ID
    if (!bizInput) return res.status(400).json({ error: "사업자등록번호 10자리를 입력해 주세요 (미오픈이면 '준비중')" });
    const storeId = text(b.storeId, 60);
    Object.assign(data, { bizNo: bizInput, storeId: storeId || null, stage: "done" });
  }

  // 가이드에서 고른 유형·수혜 이력은 두 단계 모두에서 최신값으로 갱신
  const applyTypeRaw = text(b.applyType, 20);
  if (APPLY_TYPES.has(applyTypeRaw)) data.applyType = applyTypeRaw;
  const priorTypeRaw = text(b.priorType, 20);
  if (APPLY_TYPES.has(priorTypeRaw)) data.priorType = priorTypeRaw;
  if (typeof b.hasPrior === "boolean") data.hasPrior = b.hasPrior;

  if (existing) {
    // 사업자번호로 찾은 건이면 연락처가 바뀌었을 수 있다. 위에서 이미 비어 있음을 확인한 번호라 충돌하지 않는다.
    if (phone.length >= 9 && phone !== existing.phone) data.phone = phone;
    await prisma.erpSmartStoreApply.update({ where: { id: existing.id }, data });
  } else {
    await prisma.erpSmartStoreApply.create({ data: { roundId: r.id, phone, ...data } });
  }

  res.json({ ok: true, message: "접수 정보가 전달되었습니다" });
});
