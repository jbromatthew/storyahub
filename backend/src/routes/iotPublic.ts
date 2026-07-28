import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";

/**
 * IoT 견적 공개 페이지 — 무계정 (인스타 유입 고객이 직접 견적 내고 상담 신청)
 * 단가 출처: IoT 견적 시트 (부가세 별도 공급가)
 */

export const IOT_PRICING = {
  items: {
    ac: { label: "에어컨 (리모컨허브)", unitPrice: 61_000, unit: "대" },
    speaker: { label: "스피커", unitPrice: 102_000, unit: "개" },
    panel: { label: "배전반 (전등 스위치)", unitPrice: 153_000, unit: "개" },
  },
  electrician: { label: "전기기사 출장 (배전반 작업 시)", unitPrice: 300_000 },
  network: {
    small: { label: "네트워크 소 (공유기 3개 · ~100평)", unitPrice: 254_000 },
    medium: { label: "네트워크 중 (공유기 5개 · ~150평)", unitPrice: 340_000 },
    large: { label: "네트워크 대 (공유기 7개 · 200평 이상)", unitPrice: 426_000 },
  },
  vatRate: 0.1,
  note: "부가세 별도 기준이며, 지역에 따라 출장비가 추가될 수 있습니다. 최종 금액은 상담 후 확정됩니다.",
} as const;

export function iotNetworkSize(pyeong: number): "small" | "medium" | "large" {
  if (pyeong >= 200) return "large";
  if (pyeong > 100) return "medium";
  return "small";
}

type BreakdownRow = { label: string; qty: number; unitPrice: number; amount: number };

export function iotQuote(input: {
  pyeong: number;
  acCount: number;
  speakerCount: number;
  panelCount: number;
}): { networkSize: "small" | "medium" | "large"; breakdown: BreakdownRow[]; supplyAmount: number; totalAmount: number } {
  const networkSize = iotNetworkSize(input.pyeong);
  const breakdown: BreakdownRow[] = [];
  const push = (label: string, qty: number, unitPrice: number) => {
    if (qty <= 0) return;
    breakdown.push({ label, qty, unitPrice, amount: qty * unitPrice });
  };
  push(IOT_PRICING.items.ac.label, input.acCount, IOT_PRICING.items.ac.unitPrice);
  push(IOT_PRICING.items.speaker.label, input.speakerCount, IOT_PRICING.items.speaker.unitPrice);
  push(IOT_PRICING.items.panel.label, input.panelCount, IOT_PRICING.items.panel.unitPrice);
  if (input.panelCount > 0) push(IOT_PRICING.electrician.label, 1, IOT_PRICING.electrician.unitPrice);
  const hasItems = input.acCount + input.speakerCount + input.panelCount > 0;
  if (hasItems) push(IOT_PRICING.network[networkSize].label, 1, IOT_PRICING.network[networkSize].unitPrice);
  const supplyAmount = breakdown.reduce((s, r) => s + r.amount, 0);
  const totalAmount = Math.round(supplyAmount * (1 + IOT_PRICING.vatRate));
  return { networkSize, breakdown, supplyAmount, totalAmount };
}

function clampInt(v: unknown, max: number): number {
  const n = Math.floor(Number(v) || 0);
  return Math.min(Math.max(0, n), max);
}

export const iotPublicRouter = Router();

iotPublicRouter.get("/pricing", (_req: Request, res: Response) => {
  res.json(IOT_PRICING);
});

iotPublicRouter.post("/leads", async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  // 허니팟 (봇 방지) — 채워져 있으면 조용히 성공 처리
  if (typeof b.website === "string" && b.website.trim()) return res.json({ ok: true });

  const centerName = typeof b.centerName === "string" ? b.centerName.trim().slice(0, 100) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 30) : "";
  if (!centerName) return res.status(400).json({ error: "센터명을 입력해주세요" });
  if (!/[\d]{7,}/.test(phone.replace(/[^\d]/g, ""))) return res.status(400).json({ error: "연락처를 확인해주세요" });

  const pyeong = clampInt(b.pyeong, 10_000);
  const acCount = clampInt(b.acCount, 500);
  const speakerCount = clampInt(b.speakerCount, 500);
  const panelCount = clampInt(b.panelCount, 500);
  const quote = iotQuote({ pyeong, acCount, speakerCount, panelCount });

  const lead = await prisma.erpIotLead.create({
    data: {
      centerName,
      industry: typeof b.industry === "string" ? b.industry.trim().slice(0, 50) : "",
      usesBroj: !!b.usesBroj,
      address: typeof b.address === "string" ? b.address.trim().slice(0, 200) : "",
      phone,
      pyeong,
      networkSize: quote.networkSize,
      acCount,
      speakerCount,
      panelCount,
      supplyAmount: quote.supplyAmount,
      totalAmount: quote.totalAmount,
      breakdown: quote.breakdown,
      source: typeof b.source === "string" && b.source.trim() ? b.source.trim().slice(0, 30) : "instagram",
    },
  });

  res.json({ ok: true, id: lead.id, quote });
});
