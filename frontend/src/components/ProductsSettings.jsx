import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatWon } from "../quoteUtils.js";
import { notifyError, toastSuccess } from "../toast.js";

const fieldStyle = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "11px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  background: "#fff",
};

function marginLabel(sell, cost) {
  const s = Math.max(0, Number(sell) || 0);
  const c = Math.max(0, Number(cost) || 0);
  if (!s) return "—";
  const rate = Math.round(((s - c) / s) * 1000) / 10;
  return `${rate}% · ${formatWon(s - c)}`;
}

export default function ProductsSettings({ back, I }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const reload = () =>
    api
      .listProducts()
      .then(setProducts)
      .catch((e) => notifyError(e, e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const startNew = () => setEditing({ name: "", category: "", unit: "식", sellPrice: "", cost: "", description: "" });

  const save = async () => {
    if (!editing?.name?.trim()) {
      notifyError(new Error("품목명을 입력하세요"));
      return;
    }
    setSaving(true);
    try {
      await api.saveProduct({
        ...editing,
        sellPrice: parseInt(String(editing.sellPrice).replace(/\D/g, ""), 10) || 0,
        cost: parseInt(String(editing.cost).replace(/\D/g, ""), 10) || 0,
      });
      toastSuccess("저장했어요");
      setEditing(null);
      setLoading(true);
      reload();
    } catch (e) {
      notifyError(e, e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("이 품목을 비활성화할까요?")) return;
    try {
      await api.deleteProduct(id);
      toastSuccess("비활성화했어요");
      reload();
    } catch (e) {
      notifyError(e, e.message);
    }
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  if (editing) {
    return (
      <div className="fade">
        <div className="pad row between" style={{ marginTop: 8 }}>
          <button type="button" className="iconbtn" onClick={() => setEditing(null)}>
            {I.back({})}
          </button>
          <div className="h-eyebrow" style={{ marginTop: 0 }}>
            {editing.id ? "품목 수정" : "품목 추가"}
          </div>
          <div style={{ width: 42 }} />
        </div>
        <div className="pad" style={{ marginTop: 8, paddingBottom: 24 }}>
          {[
            ["name", "품목명 *"],
            ["category", "분류 (IoT, 키오스크 등 — 견적서 그룹)"],
            ["unit", "단위 (식, 개, 시간 등)"],
            ["sellPrice", "판매 단가 (공급가)"],
            ["cost", "원가 단가"],
            ["description", "설명 (선택)"],
          ].map(([k, label]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 5 }}>
                {label}
              </div>
              <input
                value={editing[k] ?? ""}
                onChange={(e) => set(k, e.target.value)}
                inputMode={k === "sellPrice" || k === "cost" ? "numeric" : "text"}
                style={fieldStyle}
              />
              {(k === "sellPrice" || k === "cost") && editing.sellPrice !== "" && (
                <div className="small" style={{ marginTop: 4 }}>
                  마진 {marginLabel(editing.sellPrice, editing.cost)}
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-accent" style={{ width: "100%", padding: 14 }} disabled={saving} onClick={save}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button type="button" className="iconbtn" onClick={back}>
          {I.back({})}
        </button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>
          품목 관리
        </div>
        <button type="button" className="chip" style={{ color: "var(--accent-deep)", fontWeight: 700 }} onClick={startNew}>
          + 추가
        </button>
      </div>
      <div className="pad" style={{ marginTop: 8 }}>
        <div className="small" style={{ lineHeight: 1.55, marginBottom: 12 }}>
          판매가와 원가를 등록하면 견적 작성 시 마진이 자동 계산돼요. 분류를 넣으면 PDF 견적서에 그룹으로 묶여요.
        </div>
        {loading && <div className="small" style={{ textAlign: "center", padding: 30 }}>불러오는 중…</div>}
        {!loading && products.length === 0 && (
          <div className="card small" style={{ padding: 24, textAlign: "center" }}>등록된 품목이 없어요.</div>
        )}
        <div className="card" style={{ padding: "4px 16px" }}>
          {products.map((p) => (
            <div key={p.id} className="list-item row between" style={{ gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {p.name}
                  {p.category ? <span className="tag gray" style={{ marginLeft: 8, fontSize: 10.5 }}>{p.category}</span> : null}
                </div>
                <div className="small" style={{ marginTop: 4 }}>
                  판매 {formatWon(p.sellPrice)} · 원가 {formatWon(p.cost)} · 마진 {marginLabel(p.sellPrice, p.cost)}
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <button type="button" className="chip" style={{ fontSize: 12 }} onClick={() => setEditing({ ...p, category: p.category || "", sellPrice: String(p.sellPrice), cost: String(p.cost) })}>
                  수정
                </button>
                <button type="button" className="iconbtn" style={{ width: 34, height: 34 }} onClick={() => remove(p.id)}>
                  {I.trash?.({ width: 15, height: 15, style: { color: "var(--muted)" } }) || "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
