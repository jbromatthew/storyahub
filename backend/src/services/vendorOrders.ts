import { prisma } from "../db.js";

/** 협력사(크라이저) 발주 — 공용 헬퍼 */

export type VendorItem = { name: string; qty: number; unitPrice: number; amount: number };
export type VendorDelivery = { date: string; name: string; qty: number; note: string; by: "broj" | "vendor" };
export type VendorHistoryEntry = { at: string; by: "broj" | "vendor"; text: string };

export const KREISER_VENDOR_ID = "kreiser";

export function sanitizeVendorItems(raw: unknown): VendorItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const qty = Math.max(0, Math.floor(Number(o.qty) || 0));
      const unitPrice = Math.max(0, Math.floor(Number(o.unitPrice) || 0));
      return {
        name: String(o.name ?? "").trim().slice(0, 100),
        qty,
        unitPrice,
        amount: qty * unitPrice,
      };
    })
    .filter((it) => it.name && it.qty > 0)
    .slice(0, 50);
}

export function computeOrderAmounts(items: VendorItem[], prepayRate: number) {
  const totalAmount = items.reduce((s, it) => s + it.amount, 0);
  const rate = Math.min(100, Math.max(0, Math.floor(prepayRate) || 30));
  const prepayAmount = Math.round(totalAmount * (rate / 100));
  return { totalAmount, prepayRate: rate, prepayAmount, balanceAmount: totalAmount - prepayAmount };
}

export function appendHistory(history: unknown, by: "broj" | "vendor", text: string): VendorHistoryEntry[] {
  const arr = (Array.isArray(history) ? history : []) as VendorHistoryEntry[];
  return [...arr, { at: new Date().toISOString(), by, text }].slice(-200);
}

export function sanitizeDelivery(raw: unknown, by: "broj" | "vendor"): VendorDelivery | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const date = String(o.date ?? "").trim();
  const name = String(o.name ?? "").trim().slice(0, 100);
  const qty = Math.max(0, Math.floor(Number(o.qty) || 0));
  const note = String(o.note ?? "").trim().slice(0, 300);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || qty <= 0) return null;
  return { date, name, qty, note, by };
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** 포털 조회 (없으면 크라이저 기본 생성) */
export async function getVendorPortal(vendorId: string = KREISER_VENDOR_ID) {
  const existing = await prisma.erpVendorPortal.findUnique({ where: { id: vendorId } });
  if (existing) return existing;
  return prisma.erpVendorPortal.create({
    data: { id: vendorId, name: vendorId === KREISER_VENDOR_ID ? "크라이저" : vendorId, pin: randomPin(), products: [] },
  });
}

export async function verifyVendorPin(vendorId: string, pin: string) {
  const portal = await prisma.erpVendorPortal.findUnique({ where: { id: vendorId } });
  if (!portal || !portal.active) return null;
  if (!portal.pin || String(pin).trim() !== portal.pin) return null;
  return portal;
}

export function orderSummary(o: { items: unknown }) {
  const items = (Array.isArray(o.items) ? o.items : []) as VendorItem[];
  return items.map((it) => `${it.name} ×${it.qty}`).join(", ");
}
