import { dealAmounts, formatWon } from "./mappers.js";
import { mediaUrl } from "./api/upload.js";
import { contactQuoteLabel, formatDateKo, groupLinesByCategory, lineAmount, normalizeQuoteLines, orgDisplayName } from "./quoteUtils.js";

function wonPlain(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wonPlainSigned(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v).toLocaleString("ko-KR");
  return v < 0 ? `-${abs}` : abs;
}

function productRow(seq, line, x) {
  const supply = x.gross;
  const vat = Math.round(supply * 0.1);
  const total = supply + vat;
  return `<tr>
    <td class="c">${seq}</td>
    <td class="l">${escapeHtml(line.name)}</td>
    <td class="c">${x.qty.toLocaleString("ko-KR")}</td>
    <td class="r">${wonPlain(x.price)}</td>
    <td class="r">${wonPlain(supply)}</td>
    <td class="r">${wonPlain(vat)}</td>
    <td class="r">${wonPlain(total)}</td>
  </tr>`;
}

/** 할인 행 — 개수·개당 할인·총 할인 (음수·빨간색) */
function discountRow({ qty = 1, perUnit, total, label = "" }) {
  const q = Math.max(1, Math.round(Number(qty) || 1));
  const unitDisc = -Math.abs(Math.round(Number(perUnit) || 0));
  const supply = -Math.abs(Math.round(Number(total) || 0));
  const vat = Math.round(supply * 0.1);
  const totalVat = supply + vat;
  return `<tr class="disc-row">
    <td class="c"></td>
    <td class="l">${escapeHtml(label)}</td>
    <td class="c">${q.toLocaleString("ko-KR")}</td>
    <td class="r">${wonPlainSigned(unitDisc)}</td>
    <td class="r">${wonPlainSigned(supply)}</td>
    <td class="r">${wonPlainSigned(vat)}</td>
    <td class="r">${wonPlainSigned(totalVat)}</td>
  </tr>`;
}

function buildLineRows(lines) {
  const groups = groupLinesByCategory(lines);
  let html = "";
  for (const group of groups) {
    if (group.category) {
      html += `<tr class="cat-row"><td colspan="7">${escapeHtml(group.category)}</td></tr>`;
    }
    let seq = 0;
    for (const line of group.lines) {
      const x = lineAmount(line);
      if (x.isDiscountLine) {
        html += discountRow({
          qty: 1,
          perUnit: x.discount,
          total: x.discount,
          label: line.name || "할인",
        });
        seq += 1;
        continue;
      }
      seq += 1;
      html += productRow(seq, line, x);
      if (x.discount > 0) {
        html += discountRow({
          qty: x.qty,
          perUnit: x.perUnitDiscount,
          total: x.discount,
          label: "",
        });
      }
    }
  }
  return html;
}

