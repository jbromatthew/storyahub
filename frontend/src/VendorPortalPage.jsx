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
const todayStr = () => new Date().toISOString().slice(0, 10);
const box = { maxWidth: 860, margin: "0 auto", padding: "22px 16px 70px", fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", color: "#2A2118" };
const card = { background: "#fff", border: "1px solid #E8E0D4", borderRadius: 14, padding: 16, marginTop: 14 };
const inp = { border: "1px solid #E3DED4", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 800, background: bg, color: fg, cursor: "pointer", fontFamily: "inherit" });
const btnGhost = { border: "1px solid #E3DED4", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 800, background: "#fff", color: "#5A544A", cursor: "pointer", fontFamily: "inherit" };
const badge = (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: bg, color: fg, whiteSpace: "nowrap" });

const STATUS_BADGE = {
  requested: ["#FFF3E0", "#B26A00", "승인 대기"],
  approved: ["#E8F1FB", "#1A5DAB", "진행 중"],
  done: ["#E8F5E9", "#2D6A3F", "완료"],
  cancelled: ["#F1F1F1", "#777", "취소"],
};

const FILTERS = [
  ["all", "전체"],
  ["requested", "승인 대기"],
  ["predeliver", "출고 전"],
  ["delivering", "출고 중"],
  ["delivered", "출고 완료"],
  ["unpaid", "입금 대기"],
  ["done", "완료"],
];

function orderMeta(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  const deliveries = Array.isArray(o.deliveries) ? o.deliveries : [];
  const totalQty = items.reduce((s, it) => s + it.qty, 0);
  const delivered = deliveries.reduce((s, d) => s + d.qty, 0);
  return { items, deliveries, totalQty, delivered };
}

