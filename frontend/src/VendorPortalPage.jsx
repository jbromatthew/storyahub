import React, { useEffect, useState } from "react";
import { getApiBase } from "./api/client.js";

/** 협력사(크라이저) 발주 포털 — 무계정, PIN 접근. /?vendor=kreiser */

const API = getApiBase();

async function post(path, body) {
  const r = await fetch(`${API}/public/vendor/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
  return j;
}

const won = (n) => `${(n || 0).toLocaleString()}원`;
const box = { maxWidth: 760, margin: "0 auto", padding: "22px 16px 70px", fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", color: "#2A2118" };
const card = { background: "#fff", border: "1px solid #E8E0D4", borderRadius: 14, padding: 16, marginTop: 14 };
const inp = { border: "1px solid #E3DED4", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 800, background: bg, color: fg, cursor: "pointer", fontFamily: "inherit" });
const badge = (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: bg, color: fg });

const STATUS_BADGE = {
  requested: ["#FFF3E0", "#B26A00", "승인 대기"],
  approved: ["#E8F1FB", "#1A5DAB", "진행 중"],
  done: ["#E8F5E9", "#2D6A3F", "완료"],
  cancelled: ["#F1F1F1", "#777", "취소"],
};

function PayRow({ label, amount, requestedAt, paidAt, taxDate, onRequest, onTaxDate, busy }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px dashed #E8E0D4" }}>
      <strong style={{ width: 40 }}>{label}</strong>
      <span style={{ fontWeight: 800 }}>{won(amount)}</span>
      {paidAt ? (
        <span style={badge("#E8F5E9", "#2D6A3F")}>입금 완료 · {new Date(paidAt).toLocaleDateString("ko-KR")}</span>
      ) : requestedAt ? (
        <span style={badge("#FFF3E0", "#B26A00")}>입금 요청됨 · {new Date(requestedAt).toLocaleDateString("ko-KR")}</span>
      ) : (
        <button type="button" style={btn("#DD5E39")} disabled={busy} onClick={onRequest}>💰 {label} 입금 요청</button>
      )}
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        계산서
        <input type="date" style={{ ...inp, padding: "5px 8px", fontSize: 12.5 }} value={taxDate || ""} onChange={(e) => onTaxDate(e.target.value)} />
      </span>
    </div>
  );
}

export default function VendorPortalPage({ vendorId }) {
  const [pin, setPin] = useState("");
  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [showProducts, setShowProducts] = useState(false);
  const [delivery, setDelivery] = useState(null); // {orderId, date, name, qty, note}
  const [openHistory, setOpenHistory] = useState(null);

  useEffect(() => {
    document.title = "브로제이 발주 포털";
    fetch(`${API}/public/vendor/${vendorId}/preview`).then((r) => (r.ok ? r.json() : null)).then((j) => j?.name && setName(j.name)).catch(() => {});
  }, [vendorId]);

  const load = async () => {
    const j = await post(`${vendorId}/orders`, { pin: pin.trim() });
    setData(j);
  };

  const verify = async () => {
    setErr(""); setBusy("verify");
    try { await load(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  const act = async (fn, key) => {
    setErr(""); setBusy(key);
    try { await fn(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  if (!data) {
    return (
      <div style={box}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#C96F2B", letterSpacing: ".08em" }}>BROJ PARTNER</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 4px" }}>{name || "협력사"} 발주 포털</h1>
        <div style={{ color: "#8A7E6F", fontSize: 14, lineHeight: 1.5 }}>브로제이와의 발주·입금·세금계산서·출고 내역을 함께 관리합니다.<br />담당자에게 받은 PIN을 입력하세요.</div>
        <input
          style={{ ...inp, width: "100%", marginTop: 20, textAlign: "center", letterSpacing: 6, fontSize: 22, fontWeight: 800 }}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          placeholder="PIN"
          onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
        />
        {err && <div style={{ color: "#C5221F", marginTop: 12, fontSize: 14 }}>{err}</div>}
        <button style={{ ...btn("#DD5E39"), width: "100%", marginTop: 16, padding: 13, fontSize: 15 }} disabled={busy === "verify" || pin.length < 4} onClick={verify}>
          {busy === "verify" ? "확인 중…" : "확인"}
        </button>
      </div>
    );
  }

  const orders = data.orders || [];
  const products = Array.isArray(data.products) ? data.products : [];

  return (
    <div style={box}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#C96F2B", letterSpacing: ".08em" }}>BROJ PARTNER</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 4px" }}>{data.name} 발주 포털</h1>
      <div style={{ color: "#8A7E6F", fontSize: 13.5, lineHeight: 1.5 }}>
        발주 승인 · 선금/잔금 입금 요청 · 세금계산서 발행일 · 출고 기록을 남길 수 있습니다. 발주 내용 수정과 입금 확인은 브로제이가 합니다.
      </div>

      {products.length > 0 && (
        <div style={card}>
          <button type="button" style={{ ...btn("#fff", "#2A2118"), border: "1px solid #E3DED4", width: "100%" }} onClick={() => setShowProducts((v) => !v)}>
            제품 단가표 {showProducts ? "접기 ▲" : "보기 ▼"}
          </button>
          {showProducts && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13.5 }}>
              <tbody>
                {products.map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F0EAE0" }}>
                    <td style={{ padding: "7px 4px" }}>{p.name}</td>
                    <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 700 }}>{p.unitPrice ? won(p.unitPrice) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {err && <div style={{ color: "#C5221F", marginTop: 12, fontSize: 14, fontWeight: 700 }}>{err}</div>}

      {orders.length === 0 && <div style={{ ...card, color: "#8A7E6F", textAlign: "center" }}>아직 발주 내역이 없습니다.</div>}

      {orders.map((o) => {
        const [bg, fg, label] = STATUS_BADGE[o.status] || STATUS_BADGE.requested;
        const items = Array.isArray(o.items) ? o.items : [];
        const deliveries = Array.isArray(o.deliveries) ? o.deliveries : [];
        const history = Array.isArray(o.history) ? o.history : [];
        const deliveredByName = {};
        for (const d of deliveries) deliveredByName[d.name] = (deliveredByName[d.name] || 0) + d.qty;
        return (
          <div key={o.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 16 }}>발주 {o.orderDate}</strong>
              <span style={badge(bg, fg)}>{label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 800 }}>{won(o.totalAmount)}</span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13.5 }}>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F0EAE0" }}>
                    <td style={{ padding: "6px 4px" }}>{it.name}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}>{it.qty}대 × {won(it.unitPrice)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700 }}>{won(it.amount)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 12, color: (deliveredByName[it.name] || 0) >= it.qty ? "#2D6A3F" : "#8A7E6F" }}>
                      출고 {deliveredByName[it.name] || 0}/{it.qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {o.status === "requested" && (
              <button type="button" style={{ ...btn("#2D6A3F"), width: "100%", marginTop: 12, padding: 12 }} disabled={busy === `ap${o.id}`}
                onClick={() => act(() => post(`${vendorId}/orders/${o.id}/approve`, { pin: pin.trim() }), `ap${o.id}`)}>
                ✔ 발주 승인
              </button>
            )}

            {o.status !== "requested" && o.status !== "cancelled" && (
              <div style={{ marginTop: 10 }}>
                <PayRow
                  label="선금" amount={o.prepayAmount} requestedAt={o.prepayRequestedAt} paidAt={o.prepayPaidAt} taxDate={o.prepayTaxDate}
                  busy={busy === `pr${o.id}`}
                  onRequest={() => act(() => post(`${vendorId}/orders/${o.id}/request-payment`, { pin: pin.trim(), kind: "prepay" }), `pr${o.id}`)}
                  onTaxDate={(d) => act(() => post(`${vendorId}/orders/${o.id}/tax-date`, { pin: pin.trim(), kind: "prepay", date: d }), `pt${o.id}`)}
                />
                <PayRow
                  label="잔금" amount={o.balanceAmount} requestedAt={o.balanceRequestedAt} paidAt={o.balancePaidAt} taxDate={o.balanceTaxDate}
                  busy={busy === `br${o.id}`}
                  onRequest={() => act(() => post(`${vendorId}/orders/${o.id}/request-payment`, { pin: pin.trim(), kind: "balance" }), `br${o.id}`)}
                  onTaxDate={(d) => act(() => post(`${vendorId}/orders/${o.id}/tax-date`, { pin: pin.trim(), kind: "balance", date: d }), `bt${o.id}`)}
                />

                <div style={{ marginTop: 10, borderTop: "1px dashed #E8E0D4", paddingTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>출고 기록</strong>
                    <button type="button" style={{ ...btn("#fff", "#2A2118"), border: "1px solid #E3DED4", padding: "5px 10px", fontSize: 12 }}
                      onClick={() => setDelivery(delivery?.orderId === o.id ? null : { orderId: o.id, date: new Date().toISOString().slice(0, 10), name: items[0]?.name || "", qty: "", note: "" })}>
                      + 기록 추가
                    </button>
                  </div>
                  {deliveries.map((d, i) => (
                    <div key={i} style={{ fontSize: 13, padding: "4px 0", color: "#5A544A" }}>
                      📦 {d.date} · {d.name} <strong>{d.qty}대</strong>{d.note ? ` · ${d.note}` : ""} <span style={{ color: "#B0A694", fontSize: 11.5 }}>({d.by === "broj" ? "브로제이" : data.name})</span>
                    </div>
                  ))}
                  {delivery?.orderId === o.id && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <input type="date" style={{ ...inp, flex: "0 0 140px" }} value={delivery.date} onChange={(e) => setDelivery((d) => ({ ...d, date: e.target.value }))} />
                      <select style={{ ...inp, flex: "1 1 140px" }} value={delivery.name} onChange={(e) => setDelivery((d) => ({ ...d, name: e.target.value }))}>
                        {items.map((it, i) => <option key={i} value={it.name}>{it.name}</option>)}
                      </select>
                      <input style={{ ...inp, flex: "0 0 80px" }} inputMode="numeric" placeholder="수량" value={delivery.qty} onChange={(e) => setDelivery((d) => ({ ...d, qty: e.target.value.replace(/[^\d]/g, "") }))} />
                      <input style={{ ...inp, flex: "1 1 120px" }} placeholder="메모 (선택)" value={delivery.note} onChange={(e) => setDelivery((d) => ({ ...d, note: e.target.value }))} />
                      <button type="button" style={btn("#DD5E39")} disabled={!delivery.qty || busy === `dv${o.id}`}
                        onClick={() => act(async () => {
                          await post(`${vendorId}/orders/${o.id}/delivery`, { pin: pin.trim(), date: delivery.date, name: delivery.name, qty: Number(delivery.qty), note: delivery.note });
                          setDelivery(null);
                        }, `dv${o.id}`)}>
                        저장
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button type="button" style={{ ...btn("#fff", "#8A7E6F"), border: "none", padding: "6px 0", fontSize: 12 }} onClick={() => setOpenHistory(openHistory === o.id ? null : o.id)}>
              히스토리 {history.length}건 {openHistory === o.id ? "▲" : "▼"}
            </button>
            {openHistory === o.id && (
              <div style={{ background: "#FAF6EF", borderRadius: 10, padding: "8px 12px" }}>
                {[...history].reverse().map((h, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: "3px 0", color: "#5A544A" }}>
                    <span style={{ color: "#B0A694" }}>{new Date(h.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> · {h.text}
                  </div>
                ))}
              </div>
            )}
            {o.note && <div style={{ fontSize: 12.5, color: "#8A7E6F", marginTop: 6 }}>메모: {o.note}</div>}
          </div>
        );
      })}
    </div>
  );
}
