import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";

/**
 * 설치팀 월별 정산 공유 — 가입 없이 PIN 접속.
 * 자기 팀 설치 건의 정산 내역을 보고, 건별로 금액 수정 요청(원하는 금액+코멘트)을 남긴다.
 * 승인·반영은 브로제이(ERP)에서만 한다.
 */
export const installPublicRouter = Router();

async function resolveSettleShare(token: string, pin: string) {
  if (!token) return null;
  const share = await prisma.erpInstallSettleShare.findUnique({ where: { token } });
  if (!share || !share.active) return null;
  if (String(pin).trim() !== share.pin) return null;
  return share;
}

const ymd = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// PIN 전 미리보기 (팀명만)
installPublicRouter.get("/settle/:token/preview", async (req: Request, res: Response) => {
  const share = await prisma.erpInstallSettleShare.findUnique({ where: { token: req.params.token } });
  if (!share || !share.active) return res.status(404).json({ error: "링크가 유효하지 않습니다" });
  res.json({ team: share.team });
});

// PIN 확인 → 기간 내 자기 팀 설치 건 정산 내역
installPublicRouter.post("/settle/:token/info", async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const share = await resolveSettleShare(req.params.token, String(b.pin ?? ""));
  if (!share) return res.status(403).json({ error: "링크 또는 PIN이 올바르지 않습니다" });
  const from = ymd(b.from);
  const to = ymd(b.to);
  let where: object = {};
  if (from || to) {
    const dateCond = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const fm = from ? from.slice(0, 7).replace("-", ".") : null;
    const tm = to ? to.slice(0, 7).replace("-", ".") : null;
    where = {
      OR: [
        { installDate: dateCond },
        { installDate: null, month: { ...(fm ? { gte: fm } : {}), ...(tm ? { lte: tm } : {}) } },
      ],
    };
  }
  const rows = await prisma.erpInstallSchedule.findMany({
    where,
    orderBy: [{ installDate: "asc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
  });
  const mine = rows
    .map((r) => ({ id: r.id, month: r.month, installDate: r.installDate, centerName: r.centerName, ...(r.data as Record<string, unknown>) }))
    .filter((r) => String((r as Record<string, unknown>).team ?? "").trim() === share.team)
    .map((r0) => {
      const r = r0 as Record<string, unknown>;
      // 정산에 필요한 필드만 (연락처·TID 등 고객 정보는 제외)
      return {
        id: r.id, installDate: r.installDate, centerName: r.centerName,
        type: r.type ?? "", region: r.region ?? "", notes: r.notes ?? "",
        kiosk1: r.kiosk1 ?? "", qty1: r.qty1 ?? "", kiosk2: r.kiosk2 ?? "", qty2: r.qty2 ?? "", kiosk3: r.kiosk3 ?? "", qty3: r.qty3 ?? "",
        address: r.address ?? "",
        baseFee: r.baseFee ?? "", finalSettle: r.finalSettle ?? "",
        adjustNote: r.adjustNote ?? "", settleRequest: r.settleRequest ?? null,
      };
    });
  res.json({ ok: true, team: share.team, rows: mine });
});

// 금액 수정 요청 — 원하는 금액 + 코멘트 (건당 1개, 재요청 시 덮어씀. 승인/거절 전 상태로)
installPublicRouter.post("/settle/:token/request", async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const share = await resolveSettleShare(req.params.token, String(b.pin ?? ""));
  if (!share) return res.status(403).json({ error: "링크 또는 PIN이 올바르지 않습니다" });
  const rowId = String(b.rowId ?? "").trim();
  const amount = Math.max(0, Math.round(Number(b.amount) || 0));
  const comment = String(b.comment ?? "").trim().slice(0, 1000);
  const by = String(b.by ?? "").trim().slice(0, 40);
  if (!rowId) return res.status(400).json({ error: "대상 건이 없습니다" });
  if (!comment) return res.status(400).json({ error: "요청 사유(코멘트)를 입력하세요" });
  const row = await prisma.erpInstallSchedule.findUnique({ where: { id: rowId } });
  if (!row) return res.status(404).json({ error: "설치 건을 찾을 수 없습니다" });
  const data = (row.data ?? {}) as Record<string, unknown>;
  if (String(data.team ?? "").trim() !== share.team) {
    return res.status(403).json({ error: "이 팀의 설치 건이 아닙니다" });
  }
  data.settleRequest = {
    amount, comment, by: by || share.team,
    at: new Date().toISOString(), status: "pending", ownerNote: null, decidedAt: null,
  };
  await prisma.erpInstallSchedule.update({ where: { id: rowId }, data: { data: data as object } });
  res.json({ ok: true });
});
