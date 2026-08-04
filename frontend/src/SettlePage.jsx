import React, { useState, useEffect } from "react";
import { getApiBase } from "./api/client.js";
import { installSettleCalc } from "./erp/modules.jsx";

const API = getApiBase();
const won = (n) => `${(Number(n) || 0).toLocaleString()}원`;

/**
 * 설치팀 정산 확인 페이지 (가입 없이 PIN 접속)
 * - 브로제이가 공유 시 지정한 기간의 자기 팀 설치 건만 보인다 (기간은 서버에서 고정)
 * - 금액이 다르면 건별로 수정 요청(원하는 금액 + 사유) → 브로제이 승인 시 반영
 */
export default function SettlePage({ token }) {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [preview, setPreview] = useState(null);
  const [team, setTeam] = useState("");
  const [period, setPeriod] = useState(null); // {from, to} — 서버가 정한 노출 기간
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqFor, setReqFor] = useState(null); // {rowId, amount, comment, by}
  const [expanded, setExpanded] = useState(null); // 펼친 행 id

  useEffect(() => {
    fetch(`${API}/public/install/settle/${token}/preview`)
      .then((r) => r.json()).then(setPreview)
      .catch(() => setPreview({ error: "링크 확인 실패" }));
    const saved = sessionStorage.getItem(`settle_pin_${token}`);
    if (saved) { setPin(saved); load(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = async (pinVal) => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/public/install/settle/${token}/info`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinVal }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "확인 실패"); setAuthed(false); return; }
      sessionStorage.setItem(`settle_pin_${token}`, pinVal);
      setTeam(d.team); setPeriod({ from: d.from, to: d.to }); setRows(d.rows || []); setAuthed(true);
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  const toggleOk = async (row) => {
    setErr("");
    const next = row.teamOk ? null : { at: new Date().toISOString(), by: team };
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, teamOk: next } : x))); // 즉시 반영
    try {
      const r = await fetch(`${API}/public/install/settle/${token}/ok`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, rowId: row.id, ok: !row.teamOk, by: team }),
      });
      const d = await r.json();
      if (!r.ok) { setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, teamOk: row.teamOk } : x))); setErr(d.error || "확인 실패"); }
    } catch {
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, teamOk: row.teamOk } : x)));
      setErr("네트워크 오류");
    }
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
      const newReq = { amount: Number(reqFor.amount) || 0, comment: reqFor.comment, by: reqFor.by || team, at: new Date().toISOString(), status: "pending" };
      setRows((prev) => prev.map((x) => (x.id === reqFor.rowId ? { ...x, settleRequest: newReq } : x))); // 즉시 반영
      setReqFor(null);
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  const S = {
    page: { minHeight: "100vh", background: "#F7F3EC", fontFamily: "'Pretendard', -apple-system, sans-serif", color: "#2B2620", padding: "24px 14px" },
    card: { maxWidth: 960, margin: "0 auto", background: "#fff", borderRadius: 16, padding: "20px 18px", boxShadow: "0 2px 14px rgba(60,50,30,.08)" },
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
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && load(pin)} />
          {err && <div style={S.err}>{err}</div>}
          <button style={{ ...S.btn, width: "100%", marginTop: 14 }} disabled={busy || pin.length !== 4} onClick={() => load(pin)}>{busy ? "확인 중…" : "입장"}</button>
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
          {period?.from && <strong style={{ fontSize: 14 }}>{period.from} ~ {period.to}</strong>}
        </div>
        <div style={{ margin: "8px 0 14px", padding: "10px 12px", background: "#FAF6EF", borderRadius: 10, fontSize: 13.5 }}>
          {rows.length}건 · 최종 정산 합계 <strong>{won(totalFinal)}</strong> <span style={{ color: "#8A7F6E" }}>(공급가액 · VAT 포함 {won(Math.round(totalFinal * 1.1))})</span>
          <span style={{ marginLeft: 8, fontWeight: 800, color: rows.length && rows.every((r) => r.teamOk && r.brojOk) ? "#2D6A3F" : "#8A7F6E" }}>
            · 양측 확인 {rows.filter((r) => r.teamOk && r.brojOk).length}/{rows.length}
          </span>
          <div style={{ fontSize: 12, color: "#8A7F6E", marginTop: 3 }}>금액이 다르면 각 건의 "수정 요청"으로 원하는 금액과 사유를 남겨주세요. 브로제이 승인 후 반영됩니다.</div>
        </div>
        {err && <div style={S.err}>{err}</div>}

        <div style={{ fontSize: 12, color: "#8A7F6E", marginBottom: 6 }}>행을 누르면 산출 내역과 수정 요청이 열립니다.</div>
        <div style={{ overflowX: "auto", border: "1px solid #EFE7D8", borderRadius: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720, fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FAF6EF", textAlign: "left" }}>
                {["시공일", "센터명", "구분", "장비", "금액", "요청", "확인"].map((h, i) => (
                  <th key={h} style={{ padding: "9px 10px", whiteSpace: "nowrap", fontSize: 12, color: "#8A7F6E", textAlign: i >= 4 && i <= 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = installSettleCalc(r);
                const final = Number(r.finalSettle) || 0;
                const sr = r.settleRequest;
                const open = expanded === r.id;
                const equips = [1, 2, 3].map((i) => r[`kiosk${i}`] ? `${r[`kiosk${i}`]} ×${r[`qty${i}`] || 1}` : null).filter(Boolean);
                return (
                  <React.Fragment key={r.id}>
                    <tr style={{ borderTop: "1px solid #F4EEE3", cursor: "pointer", background: open ? "#FAF6EF" : "#fff" }} onClick={() => setExpanded(open ? null : r.id)}>
                      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{r.installDate || "미정"}</td>
                      <td style={{ padding: "9px 10px", fontWeight: 700 }}>{r.centerName || "(센터명 없음)"}</td>
                      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{r.type || "—"}</td>
                      <td style={{ padding: "9px 10px", fontSize: 12, lineHeight: 1.45 }}>{equips.length ? equips.map((e, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{e}</div>) : "—"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>
                        {final ? won(final) : c.total > 0 ? <span style={{ color: "#B26A00", fontWeight: 700 }}>확정 전 {won(c.total)}</span> : "미정"}
                        {r.adjustNote && <div style={{ fontSize: 11, fontWeight: 600, color: "#B26A00" }}>조정: {r.adjustNote}</div>}
                      </td>
                      <td style={{ padding: "9px 10px", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700 }}>
                        {sr?.status === "pending" && <span style={{ color: "#B26A00" }}>요청중</span>}
                        {sr?.status === "approved" && <span style={{ color: "#2D6A3F" }}>승인됨</span>}
                        {sr?.status === "rejected" && <span style={{ color: "#8A7F6E" }}>거절됨</span>}
                        {!sr && <span style={{ color: "#B0A694" }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <button style={{ ...S.ghost, padding: "5px 9px", fontSize: 12, ...(r.teamOk ? { background: "#E8F5E9", borderColor: "#BBDBC4", color: "#2D6A3F" } : {}) }} disabled={busy} onClick={() => toggleOk(r)}>
                          {r.teamOk ? "✓ 팀" : "👍 OK"}
                        </button>
                        <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: r.brojOk ? "#2D6A3F" : "#B0A694" }}>{r.brojOk ? "브로제이 ✓" : "브로제이 대기"}</span>
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ background: "#FBF8F2" }}>
                        <td colSpan={7} style={{ padding: "10px 14px" }}>
                          {c.parts.length > 0 && (
                            <div style={{ fontSize: 12.5, color: "#6B6152", lineHeight: 1.6 }}>
                              <strong>산출 내역:</strong> {c.parts.map((p) => `${p.label} ${won(p.amount)}`).join(" + ")} = <strong>{won(c.total)}</strong>
                              {final > 0 && c.total !== final && <span style={{ color: "#B26A00" }}> · 최종 정산 {won(final)}</span>}
                            </div>
                          )}
                          {sr?.status === "pending" && (
                            <div style={{ marginTop: 6, fontSize: 12.5 }}><strong>수정 요청 중</strong> — {won(sr.amount)} · {sr.comment} <span style={{ color: "#8A7F6E" }}>(승인 대기)</span></div>
                          )}
                          {sr?.status === "approved" && <div style={{ marginTop: 6, fontSize: 12.5, color: "#2D6A3F", fontWeight: 700 }}>수정 요청 승인됨 → {won(sr.amount)} 반영</div>}
                          {sr?.status === "rejected" && <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A7F6E", fontWeight: 700 }}>수정 요청 거절됨{sr.ownerNote ? ` — ${sr.ownerNote}` : ""}</div>}

                          {reqFor?.rowId === r.id ? (
                            <div style={{ marginTop: 8, padding: 10, background: "#fff", border: "1px solid #EFE7D8", borderRadius: 10 }}>
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
                              <button style={{ ...S.ghost, marginTop: 8, fontSize: 12.5 }} onClick={() => setReqFor({ rowId: r.id, amount: String(final || c.total || ""), comment: "", by: team })}>
                                ✏️ 금액 수정 요청
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!rows.length && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#8A7F6E", fontSize: 13.5 }}>이 기간에 설치 건이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
