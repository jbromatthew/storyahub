import { dealAmounts, formatWon } from "./mappers.js";

export const QUOTE_TEMPLATES = [
  { id: "standard", label: "기본" },
  { id: "simple", label: "간단" },
  { id: "formal", label: "공식" },
];

export const DEAL_STAGES = ["리드", "견적", "협상", "성사", "실패"];

export function lineAmount(line) {
  const qty = Math.max(1, Math.round(Number(line?.quantity) || 1));
  const price = Math.round(Number(line?.unitPrice) || 0);
  const perUnitDiscount = Math.max(0, Math.round(Number(line?.lineDiscount) || 0));
  const cost = Math.max(0, Math.round(Number(line?.unitCost) || 0));
  const isDiscountLine = line?.kind === "discount";
  const discount = isDiscountLine ? perUnitDiscount : perUnitDiscount * qty;
  const gross = qty * price;
  const supply = gross - discount;
  const costTotal = qty * cost;
  const effectiveUnitPrice = qty > 0 ? Math.round(supply / qty) : price;
  return {
    qty,
    price,
    perUnitDiscount,
    discount,
    gross,
    cost,
    supply,
    costTotal,
    effectiveUnitPrice,
    margin: supply - costTotal,
    isDiscountLine: isDiscountLine || (price === 0 && discount > 0),
  };
}

export function quoteTotals(lines = []) {
  const items = (lines || []).map(lineAmount);
  const supplyAmount = items.reduce((s, x) => s + x.supply, 0);
  const totalCost = items.reduce((s, x) => s + x.costTotal, 0);
  const discountTotal = items.reduce((s, x) => s + x.discount, 0);
  const margin = supplyAmount - totalCost;
  const marginRate = supplyAmount > 0 ? Math.round((margin / supplyAmount) * 1000) / 10 : 0;
  const { vat, total } = dealAmounts(supplyAmount);
  return { supplyAmount, totalCost, discountTotal, margin, marginRate, vat, total };
}

export function contactQuoteLabel(c) {
  if (!c) return "";
  const co = c.company || c.co || "";
  const person = c.person || "";
  const role = [c.title, c.department].filter(Boolean).join(" · ");
  const who = [person, role].filter(Boolean).join(" · ");
  if (co && who) return `${co} · ${who}`;
  return who || co || "이름 없음";
}

export function orgDisplayName(org) {
  return org?.name || "공급자";
}

export function formatDateKo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function inferLineKind(line) {
  if (line?.kind === "discount") return "discount";
  if (Number(line?.unitPrice) === 0 && Number(line?.lineDiscount) > 0 && !line?.productId) return "discount";
  return "product";
}

/** 견적 저장·PDF·인쇄 공통 — 할인/분류/kind 포함 */
export function normalizeQuoteLines(items = []) {
  return (items || [])
    .filter((l) => {
      if (!String(l?.name || "").trim()) return false;
      if (inferLineKind(l) === "discount") return (Number(l.lineDiscount) || 0) > 0;
      return true;
    })
    .map((l) => ({
      id: l.id,
      productId: l.productId ?? null,
      name: String(l.name).trim(),
      category: l.category ? String(l.category).trim() : null,
      unit: String(l.unit || "식").trim() || "식",
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      unitPrice: Math.round(Number(l.unitPrice) || 0),
      unitCost: Math.max(0, Math.round(Number(l.unitCost) || 0)),
      lineDiscount: Math.max(0, Math.round(Number(l.lineDiscount) || 0)),
      kind: inferLineKind(l),
    }));
}

/** API 저장용 — kind 제외 */
export function quoteLinesForApi(items = []) {
  return normalizeQuoteLines(items).map(({ kind, ...l }) => l);
}

export function emptyLine() {
  return {
    name: "",
    category: "",
    unit: "식",
    quantity: 1,
    unitPrice: 0,
    unitCost: 0,
    lineDiscount: 0,
    productId: null,
    kind: "product",
  };
}

export function emptyDiscountLine(name = "VIP 특별할인") {
  return {
    name,
    category: "",
    unit: "식",
    quantity: 1,
    unitPrice: 0,
    unitCost: 0,
    lineDiscount: 0,
    productId: null,
    kind: "discount",
  };
}

export function lineLabel(line) {
  const x = lineAmount(line);
  if (x.isDiscountLine) return `${line.name || "할인"} (-${formatWon(x.discount)})`;
  if (x.discount > 0) {
    return `${formatWon(x.gross)} - ${formatWon(x.discount)} (개당 ${formatWon(x.perUnitDiscount)}) = ${formatWon(x.supply)}`;
  }
  return formatWon(x.supply);
}

/** 견적서 PDF용 — 편집 순서 유지, 연속된 동일 분류를 한 블록으로 */
export function groupLinesByCategory(lines = []) {
  const groups = [];
  let i = 0;
  while (i < lines.length) {
    const cat = String(lines[i]?.category || "").trim();
    if (!cat) {
      const batch = [];
      while (i < lines.length && !String(lines[i]?.category || "").trim()) {
        batch.push(lines[i++]);
      }
      if (batch.length) groups.push({ category: null, lines: batch });
      continue;
    }
    const batch = [];
    while (i < lines.length && String(lines[i]?.category || "").trim() === cat) {
      batch.push(lines[i++]);
    }
    groups.push({ category: cat, lines: batch });
  }
  return groups;
}

export { formatWon };
