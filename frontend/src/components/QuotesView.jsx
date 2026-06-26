import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { dealAmounts } from "../mappers.js";
import { contactQuoteLabel, formatWon } from "../quoteUtils.js";
import { confirmDelete } from "../confirmDelete.js";
import { notifyError, toastSuccess } from "../toast.js";
import QuoteEditor from "./QuoteEditor.jsx";
import ProductsSettings from "./ProductsSettings.jsx";
import OrgProfilesSettings from "./OrgProfilesSettings.jsx";

export default function QuotesView({ contacts = [], init = null, onInitConsumed, onOpenContact, onRefresh, I }) {
  const [dealsData, setDealsData] = useState(null);
  const [subView, setSubView] = useState(null);
  const [editor, setEditor] = useState(null);

  const reload = useCallback(() => {
    return api
      .listDeals()
      .then(setDealsData)
      .catch((e) => {
        notifyError(e, e.message);
        setDealsData({ deals: [], revenueThisMonth: { supplyAmount: 0 }, pipeline: 0 });
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!init) return;
    if (init.newQuote) {
      setEditor({ dealId: null, contactId: init.contactId || "" });
    } else if (init.dealId) {
      setEditor({ dealId: init.dealId, contactId: init.contactId || "" });
    }
    onInitConsumed?.();
  }, [init, onInitConsumed]);

  const deals = dealsData?.deals || [];
  const active = deals.filter((d) => !["성사", "실패"].includes(d.stage));
  const done = deals.filter((d) => d.stage === "성사");
  const failed = deals.filter((d) => d.stage === "실패");

  const removeDeal = async (d) => {
    if (!(await confirmDelete(d.title || d.quoteNumber || "견적"))) return;
    try {
      await api.deleteDeal(d.id);
      toastSuccess("견적을 삭제했어요");
      reload();
      onRefresh?.();
    } catch (e) {
      notifyError(e, e.message);
    }
  };

  if (subView === "orgs") {
    return <OrgProfilesSettings back={() => setSubView(null)} I={I} />;
  }
  if (subView === "products") {
    return <ProductsSettings back={() => setSubView(null)} I={I} />;
  }
  if (editor) {
    return (
      <QuoteEditor
        dealId={editor.dealId}
        initialContactId={editor.contactId}
        contacts={contacts}
        I={I}
        onBack={() => setEditor(null)}
        onSaved={() => {
          reload();
          onRefresh?.();
        }}
        onDeleted={() => {
          setEditor(null);
          reload();
          onRefresh?.();
        }}
        openOrgSettings={() => setSubView("orgs")}
        openProductSettings={() => setSubView("products")}
      />
    );
  }

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8, alignItems: "flex-end" }}>
        <div>
          <div className="h-eyebrow">견적 · 매출</div>
          <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>견적 관리</div>
        </div>
        <button type="button" className="chip" style={{ color: "var(--accent-deep)", fontWeight: 700 }} onClick={() => setEditor({ dealId: null, contactId: "" })}>
          + 새 견적
        </button>
      </div>

      <div className="pad" style={{ marginTop: 4 }}>
        <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button type="button" className="chip" onClick={() => setSubView("products")}>
            품목 관리
          </button>
          <button type="button" className="chip" onClick={() => setSubView("orgs")}>
            소속 · 회사
          </button>
        </div>

        {!dealsData && <div className="small" style={{ textAlign: "center", padding: 30 }}>불러오는 중…</div>}

        {dealsData && (
          <>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div className="row between">
                <span style={{ fontWeight: 700 }}>이번 달 확정 (VAT 포함)</span>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{formatWon(dealAmounts(dealsData.revenueThisMonth?.supplyAmount || 0).total)}</span>
              </div>
              <div className="row between small" style={{ marginTop: 8, color: "var(--muted)" }}>
                <span>파이프라인</span>
                <span>{formatWon(dealAmounts(dealsData.pipeline || 0).total)}</span>
              </div>
            </div>

            <div className="section-h">진행 중 ({active.length})</div>
            <div className="card" style={{ padding: "4px 16px", marginBottom: 16 }}>
              {active.length === 0 && <div className="small" style={{ textAlign: "center", padding: 18 }}>진행 중인 견적 없음</div>}
              {active.map((d) => (
                <QuoteRow
                  key={d.id}
                  d={d}
                  onEdit={() => setEditor({ dealId: d.id, contactId: d.contactId })}
                  onDelete={() => removeDeal(d)}
                  onOpenContact={onOpenContact}
                  I={I}
                />
              ))}
            </div>

            <div className="section-h">성사 ({done.length})</div>
            <div className="card" style={{ padding: "4px 16px", marginBottom: failed.length ? 16 : 0 }}>
              {done.length === 0 && <div className="small" style={{ textAlign: "center", padding: 18 }}>성사 견적 없음</div>}
              {done.map((d) => (
                <QuoteRow
                  key={d.id}
                  d={d}
                  onEdit={() => setEditor({ dealId: d.id, contactId: d.contactId })}
                  onDelete={() => removeDeal(d)}
                  onOpenContact={onOpenContact}
                  I={I}
                />
              ))}
            </div>

            {failed.length > 0 && (
              <>
                <div className="section-h">실패 ({failed.length})</div>
                <div className="card" style={{ padding: "4px 16px" }}>
                  {failed.map((d) => (
                    <QuoteRow
                      key={d.id}
                      d={d}
                      onEdit={() => setEditor({ dealId: d.id, contactId: d.contactId })}
                      onDelete={() => removeDeal(d)}
                      onOpenContact={onOpenContact}
                      I={I}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function QuoteRow({ d, onEdit, onDelete, onOpenContact, I }) {
  const total = d.total ?? dealAmounts(d.supplyAmount).total;
  const c = d.contact;
  return (
    <div style={{ padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
      <div className="row between" style={{ gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{d.title || "견적"}</div>
          <div className="small" style={{ marginTop: 4 }}>
            {d.quoteNumber && <span>{d.quoteNumber} · </span>}
            {d.organization?.name && <span>{d.organization.name} → </span>}
          </div>
          {c && (
            <button
              type="button"
              className="chip"
              style={{ marginTop: 6, fontSize: 11, padding: "4px 8px" }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenContact?.(c);
              }}
            >
              {contactQuoteLabel(c)}
            </button>
          )}
          <span className="tag amber" style={{ marginTop: 6, display: "inline-block", marginLeft: c ? 6 : 0 }}>
            {d.stage}
          </span>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800 }}>{formatWon(total)}</div>
          <div className="small">VAT 포함</div>
          {d.marginRate != null && (
            <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>
              마진 {d.marginRate}%
            </div>
          )}
          <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button type="button" className="chip" style={{ fontSize: 12, padding: "5px 10px" }} onClick={onEdit}>
              수정
            </button>
            <button
              type="button"
              className="iconbtn"
              style={{ width: 32, height: 32 }}
              onClick={onDelete}
              aria-label="견적 삭제"
            >
              {I.trash?.({ width: 15, height: 15, style: { color: "var(--muted)" } }) || "✕"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