function PayRow({ label, kind, amount, requestedAt, paidAt, taxDate, taxNo, verified, deliveryDates, onOpenClaim, claiming }) {
  return (
    <div style={{ padding: "8px 0", borderTop: "1px dashed #E8E0D4" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ width: 40 }}>{label}</strong>
        <span style={{ fontWeight: 800 }}>{won(amount)}</span>
        {paidAt ? (
          <span style={badge("#E8F5E9", "#2D6A3F")}>입금 완료 · {new Date(paidAt).toLocaleDateString("ko-KR")}</span>
        ) : requestedAt ? (
          <span style={badge("#FFF3E0", "#B26A00")}>청구됨 · 입금 대기</span>
        ) : (
          <button type="button" style={claiming ? btnGhost : btn("#DD5E39")} onClick={onOpenClaim}>{claiming ? "청구 신청 닫기" : `💰 ${label} 청구 신청`}</button>
        )}
        {requestedAt && !paidAt && (
          <span style={verified ? badge("#E8F1FB", "#1A5DAB") : badge("#F1F1F1", "#777")}>{verified ? "브로제이 계산서 확인 ✓" : "브로제이 확인 대기"}</span>
        )}
      </div>
      {(taxDate || taxNo) && (
        <div style={{ fontSize: 12.5, color: "#5A544A", marginTop: 4 }}>
          🧾 세금계산서 {taxDate || "-"}{taxNo ? ` · 승인번호 ${taxNo}` : ""}
          {kind === "balance" && (deliveryDates || []).length > 0 && ` · 납품일 ${(deliveryDates || []).join(", ")}`}
        </div>
      )}
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
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [delivery, setDelivery] = useState(null); // {orderId, date, name, qty, note}
  const [claim, setClaim] = useState(null); // {orderId, kind, taxDate, taxNo, dates}

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
      <div style={{ ...box, maxWidth: 520 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#C96F2B", letterSpacing: ".08em" }}>BROJ PARTNER</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 4px" }}>{name || "협력사"} 발주 포털</h1>
        <div style={{ color: "#8A7E6F", fontSize: 14, lineHeight: 1.5 }}>브로제이와의 발주·청구·세금계산서·출고 내역을 함께 관리합니다.<br />담당자에게 받은 PIN을 입력하세요.</div>
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

  const allOrders = data.orders || [];
  const products = Array.isArray(data.products) ? data.products : [];

  const orders = allOrders.filter((o) => {
    const m = orderMeta(o);
    if (q.trim()) {
      const hay = `${o.orderDate} ${m.items.map((it) => it.name).join(" ")} ${o.note || ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    switch (filter) {
      case "requested": return o.status === "requested";
      case "predeliver": return o.status === "approved" && m.delivered === 0;
      case "delivering": return o.status !== "cancelled" && m.delivered > 0 && m.delivered < m.totalQty;
      case "delivered": return m.totalQty > 0 && m.delivered >= m.totalQty;
      case "unpaid": return o.status !== "cancelled" && ((o.prepayRequestedAt && !o.prepayPaidAt) || (o.balanceRequestedAt && !o.balancePaidAt));
      case "done": return o.status === "done";
      default: return true;
    }
  });

  // 청구 신청 폼 — 해당 항목(선금/잔금) 줄 바로 아래에 표시
  const claimForm = claim ? (
    <div style={{ background: "#FAF6EF", borderRadius: 10, padding: "12px 14px", margin: "6px 0 10px", border: "1px solid #EFE7DA" }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{claim.kind === "prepay" ? "선금" : "잔금"} 청구 신청</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>계산서 발행일</span>
        <input type="date" style={{ ...inp, padding: "7px 9px" }} value={claim.taxDate} onChange={(e) => setClaim((c) => ({ ...c, taxDate: e.target.value }))} />
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>승인번호</span>
        <input style={{ ...inp, flex: "1 1 180px", padding: "7px 9px" }} placeholder="세금계산서 승인번호" value={claim.taxNo} onChange={(e) => setClaim((c) => ({ ...c, taxNo: e.target.value }))} />
      </div>
      {claim.kind === "balance" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>최종 납품일자 <span style={{ fontWeight: 500, color: "#8A7E6F" }}>— 나눠서 납품했으면 날짜를 추가하세요</span></div>
          {claim.dates.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input type="date" style={{ ...inp, padding: "7px 9px" }} value={d} onChange={(e) => setClaim((c) => ({ ...c, dates: c.dates.map((x, j) => (j === i ? e.target.value : x)) }))} />
              {claim.dates.length > 1 && <button type="button" style={{ ...btnGhost, padding: "6px 10px" }} onClick={() => setClaim((c) => ({ ...c, dates: c.dates.filter((_, j) => j !== i) }))}>✕</button>}
            </div>
          ))}
          <button type="button" style={{ ...btnGhost, padding: "6px 10px", fontSize: 12 }} onClick={() => setClaim((c) => ({ ...c, dates: [...c.dates, ""] }))}>+ 납품일 추가</button>
        </div>
      )}
      <button
        type="button"
        style={{ ...btn("#DD5E39"), width: "100%", marginTop: 10 }}
        disabled={busy === `cl${claim.orderId}` || !claim.taxDate || !claim.taxNo.trim() || (claim.kind === "balance" && !claim.dates.some((d) => d))}
        onClick={() => act(async () => {
          await post(`${vendorId}/orders/${claim.orderId}/request-payment`, { pin: pin.trim(), kind: claim.kind, taxDate: claim.taxDate, taxNo: claim.taxNo.trim(), deliveryDates: claim.dates.filter(Boolean) });
          setClaim(null);
        }, `cl${claim.orderId}`)}
      >
        {busy === `cl${claim.orderId}` ? "신청 중…" : "청구 신청하기"}
      </button>
    </div>
  ) : null;

  return (
    <div style={box}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#C96F2B", letterSpacing: ".08em" }}>BROJ PARTNER</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 4px" }}>{data.name} 발주 포털</h1>
      <div style={{ color: "#8A7E6F", fontSize: 13.5, lineHeight: 1.5 }}>
        발주 승인 → 선금 청구(계산서) → 출고 → 잔금 청구(계산서+납품일) 순서로 진행합니다. 발주 내용 수정과 입금 확인은 브로제이가 합니다.
      </div>

      {products.length > 0 && (
        <div style={card}>
          <button type="button" style={{ ...btnGhost, width: "100%" }} onClick={() => setShowProducts((v) => !v)}>
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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button"
            style={filter === id ? { ...btn("#DD5E39"), padding: "7px 12px", fontSize: 12.5 } : { ...btnGhost, padding: "7px 12px", fontSize: 12.5 }}
            onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <input style={{ ...inp, flex: "1 1 150px", padding: "8px 12px", fontSize: 13 }} placeholder="🔍 제품·날짜 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {err && <div style={{ color: "#C5221F", marginTop: 12, fontSize: 14, fontWeight: 700 }}>{err}</div>}

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 680 }}>
          <thead>
            <tr style={{ background: "#1B1A17", color: "#fff" }}>
              <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>발주일</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>제품</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>합계</th>
              <th style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>선금</th>
              <th style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>잔금</th>
              <th style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>출고</th>
              <th style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const [bg, fg, label] = STATUS_BADGE[o.status] || STATUS_BADGE.requested;
              const { items, deliveries, totalQty, delivered } = orderMeta(o);
              const history = Array.isArray(o.history) ? o.history : [];
              const deliveredByName = {};
              for (const d of deliveries) deliveredByName[d.name] = (deliveredByName[d.name] || 0) + d.qty;
              const payBadge = (requestedAt, paidAt, verified) => paidAt
                ? <span style={badge("#E8F5E9", "#2D6A3F")}>완료</span>
                : requestedAt
                  ? <span style={badge("#FFF3E0", "#B26A00")}>청구됨{verified ? " ✓" : ""}</span>
                  : <span style={{ color: "#B0A694" }}>—</span>;
              const open = expanded === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr style={{ borderTop: "1px solid #F0EAE0", cursor: "pointer", background: open ? "#FAF6EF" : "#fff" }} onClick={() => setExpanded(open ? null : o.id)}>
                    <td style={{ padding: "10px 12px", fontWeight: 800, whiteSpace: "nowrap" }}>{o.orderDate}</td>
                    <td style={{ padding: "10px 12px" }}>{items.map((it) => `${it.name} ×${it.qty}`).join(", ")}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{won(o.totalAmount)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{payBadge(o.prepayRequestedAt, o.prepayPaidAt, o.prepayVerified)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{payBadge(o.balanceRequestedAt, o.balancePaidAt, o.balanceVerified)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: delivered >= totalQty && totalQty > 0 ? "#2D6A3F" : "#8A7E6F", whiteSpace: "nowrap" }}>{delivered}/{totalQty}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}><span style={badge(bg, fg)}>{label}</span></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} style={{ background: "#FCFAF6", padding: "14px 18px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", border: "1px solid #F0EAE0", borderRadius: 8 }}>
                          <tbody>
                            {items.map((it, i) => (
                              <tr key={i} style={{ borderTop: i ? "1px solid #F0EAE0" : "none" }}>
                                <td style={{ padding: "7px 10px" }}>{it.name}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{it.qty}대 × {won(it.unitPrice)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{won(it.amount)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 12, color: (deliveredByName[it.name] || 0) >= it.qty ? "#2D6A3F" : "#8A7E6F", whiteSpace: "nowrap" }}>출고 {deliveredByName[it.name] || 0}/{it.qty}</td>
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
                          <div style={{ marginTop: 8 }}>
                            <PayRow
                              label="선금" kind="prepay" amount={o.prepayAmount} requestedAt={o.prepayRequestedAt} paidAt={o.prepayPaidAt}
                              taxDate={o.prepayTaxDate} taxNo={o.prepayTaxNo} verified={o.prepayVerified}
                              claiming={claim?.orderId === o.id && claim?.kind === "prepay"}
                              onOpenClaim={() => setClaim(claim?.orderId === o.id && claim?.kind === "prepay" ? null : { orderId: o.id, kind: "prepay", taxDate: todayStr(), taxNo: "", dates: [] })}
                            />
                            {claim?.orderId === o.id && claim.kind === "prepay" && claimForm}
                            <PayRow
                              label="잔금" kind="balance" amount={o.balanceAmount} requestedAt={o.balanceRequestedAt} paidAt={o.balancePaidAt}
                              taxDate={o.balanceTaxDate} taxNo={o.balanceTaxNo} verified={o.balanceVerified} deliveryDates={o.balanceDeliveryDates}
                              claiming={claim?.orderId === o.id && claim?.kind === "balance"}
                              onOpenClaim={() => setClaim(claim?.orderId === o.id && claim?.kind === "balance" ? null : { orderId: o.id, kind: "balance", taxDate: todayStr(), taxNo: "", dates: [todayStr()] })}
                            />
                            {claim?.orderId === o.id && claim.kind === "balance" && claimForm}

                            <div style={{ marginTop: 10, borderTop: "1px dashed #E8E0D4", paddingTop: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <strong style={{ fontSize: 13 }}>출고 기록</strong>
                                <button type="button" style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}
                                  onClick={() => setDelivery(delivery?.orderId === o.id ? null : { orderId: o.id, date: todayStr(), name: items[0]?.name || "", qty: "", note: "" })}>
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
                                  <input style={{ ...inp, flex: "0 0 80px" }} inputMode="numeric" placeholder="수량" value={delivery.qty} onChange={(e) => setDelivery((d) => ({ ...d, qty: e.target.value.replace(/[^0-9]/g, "") }))} />
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

                        {history.length > 0 && (
                          <div style={{ background: "#fff", borderRadius: 10, padding: "8px 12px", marginTop: 8, border: "1px solid #F0EAE0" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 2 }}>히스토리</div>
                            {[...history].reverse().map((h, i) => (
                              <div key={i} style={{ fontSize: 12.5, padding: "3px 0", color: "#5A544A" }}>
                                <span style={{ color: "#B0A694" }}>{new Date(h.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> · {h.text}
                              </div>
                            ))}
                          </div>
                        )}
                        {o.note && <div style={{ fontSize: 12.5, color: "#8A7E6F", marginTop: 6 }}>메모: {o.note}</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!orders.length && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#8A7E6F" }}>{allOrders.length ? "조건에 맞는 발주가 없습니다." : "아직 발주 내역이 없습니다."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
