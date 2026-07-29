import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import {
  verifyVendorPin,
  appendHistory,
  sanitizeDelivery,
} from "../services/vendorOrders.js";

/**
 * 협력사(크라이저) 발주 포털 — 가입 없이 PIN으로 접근.
 * 협력사 권한: 발주 승인 / 선금·잔금 요청 / 세금계산서 발행일 기록 / 입고(출고) 히스토리 기록.
 * 발주 내용 수정·입금 확인은 브로제이(ERP)만 가능.
 */
export const vendorPublicRouter = Router();

async function auth(req: Request, res: Response) {
  const vendorId = String(req.params.vendorId ?? "");
  const pin = String((req.body as Record<string, unknown> | undefined)?.pin ?? req.headers["x-pin"] ?? "");
  const portal = await verifyVendorPin(vendorId, pin);
  if (!portal) {
    res.status(403).json({ error: "PIN이 올바르지 않습니다" });
    return null;
  }
  return portal;
}

// 포털 이름 미리보기 (PIN 전)
vendorPublicRouter.get("/:vendorId/preview", async (req: Request, res: Response) => {
  const portal = await prisma.erpVendorPortal.findUnique({ where: { id: String(req.params.vendorId) } });
  if (!portal || !portal.active) return res.status(404).json({ error: "포털이 없습니다" });
  res.json({ name: portal.name });
});

// PIN 확인 + 발주 목록 + 제품 단가표
vendorPublicRouter.post("/:vendorId/orders", async (req: Request, res: Response) => {
  const portal = await auth(req, res);
  if (!portal) return;
  const orders = await prisma.erpVendorOrder.findMany({
    where: { vendorId: portal.id },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ ok: true, name: portal.name, products: portal.products, orders });
});

// 발주 승인 (requested → approved) — 협력사가 할 수 있는 유일한 상태 변경
vendorPublicRouter.post("/:vendorId/orders/:id/approve", async (req: Request, res: Response) => {
  const portal = await auth(req, res);
  if (!portal) return;
  const order = await prisma.erpVendorOrder.findFirst({ where: { id: req.params.id, vendorId: portal.id } });
  if (!order) return res.status(404).json({ error: "발주를 찾을 수 없습니다" });
  if (order.status !== "requested") return res.status(400).json({ error: "승인 대기 상태가 아닙니다" });
  const updated = await prisma.erpVendorOrder.update({
    where: { id: order.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      history: appendHistory(order.history, "vendor", `${portal.name}가 발주를 승인했습니다`),
    },
  });
  res.json({ order: updated });
});

// 선금/잔금 입금 요청
vendorPublicRouter.post("/:vendorId/orders/:id/request-payment", async (req: Request, res: Response) => {
  const portal = await auth(req, res);
  if (!portal) return;
  const kind = (req.body as Record<string, unknown>)?.kind === "balance" ? "balance" : "prepay";
  const order = await prisma.erpVendorOrder.findFirst({ where: { id: req.params.id, vendorId: portal.id } });
  if (!order) return res.status(404).json({ error: "발주를 찾을 수 없습니다" });
  if (order.status === "requested") return res.status(400).json({ error: "발주 승인 후 요청할 수 있습니다" });
  const label = kind === "prepay" ? "선금" : "잔금";
  const data: Record<string, unknown> = {
    history: appendHistory(order.history, "vendor", `${portal.name}가 ${label} 입금을 요청했습니다`),
  };
  if (kind === "prepay") data.prepayRequestedAt = new Date();
  else data.balanceRequestedAt = new Date();
  const updated = await prisma.erpVendorOrder.update({ where: { id: order.id }, data: data as never });
  res.json({ order: updated });
});

// 세금계산서 발행일 기록 (협력사 발행 → 날짜 입력)
vendorPublicRouter.post("/:vendorId/orders/:id/tax-date", async (req: Request, res: Response) => {
  const portal = await auth(req, res);
  if (!portal) return;
  const b = req.body as Record<string, unknown>;
  const kind = b?.kind === "balance" ? "balance" : "prepay";
  const date = String(b?.date ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "날짜 형식은 YYYY-MM-DD" });
  const order = await prisma.erpVendorOrder.findFirst({ where: { id: req.params.id, vendorId: portal.id } });
  if (!order) return res.status(404).json({ error: "발주를 찾을 수 없습니다" });
  const label = kind === "prepay" ? "선금" : "잔금";
  const data: Record<string, unknown> = {
    history: appendHistory(
      order.history,
      "vendor",
      date ? `${label} 세금계산서 발행일 기록: ${date}` : `${label} 세금계산서 발행일을 지웠습니다`
    ),
  };
  if (kind === "prepay") data.prepayTaxDate = date || null;
  else data.balanceTaxDate = date || null;
  const updated = await prisma.erpVendorOrder.update({ where: { id: order.id }, data: data as never });
  res.json({ order: updated });
});

// 입고(출고) 히스토리 기록 — 부분 납품 (예: 100대 중 10대, 50대…)
vendorPublicRouter.post("/:vendorId/orders/:id/delivery", async (req: Request, res: Response) => {
  const portal = await auth(req, res);
  if (!portal) return;
  const entry = sanitizeDelivery(req.body, "vendor");
  if (!entry) return res.status(400).json({ error: "날짜/제품/수량을 확인하세요" });
  const order = await prisma.erpVendorOrder.findFirst({ where: { id: req.params.id, vendorId: portal.id } });
  if (!order) return res.status(404).json({ error: "발주를 찾을 수 없습니다" });
  const deliveries = [...(Array.isArray(order.deliveries) ? order.deliveries : []), entry].slice(-100);
  const updated = await prisma.erpVendorOrder.update({
    where: { id: order.id },
    data: {
      deliveries: deliveries as never,
      history: appendHistory(order.history, "vendor", `출고 기록: ${entry.date} ${entry.name} ${entry.qty}대${entry.note ? ` (${entry.note})` : ""}`),
    },
  });
  res.json({ order: updated });
});