function buildQuoteHtml(deal, { sealUrl = null } = {}) {
  const org = deal.organization || {};
  const contact = deal.contact || {};
  const lines = normalizeQuoteLines(deal.lineItems || []);
  const totals = lines.reduce(
    (acc, l) => {
      const x = lineAmount(l);
      acc.supply += x.supply;
      acc.cost += x.costTotal;
      return acc;
    },
    { supply: 0, cost: 0 }
  );
  const { vat, total } = dealAmounts(totals.supply);
  const lineRows = buildLineRows(lines);
  const dateStr = formatDateKo(deal.createdAt || new Date());
  const recvName = contact.company || contactQuoteLabel(contact) || "귀사";
  const ceoSeal = sealUrl
    ? `<img src="${escapeHtml(sealUrl)}" class="seal-inline" alt="직인" crossorigin="anonymous"/>`
    : "";

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #111; margin: 0; padding: 24px 28px 36px; font-size: 12px; line-height: 1.45; }
  .doc-title { text-align: center; font-size: 28px; font-weight: 800; letter-spacing: 0.35em; margin: 8px 0 18px; }
  .date-line { margin-bottom: 14px; font-size: 13px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1.15fr; gap: 0; border: 1px solid #333; margin-bottom: 16px; }
  .info-left { padding: 12px 14px; border-right: 1px solid #333; min-height: 120px; display: flex; align-items: center; font-size: 18px; font-weight: 700; }
  .info-right { display: grid; grid-template-columns: 72px 1fr; }
  .info-right div { border-bottom: 1px solid #333; padding: 7px 10px; }
  .info-right div:nth-child(odd) { background: #f3f3f3; font-weight: 700; border-right: 1px solid #333; }
  .info-right div:nth-last-child(-n+2) { border-bottom: none; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th, table.items td { border: 1px solid #333; padding: 7px 8px; }
  table.items th { background: #f3f3f3; font-weight: 700; text-align: center; }
  table.items td.c { text-align: center; }
  table.items td.r { text-align: right; }
  table.items td.l { text-align: left; }
  tr.disc-row td { color: #d32f2f; }
  tr.cat-row td { background: #fafafa; font-weight: 800; font-size: 13px; text-align: left; padding: 9px 10px; }
  .total-row td { font-weight: 800; background: #f9f9f9; }
  .notes-box { margin-top: 14px; border: 1px solid #333; }
  .notes-box .label { background: #f3f3f3; font-weight: 700; padding: 8px 10px; border-bottom: 1px solid #333; width: 72px; display: inline-block; vertical-align: top; }
  .notes-box .body { display: inline-block; padding: 8px 10px; white-space: pre-wrap; width: calc(100% - 78px); vertical-align: top; min-height: 48px; }
  .bank { margin-top: 10px; font-size: 12px; }
  .ceo-cell { position: relative; display: flex; align-items: center; min-height: 44px; padding-right: 8px !important; }
  .ceo-name { position: relative; z-index: 1; }
  .seal-inline { width: 68px; height: 68px; object-fit: contain; margin-left: 6px; flex-shrink: 0; opacity: 0.92; }
</style></head><body>
  <div class="doc-title">견 적 서</div>
  <div class="date-line">${dateStr}${deal.validUntil ? ` · 유효기간 ${formatDateKo(deal.validUntil)}` : ""}${deal.quoteNumber ? ` · No.${escapeHtml(deal.quoteNumber)}` : ""}</div>

  <div class="info-grid">
    <div class="info-left">${escapeHtml(recvName)}</div>
    <div class="info-right">
      <div>공급자</div><div>사업자 번호 ${escapeHtml(org.bizNo || "-")}</div>
      <div>상호</div><div>${escapeHtml(orgDisplayName(org))}</div>
      <div>대표자</div><div class="ceo-cell"><span class="ceo-name">${escapeHtml(org.ceoName || "-")}</span>${ceoSeal}</div>
      <div>소재지</div><div>${escapeHtml(org.address || "-")}</div>
      <div>담당자</div><div>${escapeHtml(org.ceoName || "-")}${org.phone ? ` · ${escapeHtml(org.phone)}` : ""}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:42px">순번</th>
        <th>품명</th>
        <th style="width:48px">개수</th>
        <th style="width:92px">1개에 대하여</th>
        <th style="width:92px">총 공급가</th>
        <th style="width:72px">부가세</th>
        <th style="width:96px">금액(VAT포함)</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || `<tr><td colspan="7" style="text-align:center;color:#888">품목 없음</td></tr>`}
      <tr class="total-row">
        <td colspan="6" style="text-align:center">합계(VAT포함)</td>
        <td class="r">${wonPlain(total)}</td>
      </tr>
    </tbody>
  </table>

  ${deal.notes ? `<div class="notes-box"><span class="label">적요</span><span class="body">${escapeHtml(deal.notes)}</span></div>` : ""}
  ${org.bankName || org.bankAccount ? `<div class="bank">입금 계좌: ${escapeHtml(org.bankName || "")} ${escapeHtml(org.bankAccount || "")}</div>` : ""}
</body></html>`;
}

async function resolveSealUrl(org) {
  if (!org?.sealKey) return null;
  try {
    return await mediaUrl(org.sealKey);
  } catch {
    try {
      const { api } = await import("./api/client.js");
      const { url } = await api.getUploadUrl(org.sealKey);
      return url;
    } catch {
      return null;
    }
  }
}

async function prepareDealForPdf(deal) {
  const sealUrl = await resolveSealUrl(deal.organization);
  return { html: buildQuoteHtml(deal, { sealUrl }), sealUrl };
}

function mountHtml(html) {
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "-9999px";
  wrap.style.top = "0";
  wrap.style.width = "794px";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  wrap.innerHTML = parsed.body.innerHTML;
  const styleEl = parsed.head.querySelector("style");
  if (styleEl) wrap.prepend(styleEl.cloneNode(true));
  document.body.appendChild(wrap);
  return wrap;
}

async function waitForImages(el) {
  const imgs = [...el.querySelectorAll("img")];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 2500);
        })
    )
  );
}

export async function downloadQuotePdf(deal, filename) {
  const { html } = await prepareDealForPdf(deal);
  const wrap = mountHtml(html);
  try {
    await waitForImages(wrap);
    const html2pdf = (await import("html2pdf.js")).default;
    const name = filename || `${deal.quoteNumber || deal.title || "견적"}.pdf`;
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: name.replace(/[^\w가-힣.\-]+/g, "_"),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(wrap)
      .save();
  } finally {
    document.body.removeChild(wrap);
  }
}

export async function openQuotePrint(deal) {
  const { html } = await prepareDealForPdf(deal);
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
  return true;
}

export { buildQuoteHtml, formatWon };
