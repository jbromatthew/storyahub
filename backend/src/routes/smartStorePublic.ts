import { Router } from "express";
import { prisma } from "../db.js";

/** 무계정 공개 라우트 — 고객이 스마트상점 가이드 마지막에서 접수 정보를 직접 제출 */
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

/** 회차 정보 — 가이드 페이지가 열릴 때 공개 여부/마감 확인 */
smartStorePublicRouter.get("/round/:year/:round", async (req, res) => {
  const year = Number(req.params.year);
  const round = Number(req.params.round);
  if (!year || !round) return res.status(400).json({ error: "잘못된 회차입니다" });
  const r = await prisma.erpSmartStoreRound.findUnique({ where: { year_round: { year, round } } });
  if (!r || !r.active) return res.status(404).json({ error: "접수가 마감되었거나 열리지 않은 회차입니다" });
  res.json({ year: r.year, round: r.round, title: r.title, deadline: r.deadline });
});

/** 접수 제출 — 같은 회차·사업자번호면 최신 내용으로 갱신 (중복 제출 방지) */
smartStorePublicRouter.post("/apply", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const year = Number(b.year);
  const round = Number(b.round);
  const bizNo = normalizeBizNo(text(b.bizNo, 30));
  const centerName = text(b.centerName, 120);
  const phone = digits(b.phone, 13);
  const storeId = text(b.storeId, 60);
  const product = text(b.product, 20);
  const industry = text(b.industry, 20);
  const branchCount = text(b.branchCount, 10);

  if (!year || !round) return res.status(400).json({ error: "회차 정보가 올바르지 않습니다" });
  if (!bizNo) return res.status(400).json({ error: "사업자등록번호 10자리를 입력해 주세요 (미오픈이면 '준비중')" });
  if (!centerName) return res.status(400).json({ error: "상호(센터명)를 입력해 주세요" });
  if (phone.length < 9) return res.status(400).json({ error: "연락처를 정확히 입력해 주세요" });
  if (!PRODUCTS.has(product)) return res.status(400).json({ error: "관심 있는 스마트 기술을 선택해 주세요" });
  if (!INDUSTRIES.has(industry)) return res.status(400).json({ error: "업종을 선택해 주세요" });
  if (!BRANCHES.has(branchCount)) return res.status(400).json({ error: "지점 수를 선택해 주세요" });
  if (typeof b.isCustomer !== "boolean") return res.status(400).json({ error: "브로제이 서비스 이용 여부를 선택해 주세요" });

  const r = await prisma.erpSmartStoreRound.findUnique({ where: { year_round: { year, round } } });
  if (!r || !r.active) return res.status(404).json({ error: "접수가 마감되었거나 열리지 않은 회차입니다" });

  const applyTypeRaw = text(b.applyType, 20);
  const applyType = APPLY_TYPES.has(applyTypeRaw) ? applyTypeRaw : null;
  const priorTypeRaw = text(b.priorType, 20);
  const data = {
    bizNo,
    centerName,
    phone,
    storeId: storeId || null,
    product,
    industry,
    branchCount,
    isCustomer: b.isCustomer as boolean,
    applyType,
    hasPrior: typeof b.hasPrior === "boolean" ? b.hasPrior : null,
    priorType: APPLY_TYPES.has(priorTypeRaw) ? priorTypeRaw : null,
  };

  await prisma.erpSmartStoreApply.upsert({
    where: { roundId_bizNo_phone: { roundId: r.id, bizNo, phone } },
    create: { roundId: r.id, ...data },
    update: data,
  });

  res.json({ ok: true, message: "접수 정보가 전달되었습니다" });
});
