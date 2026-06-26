import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { downloadQuotePdf, openQuotePrint } from "../quotePdf.js";
import {
  DEAL_STAGES,
  QUOTE_TEMPLATES,
  contactQuoteLabel,
  emptyDiscountLine,
  emptyLine,
  formatDateKo,
  formatWon,
  lineAmount,
  normalizeQuoteLines,
  quoteLinesForApi,
  quoteTotals,
} from "../quoteUtils.js";
import { notifyError, toastSuccess } from "../toast.js";
import { confirmDelete } from "../confirmDelete.js";

const fieldStyle = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  background: "#fff",
};

function mapDealLinesToForm(items = []) {
  return items.map((l) => ({
    id: l.id,
    productId: l.productId,
    name: l.name,
    unit: l.unit,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    unitCost: l.unitCost,
    lineDiscount: l.lineDiscount || 0,
    category: l.category || "",
    kind: l.unitPrice === 0 && (l.lineDiscount || 0) > 0 && !l.productId ? "discount" : "product",
  }));
}

export default function QuoteEditor({ dealId, initialContactId, contacts = [], onBack, onSaved, onDeleted, I, openOrgSettings, openProductSettings }) {
  const [loading, setLoading] = useState(!!dealId);
  const [saving, setSaving] = useState(false);
  const [pdfing, setPdfing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [products, setProducts] = useState([]);
  const [pickContact, setPickContact] = useState(false);
  const [q, setQ] = useState("");
  const [productPickerIdx, setProductPickerIdx] = useState(null);
  const [productQ, setProductQ] = useState("");

  const [form, setForm] = useState({
    id: null,
    title: "",
    stage: "견적",
    contactId: initialContactId || "",
    organizationId: "",
    template: "standard",
    validUntil: "",
    notes: "",
    lineItems: [emptyLine()],
  });

  useEffect(() => {
    Promise.all([api.listOrganizations(), api.listProducts()])
      .then(([o, p]) => {
        setOrgs(o || []);
        setProducts(p || []);
        setForm((f) => ({
          ...f,
          organizationId: f.organizationId || o?.find((x) => x.isDefault)?.id || o?.[0]?.id || "",
        }));
      })
      .catch((e) => notifyError(e, e.message));
  }, []);

  useEffect(() => {
    if (!dealId) return;
    setLoading(true);
    api
      .getDeal(dealId)
      .then((d) => {
        setForm({
          id: d.id,
          title: d.title || "",
          stage: d.stage || "견적",
          contactId: d.contactId || "",
          organizationId: d.organizationId || "",
          template: d.template || "standard",
          validUntil: d.validUntil ? d.validUntil.slice(0, 10) : "",
          notes: d.notes || "",
          lineItems: d.lineItems?.length ? mapDealLinesToForm(d.lineItems) : [emptyLine()],
          _deal: d,
        });
      })
      .catch((e) => notifyError(e, e.message))
      .finally(() => setLoading(false));
  }, [dealId]);

  const selectedContact = contacts.find((c) => c.id === form.contactId);
  const selectedOrg = orgs.find((o) => o.id === form.organizationId);
  const totals = useMemo(() => quoteTotals(form.lineItems), [form.lineItems]);

  const ql = q.trim().toLowerCase();
  const foundContacts = contacts
    .filter((c) => !ql || (c.person + (c.co || c.company || "") + (c.title || "")).toLowerCase().includes(ql))
    .slice(0, 40);

  const pql = productQ.trim().toLowerCase();
  const foundProducts = products
    .filter(
      (p) =>
        !pql ||
        [p.name, p.category, p.unit].filter(Boolean).join(" ").toLowerCase().includes(pql)
    )
    .slice(0, 50);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setLine = (idx, patch) =>
    setForm((p) => ({
      ...p,
      lineItems: p.lineItems.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));

  const addLine = () => setForm((p) => ({ ...p, lineItems: [...p.lineItems, emptyLine()] }));

  const addDiscountLine = (name = "VIP 특별할인") =>
    setForm((p) => ({ ...p, lineItems: [...p.lineItems, emptyDiscountLine(name)] }));

  const removeLine = (idx) =>
    setForm((p) => ({
      ...p,
      lineItems: p.lineItems.length <= 1 ? [emptyLine()] : p.lineItems.filter((_, i) => i !== idx),
    }));

  const pickProduct = (idx, productId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLine(idx, {
      productId: p.id,
      name: p.name,
      category: p.category || "",
      unit: p.unit || "식",
      unitPrice: p.sellPrice,
      unitCost: p.cost,
      kind: "product",
      lineDiscount: 0,
    });
    setProductPickerIdx(null);
    setProductQ("");
  };

  const filterLineItemsForSave = (items) => quoteLinesForApi(items);

  const buildPayload = () => ({
    id: form.id || undefined,
    title: form.title.trim() || (selectedContact ? `${selectedContact.co || selectedContact.company || selectedContact.person || "견적"} 견적` : "견적"),
    stage: form.stage,
    contactId: form.contactId || null,
    organizationId: form.organizationId || null,
    template: form.template,
    validUntil: form.validUntil || null,
    notes: form.notes.trim() || null,
    lineItems: filterLineItemsForSave(form.lineItems),
  });

  const buildExportDeal = (deal) => ({
    ...deal,
    contact: selectedContact
      ? {
          person: selectedContact.person,
          title: selectedContact.title,
          department: selectedContact.department,
          company: selectedContact.co || selectedContact.company,
          phone: selectedContact.phone,
          email: selectedContact.email,
          address: selectedContact.address,
        }
      : deal?.contact,
    organization: selectedOrg || deal?.organization,
    lineItems: normalizeQuoteLines(mapDealLinesToForm(deal?.lineItems || [])),
    title: deal?.title || buildPayload().title,
    notes: form.notes,
    template: form.template,
    validUntil: form.validUntil || null,
  });

  const ensureSavedDeal = async () => {
    const payload = buildPayload();
    if (!payload.contactId) throw new Error("수신 인맥을 선택하세요");
    if (!payload.lineItems.length) throw new Error("품목을 1개 이상 입력하세요");
    const saved = await api.saveDeal(payload);
    setForm((p) => ({
      ...p,
      id: saved.id,
      _deal: saved,
      lineItems: saved.lineItems?.length ? mapDealLinesToForm(saved.lineItems) : p.lineItems,
    }));
    onSaved?.(saved);
    return saved;
  };

  const save = async () => {
    const payload = buildPayload();
    if (!payload.contactId) {
      notifyError(new Error("수신 인맥을 선택하세요"));
      return;
    }
    if (!payload.lineItems.length) {
      notifyError(new Error("품목을 1개 이상 입력하세요"));
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveDeal(payload);
      toastSuccess("견적을 저장했어요");
      setForm((p) => ({
        ...p,
        id: saved.id,
        _deal: saved,
        lineItems: saved.lineItems?.length ? mapDealLinesToForm(saved.lineItems) : p.lineItems,
      }));
      onSaved?.(saved);
    } catch (e) {
      notifyError(e, e.message);
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    setPdfing(true);
    try {
      const saved = await ensureSavedDeal();
      await downloadQuotePdf(buildExportDeal(saved));
      toastSuccess("PDF를 저장했어요");
    } catch (e) {
      notifyError(e, e.message || "PDF 생성 실패");
    } finally {
      setPdfing(false);
    }
  };

  const remove = async () => {
    if (!form.id) return;
    if (!(await confirmDelete(form.title || form._deal?.quoteNumber || "견적"))) return;
    setDeleting(true);
    try {
      await api.deleteDeal(form.id);
      toastSuccess("견적을 삭제했어요");
      onDeleted?.();
      onBack?.();
    } catch (e) {
      notifyError(e, e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="small" style={{ textAlign: "center", padding: 40 }}>불러오는 중…</div>;
  }

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 2 }}>
        <button type="button" className="iconbtn" onClick={onBack}>
          {I.back({})}
        </button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>
          {form.id ? "견적 수정" : "새 견적"}
        </div>
        {form.id ? (
          <button
            type="button"
            className="iconbtn"
            style={{ width: 42, height: 42 }}
            disabled={deleting}
            onClick={remove}
            aria-label="견적 삭제"
          >
            {I.trash?.({ width: 17, height: 17, style: { color: "var(--muted)" } }) || "✕"}
          </button>
        ) : (
          <div style={{ width: 42 }} />
        )}
      </div>

      <div className="pad" style={{ paddingBottom: 28 }}>
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="small" style={{ fontWeight: 700 }}>
              공급자 (내 소속)
            </div>
            <button type="button" className="chip" style={{ fontSize: 12 }} onClick={openOrgSettings}>
              소속 관리
            </button>
          </div>
          {orgs.length === 0 ? (
            <button type="button" className="btn btn-ghost" style={{ width: "100%", padding: 12 }} onClick={openOrgSettings}>
              + 소속 등록하기
            </button>
          ) : (
            <select value={form.organizationId} onChange={(e) => setField("organizationId", e.target.value)} style={fieldStyle}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.isDefault ? " (기본)" : ""}
                </option>
              ))}
            </select>
          )}
          {selectedOrg && (
            <div className="small" style={{ marginTop: 8, lineHeight: 1.5, color: "var(--muted)" }}>
              {[selectedOrg.ceoName, selectedOrg.bizNo, selectedOrg.phone].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
            수신 (인맥)
          </div>
          {selectedContact && !pickContact ? (
            <div className="row between card" style={{ padding: "10px 12px", gap: 8, background: "#FBFAF7" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{contactQuoteLabel(selectedContact)}</div>
                <div className="small">{[selectedContact.phone, selectedContact.email].filter(Boolean).join(" · ")}</div>
              </div>
              <button type="button" className="chip" style={{ fontSize: 12 }} onClick={() => setPickContact(true)}>
                변경
              </button>
            </div>
          ) : (
            <>
              <div className="row" style={{ gap: 9, background: "#F4F1EA", borderRadius: 11, padding: "10px 12px", marginBottom: 8 }}>
                {I.search?.({ width: 16, height: 16, style: { color: "var(--muted)" } })}
                <input
                  autoFocus={pickContact}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="이름 · 회사 검색"
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5 }}
                />
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                {foundContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="list-item"
                    style={{ width: "100%", textAlign: "left", border: "none", background: "none", cursor: "pointer" }}
                    onClick={() => {
                      setField("contactId", c.id);
                      setPickContact(false);
                      setQ("");
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{contactQuoteLabel(c)}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
              견적 제목
            </div>
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="자동 생성" style={fieldStyle} />
          </div>
          <div style={{ width: 110 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
              단계
            </div>
            <select value={form.stage} onChange={(e) => setField("stage", e.target.value)} style={{ ...fieldStyle, padding: "10px" }}>
              {DEAL_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
              양식
            </div>
            <select value={form.template} onChange={(e) => setField("template", e.target.value)} style={fieldStyle}>
              {QUOTE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
              유효기간
            </div>
            <input type="date" value={form.validUntil} onChange={(e) => setField("validUntil", e.target.value)} style={fieldStyle} />
          </div>
        </div>

        <div className="row between" style={{ marginBottom: 8, alignItems: "center" }}>
          <div>
            <div className="section-h" style={{ margin: 0 }}>
              품목
            </div>
            <div className="small" style={{ color: "var(--muted)", marginTop: 2 }}>
              같은 분류끼리 붙이면 PDF에 그룹으로 표시돼요
            </div>
          </div>
          <button type="button" className="chip" style={{ fontSize: 12, color: "var(--accent-deep)" }} onClick={openProductSettings}>
            품목 관리
          </button>
        </div>

        {form.lineItems.map((line, idx) => {
          const x = lineAmount(line);
          const isDiscount = line.kind === "discount";
          return (
          <div key={idx} className="card" style={{ padding: 12, marginBottom: 8, background: isDiscount ? "#FFF9F5" : undefined }}>
            <div className="row between" style={{ marginBottom: 8, gap: 8 }}>
              <div className="small" style={{ fontWeight: 700, color: isDiscount ? "var(--accent-deep)" : "var(--muted)" }}>
                {isDiscount ? "특별 할인" : `품목 ${idx + 1}`}
              </div>
              <button type="button" className="iconbtn" style={{ width: 34, height: 34, flexShrink: 0 }} onClick={() => removeLine(idx)}>
                ✕
              </button>
            </div>

            {isDiscount ? (
              <>
                <input
                  value={line.name}
                  onChange={(e) => setLine(idx, { name: e.target.value })}
                  placeholder="할인명 (예: VIP 특별할인)"
                  style={{ ...fieldStyle, marginBottom: 8 }}
                />
                <input
                  value={line.lineDiscount || ""}
                  onChange={(e) =>
                    setLine(idx, { lineDiscount: parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0 })
                  }
                  inputMode="numeric"
                  placeholder="할인 금액 (원)"
                  style={{ ...fieldStyle, marginBottom: 8 }}
                />
                <div className="small" style={{ color: "var(--accent-deep)", fontWeight: 700 }}>
                  공급가 차감 -{formatWon(x.discount)}
                </div>
              </>
            ) : (
              <>
                {products.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {line.productId && line.name && productPickerIdx !== idx ? (
                      <div className="row between card" style={{ padding: "10px 12px", gap: 8, background: "#FBFAF7" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{line.name}</div>
                          {line.category && <div className="small">{line.category}</div>}
                        </div>
                        <button
                          type="button"
                          className="chip"
                          style={{ fontSize: 12 }}
                          onClick={() => {
                            setProductPickerIdx(idx);
                            setProductQ("");
                          }}
                        >
                          변경
                        </button>
                      </div>
                    ) : productPickerIdx === idx ? (
                      <>
                        <div className="row" style={{ gap: 9, background: "#F4F1EA", borderRadius: 11, padding: "10px 12px", marginBottom: 8 }}>
                          {I.search?.({ width: 16, height: 16, style: { color: "var(--muted)" } })}
                          <input
                            autoFocus
                            value={productQ}
                            onChange={(e) => setProductQ(e.target.value)}
                            placeholder="품목명 · 분류 검색"
                            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5 }}
                          />
                          <button type="button" className="chip" style={{ fontSize: 11 }} onClick={() => setProductPickerIdx(null)}>
                            닫기
                          </button>
                        </div>
                        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                          {foundProducts.length === 0 ? (
                            <div className="small" style={{ padding: 12, color: "var(--muted)" }}>
                              검색 결과 없음
                            </div>
                          ) : (
                            foundProducts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="list-item"
                                style={{ width: "100%", textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: "10px 12px" }}
                                onClick={() => pickProduct(idx, p.id)}
                              >
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                                <div className="small">
                                  {[p.category, p.unit, formatWon(p.sellPrice)].filter(Boolean).join(" · ")}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: "100%", padding: 10, fontSize: 13 }}
                        onClick={() => {
                          setProductPickerIdx(idx);
                          setProductQ("");
                        }}
                      >
                        품목에서 검색…
                      </button>
                    )}
                  </div>
                )}
                <input
                  value={line.name}
                  onChange={(e) => setLine(idx, { name: e.target.value, productId: null, kind: "product" })}
                  placeholder="품목명"
                  style={{ ...fieldStyle, marginBottom: 8 }}
                />
                <input
                  value={line.category || ""}
                  onChange={(e) => setLine(idx, { category: e.target.value })}
                  placeholder="분류 (IoT, 키오스크 등 — PDF 그룹)"
                  style={{ ...fieldStyle, marginBottom: 8, fontSize: 13 }}
                />
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <input
                    value={line.unit}
                    onChange={(e) => setLine(idx, { unit: e.target.value })}
                    placeholder="단위"
                    style={{ ...fieldStyle, width: 64, flex: "0 0 64px" }}
                  />
                  <input
                    value={line.quantity}
                    onChange={(e) => setLine(idx, { quantity: parseInt(e.target.value, 10) || 1 })}
                    inputMode="numeric"
                    placeholder="수량"
                    style={{ ...fieldStyle, width: 64, flex: "0 0 64px" }}
                  />
                  <input
                    value={line.unitPrice}
                    onChange={(e) => setLine(idx, { unitPrice: parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0 })}
                    inputMode="numeric"
                    placeholder="판매단가"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <input
                    value={line.unitCost}
                    onChange={(e) => setLine(idx, { unitCost: parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0 })}
                    inputMode="numeric"
                    placeholder="원가"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                </div>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <div className="small" style={{ fontWeight: 700, alignSelf: "center", flexShrink: 0 }}>
                    개당 할인
                  </div>
                  <input
                    value={line.lineDiscount || ""}
                    onChange={(e) =>
                      setLine(idx, { lineDiscount: parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0 })
                    }
                    inputMode="numeric"
                    placeholder="개당 할인 (원)"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                </div>
                <div className="small" style={{ color: "var(--muted)" }}>
                  공급가 {formatWon(x.supply)}
                  {x.discount > 0
                    ? ` (총 할인 -${formatWon(x.discount)} · 개당 ${formatWon(x.perUnitDiscount)} × ${x.qty})`
                    : ""}{" "}
                  · 할인적용단가 {formatWon(x.effectiveUnitPrice)} · 마진{" "}
                  {x.supply > 0 ? `${Math.round((x.margin / x.supply) * 1000) / 10}%` : "—"}
                </div>
              </>
            )}
          </div>
        );
        })}

        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: 11 }} onClick={addLine}>
            + 품목 추가
          </button>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: 11 }} onClick={() => addDiscountLine()}>
            + 할인 항목
          </button>
        </div>
        <button
          type="button"
          className="chip"
          style={{ width: "100%", justifyContent: "center", display: "flex", padding: 10, marginBottom: 14, fontSize: 13 }}
          onClick={() => addDiscountLine("VIP 특별할인")}
        >
          VIP 특별할인 빠른 추가
        </button>

        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          {totals.discountTotal > 0 && (
            <div className="row between" style={{ marginBottom: 6, color: "var(--accent-deep)" }}>
              <span>할인 합계</span>
              <span style={{ fontWeight: 700 }}>-{formatWon(totals.discountTotal)}</span>
            </div>
          )}
          <div className="row between">
            <span>공급가 합계</span>
            <span style={{ fontWeight: 700 }}>{formatWon(totals.supplyAmount)}</span>
          </div>
          <div className="row between" style={{ marginTop: 6 }}>
            <span>부가세 (10%)</span>
            <span>{formatWon(totals.vat)}</span>
          </div>
          <div className="row between" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 800 }}>합계 (VAT 포함)</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: "var(--accent-deep)" }}>{formatWon(totals.total)}</span>
          </div>
          <div className="row between small" style={{ marginTop: 10, color: "var(--muted)" }}>
            <span>원가 {formatWon(totals.totalCost)}</span>
            <span>
              마진 {formatWon(totals.margin)} ({totals.marginRate}%)
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
            비고
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            rows={3}
            placeholder="납기, 결제 조건 등"
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-accent" style={{ flex: 1, padding: 14 }} disabled={saving || deleting} onClick={save}>
            {saving ? "저장 중…" : form.id ? "변경 저장" : "저장"}
          </button>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: 14 }} disabled={pdfing || deleting} onClick={exportPdf}>
            {pdfing ? "PDF…" : "PDF 저장"}
          </button>
        </div>
        {form.id && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 10, padding: 12, color: "var(--muted)" }}
            disabled={deleting}
            onClick={remove}
          >
            {deleting ? "삭제 중…" : "견적 삭제"}
          </button>
        )}
        <button
          type="button"
          className="chip"
          style={{ width: "100%", marginTop: 10, justifyContent: "center", display: "flex", padding: 12 }}
          disabled={pdfing || saving}
          onClick={async () => {
            setPdfing(true);
            try {
              const saved = await ensureSavedDeal();
              await openQuotePrint(buildExportDeal(saved));
            } catch (e) {
              notifyError(e, e.message);
            } finally {
              setPdfing(false);
            }
          }}
        >
          {pdfing ? "미리보기 준비 중…" : "인쇄 / 미리보기"}
        </button>
        {form._deal?.quoteNumber && (
          <div className="small" style={{ textAlign: "center", marginTop: 10, color: "var(--muted)" }}>
            견적번호 {form._deal.quoteNumber} · {formatDateKo(form._deal.createdAt)}
          </div>
        )}
      </div>
    </div>
  );
}
