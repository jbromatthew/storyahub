import React, { useState, useEffect } from "react";
import { getApiBase } from "./api/client.js";

const API = getApiBase();

/**
 * 설치팀 실사 입력 페이지 (가입 없이 PIN 접속)
 * - 실사 요청 내용(요청구분·공사내용·희망일)을 보고, 실사일·실사 기록·품목별 개수를 입력한다.
 * - 단가·금액은 어디에도 표시하지 않는다 (견적 계산은 서버에서 브로제이만 보게 처리).
 */
export default function SurveyPage({ token }) {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [preview, setPreview] = useState(null);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [visitDate, setVisitDate] = useState("");
  const [findings, setFindings] = useState("");
  const [by, setBy] = useState("");
  const [qtys, setQtys] = useState({}); // itemId -> qty

  useEffect(() => {
    fetch(`${API}/public/construction/survey/${token}/preview`)
      .then((r) => r.json())
      .then((d) => setPreview(d))
      .catch(() => setPreview({ error: "링크 확인 실패" }));
    const saved = sessionStorage.getItem(`survey_pin_${token}`);
    if (saved) { setPin(saved); auth(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const auth = async (pinVal) => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/public/construction/survey/${token}/info`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pinVal }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "확인 실패"); return; }
      sessionStorage.setItem(`survey_pin_${token}`, pinVal);
      setInfo(d);
      setAuthed(true);
      if (d.result) {
        setVisitDate(d.result.visitDate || "");
        setFindings(d.result.findings || "");
        setBy(d.result.by || "");
        const q = {};
        (d.result.items || []).forEach((it) => { if (it.itemId) q[it.itemId] = it.qty; });
        setQtys(q);
      } else {
        setVisitDate(new Date().toISOString().slice(0, 10));
      }
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setErr("");
    if (!visitDate) return setErr("실사일을 입력하세요");
    if (!findings.trim()) return setErr("실사 기록을 입력하세요 (어떻게 하기로 했는지)");
    setBusy(true);
    try {
      const items = Object.entries(qtys)
        .map(([itemId, qty]) => ({ itemId, qty: Number(qty) || 0 }))
        .filter((it) => it.qty > 0);
      const r = await fetch(`${API}/public/construction/survey/${token}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, visitDate, findings, by, items }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "저장 실패"); return; }
      setDone(true);
    } catch { setErr("네트워크 오류"); }
    finally { setBusy(false); }
  };

  const S = {
    page: { minHeight: "100vh", background: "#F7F3EC", fontFamily: "'Pretendard', -apple-system, sans-serif", color: "#2B2620", padding: "24px 16px" },
    card: { maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 16, padding: "22px 20px", boxShadow: "0 2px 14px rgba(60,50,30,.08)" },
    h1: { fontSize: 19, fontWeight: 800, margin: "0 0 4px" },
    sub: { fontSize: 13, color: "#8A7F6E", marginBottom: 14 },
    label: { display: "block", fontSize: 12.5, fontWeight: 700, margin: "12px 0 4px" },
    input: { width: "100%", boxSizing: "border-box", border: "1px solid #E4DCCE", borderRadius: 10, padding: "11px 12px", fontSize: 14, fontFamily: "inherit" },
    btn: { width: "100%", marginTop: 16, padding: "13px 0", border: 0, borderRadius: 10, background: "#C96F4A", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" },
    box: { background: "#FAF6EF", border: "1px solid #EFE7D8", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, marginTop: 10 },
    err: { color: "#C0392B", fontSize: 13, marginTop: 10, fontWeight: 700 },
  };

  if (done) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: "center", padding: "44px 20px" }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 10 }}>실사 기록이 저장되었습니다</div>
          <div style={{ ...S.sub, marginTop: 6 }}>{info?.apartmentName} · 브로제이에 전달 완료. 수정하려면 페이지를 새로고침 후 다시 저장하세요.</div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#C96F4A", letterSpacing: 1 }}>BROJ 실사 입력</div>
          <h1 style={S.h1}>{preview?.apartmentName || "현장 확인 중…"}</h1>
          <div style={S.sub}>{preview?.error ? preview.error : "전달받은 PIN 4자리를 입력하세요."}</div>
          <input style={S.input} inputMode="numeric" maxLength={4} placeholder="PIN 4자리" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && auth(pin)} />
          {err && <div style={S.err}>{err}</div>}
          <button style={S.btn} disabled={busy || pin.length !== 4} onClick={() => auth(pin)}>{busy ? "확인 중…" : "입장"}</button>
        </div>
      </div>
    );
  }

  const reqInfo = info?.request;
  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#C96F4A", letterSpacing: 1 }}>BROJ 실사 입력</div>
        <h1 style={S.h1}>{info.apartmentName}</h1>
        {info.address && <div style={S.sub}>{info.address}</div>}

        {reqInfo && (
          <div style={S.box}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>실사 요청 내용</div>
            {reqInfo.team && <div>담당 시공팀: <strong>{reqInfo.team}</strong></div>}
            {reqInfo.requestType && <div>요청구분: <strong>{reqInfo.requestType}</strong></div>}
            {reqInfo.evLink && <div>E/V연동여부: {reqInfo.evLink}</div>}
            {reqInfo.hopeDate && <div>실사희망일: {reqInfo.hopeDate}</div>}
            {reqInfo.content && <div style={{ whiteSpace: "pre-wrap" }}>공사내용: {reqInfo.content}</div>}
            {reqInfo.note && <div style={{ whiteSpace: "pre-wrap" }}>요청사항: {reqInfo.note}</div>}
          </div>
        )}

        <label style={S.label}>실사일 *</label>
        <input style={S.input} type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />

        <label style={S.label}>실사 기록 * <span style={{ fontWeight: 500, color: "#8A7F6E" }}>— 현장 상태와 어떻게 하기로 했는지</span></label>
        <textarea style={{ ...S.input, minHeight: 110, resize: "vertical" }} value={findings} onChange={(e) => setFindings(e.target.value)}
          placeholder="예) 공동현관 2개소 SRR 설치 가능. E/V 연동은 승강기 업체 협조 필요, 8/12 이후 진행하기로 함." />

        <label style={S.label}>작성자</label>
        <input style={S.input} placeholder="이름 (설치팀)" value={by} onChange={(e) => setBy(e.target.value)} />

        <label style={{ ...S.label, marginTop: 18 }}>설치 수량 <span style={{ fontWeight: 500, color: "#8A7F6E" }}>— 필요한 항목에만 개수 입력</span></label>
        <div style={{ border: "1px solid #EFE7D8", borderRadius: 12, overflow: "hidden" }}>
          {(info.items || []).map((it, i) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderTop: i ? "1px solid #F4EEE3" : "none" }}>
              <span style={{ fontSize: 13.5 }}>{it.name}</span>
              <input style={{ ...S.input, width: 76, padding: "8px 10px", textAlign: "right" }} inputMode="numeric" placeholder="0"
                value={qtys[it.id] ?? ""} onChange={(e) => setQtys((q) => ({ ...q, [it.id]: e.target.value.replace(/\D/g, "") }))} />
            </div>
          ))}
          {!(info.items || []).length && <div style={{ padding: 12, fontSize: 13, color: "#8A7F6E" }}>등록된 품목이 없습니다. 브로제이에 문의하세요.</div>}
        </div>

        {err && <div style={S.err}>{err}</div>}
        <button style={S.btn} disabled={busy} onClick={submit}>{busy ? "저장 중…" : "실사 기록 저장"}</button>
        <div style={{ fontSize: 11.5, color: "#B0A694", marginTop: 10, textAlign: "center" }}>수량을 입력하면 브로제이에서 견적이 자동 산출됩니다.</div>
      </div>
    </div>
  );
}
