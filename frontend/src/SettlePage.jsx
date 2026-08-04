import React, { useState, useEffect } from "react";
import { getApiBase } from "./api/client.js";
import { installSettleCalc } from "./erp/modules.jsx";

const API = getApiBase();
const won = (n) => `${(Number(n) || 0).toLocaleString()}원`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthRange = (y, m) => [`${y}-${String(m).padStart(2, "0")}-01`, ymd(new Date(y, m, 0))];

/**
 * 설치팀 월별 정산 확인 페이지 (가입 없이 PIN 접속)
 * - 자기 팀 설치 건의 정산 내역(산출 기준 포함)을 월별로 확인
 * - 금액이 다르면 건별로 수정 요청(원하는 금액 + 사유) → 브로제이 승인 시 반영
 */
export default function SettlePage({ token }) {
  const today = new Date();
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [preview, setPreview] = useState(null);
  const [team, setTeam] = useState("");
  const [rows, setRows] = useState([]);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqFor, setReqFor] = useState(null); // {rowId, amount, comment, by}

  useEffect(() => {
    fetch(`${API}/public/install/settle/${token}/preview`)
      .then((r) => r.json()).then(setPreview)
      .catch(() => setPreview({ error: "링크 확인 실패" }));
    const saved = sessionStorage.getItem(`settle_pin_${token}`);
    if (saved) { setPin(saved); load(saved, ym); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = async (pinVal, ymVal) => {
    setErr(""); setBusy(true);
    try {
      const [from, to] = monthRange(ymVal.y, ymVal.m);
      const r = await fetch(`${API}/public/install/settle/${token}/info`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinVal, from, to }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "확인 실패"); setAuthed(false); return; }
      sessionStorage.setItem(`settle_pin_${token}`, pinVal);
      setTeam(d.team); setRows(d.rows || []); setAuthed(true);
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  const shiftMonth = (delta) => {
    const d = new Date(ym.y, ym.m - 1 + delta, 1);
    const next = { y: d.getFullYear(), m: d.getMonth() + 1 };
    setYm(next); load(pin, next);
  };

  const submitRequest = async () => {
    if (!reqFor) return;
    if (!String(reqFor.comment || "").trim()) return setErr("요청 사유를 입력하세요");
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API}/public/install/settle/${token}/request`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, rowId: reqFor.rowId, amount: Number(reqFor.amount) || 0, comment: reqFor.comment, by: reqFor.by }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "요청 실패"); return; }
      setReqFor(null);
      await load(pin, ym);
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  const S = {
    page: { minHeight: "100vh", background: "#F7F3EC", fontFamily: "'Pretendard', -apple-system, sans-serif", color: "#2B2620", padding: "24px 14px" },
    card: { maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 16, padding: "20px 18px", boxShadow: "0 2px 14px rgba(60,50,30,.08)" },
    input: { boxSizing: "border-box", border: "1px solid #E4DCCE", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" },
    btn: { padding: "10px 16px", border: 0, borderRadius: 10, background: "#C96F4A", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" },
    ghost: { padding: "8px 12px", border: "1px solid #E4DCCE", borderRadius: 10, background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
    err: { color: "#C0392B", fontSize: 13, marginTop: 10, fontWeight: 700 },
  };

  if (!authed) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, maxWidth: 480 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#C96F4A", letterSpacing: 1 }}>BROJ 설치 정산</div>
          <div style={{ fontSize: 19, fontWeight: 800, margin: "4px 0" }}>{preview?.team || "확인 중…"}</div>
          <div style={{ fontSize: 13, color: "#8A7F6E", marginBottom: 14 }}>{preview?.error || "전달받은 PIN 4자리를 입력하세요."}</div>
          <input style={{ ...S.input, width: "100%" }} inputMode="numeric" maxLength={4} placeholder="PIN 4자리" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && load(pin, ym)} />
          {err && <div style={S.err}>{err}</div>}
          <button style={{ ...S.btn, width: "100%", marginTop: 14 }} disabled={busy || pin.length !== 4} onClick={() => load(pin, ym)}>{busy ? "확인 중…" : "입장"}</button>
        </div>
      </div>
    );
  }

  const totalFinal = rows.reduce((a, r) => a + (Number(r.finalSettle) || 0), 0);
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#C96F4A", letterSpacing: 1 }}>BROJ 설치 정산</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{team}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={S.ghost} onClick={() => shiftMonth(-1)}>◀</button>
            <strong style={{ fontSize: 15 }}>{ym.y}년 {ym.m}월</strong>
            <button style={S.ghost} onClick={() => shiftMonth(1)}>▶</button>
          </div>
        </div>
        <div style={{ margin: "8px 0 14px", padding: "10px 12px", background: "#FAF6EF", borderRadius: 10, fontSize: 13.5 }}>
          {rows.length}건 · 최종 정산 합계 <strong>{won(totalFinal)}</strong> <span style={{ color: "#8A7F6E" }}>(공급가액 · VAT 포함 {won(Math.round(totalFinal * 1.1))})</span>
          <div style={{ fontSize: 12, color: "#8A7F6E", marginTop: 3 }}>금액이 다르면 각 건의 "수정 요청"으로 원하는 금액과 사유를 남겨주세요. 브로제이 승인 후 반영됩니다.</div>
        </div>
        {err && <div style={S.err}>{err}</div>}

        {rows.map((r) => {
          const c = installSettleCalc(r);
          const final = Number(r.finalSettle) || 0;
          const sr = r.settleRequest;
          const equips = [1, 2, 3].map((i) => r[`kiosk${i}`] ? `${r[`kiosk${i}`]} ×${r[`qty${i}`] || 1}` : null).filter(Boolean).join(", ");
          return (
            <div key={r.id} style={{ border: "1px solid #EFE7D8", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5 }}>{r.centerName || "(센터명 없음)"}</div>
                  <div style={{ fontSize: 12.5, color: "#8A7F6E" }}>{r.installDate || "날짜 미정"} · {r.type || "—"} · {r.region || "지방"}{equips ? ` · ${equips}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{final ? won(final) : "정산 미입력"}</div>
                  {c.total > 0 && c.total !== final && <div style={{ fontSize: 11.5, color: "#8A7F6E" }}>자동계산 {won(c.total)}</div>}
                </div>
              </div>
              {c.parts.length > 0 && (
                <div style={{ fontSize: 12, color: "#8A7F6E", marginTop: 6, lineHeight: 1.5 }}>
                  {c.parts.map((p, i) => `${p.label} ${won(p.amount)}`).join(" + ")}
                </div>
              )}
              {r.adjustNote && <div style={{ fontSize: 12.5, marginTop: 6, color: "#B26A00", fontWeight: 700 }}>브로제이 조정: {r.adjustNote}</div>}

              {sr?.status === "pending" && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "#FFF3E0", borderRadius: 8, fontSize: 12.5 }}>
                  <strong>수정 요청 중</strong> — {won(sr.amount)} · {sr.comment} <span style={{ color: "#8A7F6E" }}>(승인 대기)</span>
                </div>
              )}
              {sr?.status === "approved" && <div style={{ marginTop: 8, fontSize: 12.5, color: "#0D7A3E", fontWeight: 700 }}>수정 요청 승인됨 → {won(sr.amount)} 반영</div>}
              {sr?.status === "rejected" && <div style={{ marginTop: 8, fontSize: 12.5, color: "#8A7F6E", fontWeight: 700 }}>수정 요청이 거절되었습니다{sr.ownerNote ? ` — ${sr.ownerNote}` : ""}</div>}

              {reqFor?.rowId === r.id ? (
                <div style={{ marginTop: 8, padding: "10px", background: "#FAF6EF", borderRadius: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input style={{ ...S.input, width: 130, textAlign: "right" }} inputMode="numeric" placeholder="원하는 금액"
                      value={reqFor.amount} onChange={(e) => setReqFor((x) => ({ ...x, amount: e.target.value.replace(/\D/g, "") }))} />
                    <input style={{ ...S.input, flex: "1 1 140px" }} placeholder="작성자"
                      value={reqFor.by} onChange={(e) => setReqFor((x) => ({ ...x, by: e.target.value }))} />
                  </div>
                  <textarea style={{ ...S.input, width: "100%", minHeight: 56, marginTop: 8, resize: "vertical" }} placeholder="요청 사유 (예: 추가 방문 발생, 사전정산 반영 등)"
                    value={reqFor.comment} onChange={(e) => setReqFor((x) => ({ ...x, comment: e.target.value }))} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={S.btn} disabled={busy} onClick={submitRequest}>요청 보내기</button>
                    <button style={S.ghost} onClick={() => setReqFor(null)}>취소</button>
                  </div>
                </div>
              ) : (
                sr?.status !== "pending" && (
                  <button style={{ ...S.ghost, marginTop: 8 }} onClick={() => setReqFor({ rowId: r.id, amount: String(final || c.total || ""), comment: "", by: team })}>
                    ✏️ 금액 수정 요청
                  </button>
                )
              )}
            </div>
          );
        })}
        {!rows.length && <div style={{ padding: 20, textAlign: "center", color: "#8A7F6E", fontSize: 13.5 }}>이 달에 설치 건이 없습니다.</div>}
      </div>
    </div>
  );
}
