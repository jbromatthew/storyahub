import React, { useEffect, useMemo, useState } from "react";
import { getApiBase } from "./api/client.js";

/** IoT 견적내기 — 무계정 공개 페이지 (인스타 유입). /?iot=1 */

const CSS = `
:root{--ink:#2A2118;--muted:#8A7E6F;--line:#E8E0D4;--accent:#E8863A;--accent-deep:#C96F2B;--bg:#FAF6EF;--card:#fff;--green:#3E7A52;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);}
.iq{max-width:520px;margin:0 auto;padding:24px 18px 60px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:var(--ink);}
.iq-eyebrow{font-size:12.5px;font-weight:800;color:var(--accent-deep);letter-spacing:.08em;text-transform:uppercase;}
.iq h1{font-size:24px;font-weight:800;margin:6px 0 8px;line-height:1.3;}
.iq-sub{font-size:13.5px;color:var(--muted);line-height:1.55;}
.iq-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;box-shadow:0 2px 10px rgba(20,16,12,.04);}
.iq-card h2{font-size:15.5px;font-weight:800;margin-bottom:12px;}
.iq-field{margin-bottom:14px;}
.iq-field label{display:block;font-size:13px;font-weight:700;margin-bottom:6px;}
.iq-field .hint{font-size:12px;color:var(--muted);font-weight:500;margin-top:4px;line-height:1.5;}
.iq-input{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:15px;font-family:inherit;background:#fff;}
.iq-input:focus{outline:none;border-color:var(--accent);}
.iq-counter{display:flex;align-items:center;gap:10px;}
.iq-counter button{width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:#fff;font-size:20px;font-weight:800;cursor:pointer;color:var(--ink);}
.iq-counter input{flex:1;text-align:center;font-size:17px;font-weight:800;border:1px solid var(--line);border-radius:12px;padding:10px;font-family:inherit;}
.iq-net{display:inline-flex;padding:4px 12px;border-radius:20px;background:#FFF0E2;color:var(--accent-deep);font-size:12.5px;font-weight:800;}
.iq-quote-row{display:flex;justify-content:space-between;font-size:13.5px;padding:6px 0;border-bottom:1px dashed var(--line);}
.iq-quote-row .l{color:var(--muted);}
.iq-quote-row .r{font-weight:700;}
.iq-total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:15px;font-weight:800;}
.iq-total .amt{font-size:22px;color:var(--accent-deep);}
.iq-btn{width:100%;border:none;border-radius:14px;padding:15px;font-size:16px;font-weight:800;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;margin-top:14px;}
.iq-btn:disabled{opacity:.5;}
.iq-btn.ghost{background:#fff;border:1px solid var(--line);color:var(--ink);}
.iq-seg{display:flex;gap:8px;}
.iq-seg button{flex:1;border:1px solid var(--line);background:#fff;border-radius:12px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--ink);}
.iq-seg button.on{background:var(--accent);border-color:var(--accent);color:#fff;}
.iq-done{text-align:center;padding:60px 10px;}
.iq-done .big{font-size:44px;}
.iq-done h2{font-size:20px;margin:12px 0 8px;}
.iq-err{color:#B23B2A;font-size:13px;margin-top:8px;font-weight:700;}
`;

const INDUSTRIES = ["헬스장", "PT샵", "필라테스", "요가", "복싱", "주짓수", "태권도", "크로스핏", "골프", "기타"];

function won(n) {
  return `${(n || 0).toLocaleString()}원`;
}

function Counter({ value, onChange }) {
  return (
    <div className="iq-counter">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(500, Math.floor(Number(e.target.value.replace(/[^\d]/g, "")) || 0))))}
      />
      <button type="button" onClick={() => onChange(Math.min(500, value + 1))}>+</button>
    </div>
  );
}

export default function IotQuotePage() {
  const [pricing, setPricing] = useState(null);
  const [pyeong, setPyeong] = useState("");
  const [ac, setAc] = useState(0);
  const [speaker, setSpeaker] = useState(0);
  const [panel, setPanel] = useState(0);
  const [step, setStep] = useState("quote"); // quote | form | done
  const [form, setForm] = useState({ centerName: "", industry: "", industryEtc: "", usesBroj: null, address: "", phone: "" });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    document.title = "브로제이 IoT 견적내기";
    fetch(`${getApiBase()}/public/iot/pricing`).then((r) => r.json()).then(setPricing).catch(() => {});
  }, []);

  const py = Math.floor(Number(pyeong) || 0);
  const netKey = py >= 200 ? "large" : py > 100 ? "medium" : "small";

  const quote = useMemo(() => {
    if (!pricing) return null;
    const rows = [];
    const push = (label, qty, unitPrice) => qty > 0 && rows.push({ label, qty, unitPrice, amount: qty * unitPrice });
    push(pricing.items.ac.label, ac, pricing.items.ac.unitPrice);
    push(pricing.items.speaker.label, speaker, pricing.items.speaker.unitPrice);
    push(pricing.items.panel.label, panel, pricing.items.panel.unitPrice);
    if (panel > 0) push(pricing.electrician.label, 1, pricing.electrician.unitPrice);
    if (ac + speaker + panel > 0) push(pricing.network[netKey].label, 1, pricing.network[netKey].unitPrice);
    const supply = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, supply, total: Math.round(supply * 1.1) };
  }, [pricing, ac, speaker, panel, netKey]);

  const canQuote = quote && quote.rows.length > 0;

  const submit = async () => {
    setErr("");
    const industry = form.industry === "기타" ? (form.industryEtc.trim() || "기타") : form.industry;
    if (!form.centerName.trim()) return setErr("센터명을 입력해주세요");
    if (!industry) return setErr("업종을 선택해주세요");
    if (form.usesBroj == null) return setErr("브로제이 사용 여부를 선택해주세요");
    if ((form.phone.replace(/[^\d]/g, "")).length < 9) return setErr("연락처를 확인해주세요");
    setSending(true);
    try {
      const r = await fetch(`${getApiBase()}/public/iot/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerName: form.centerName,
          industry,
          usesBroj: form.usesBroj,
          address: form.address,
          phone: form.phone,
          pyeong: py,
          acCount: ac,
          speakerCount: speaker,
          panelCount: panel,
          source: "instagram",
          website: "", // honeypot
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "신청에 실패했어요. 잠시 후 다시 시도해주세요.");
      setStep("done");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="iq">
      <style>{CSS}</style>
      <div className="iq-eyebrow">BROJ IoT</div>
      <h1>우리 센터 IoT 견적,<br />30초 만에 확인하세요</h1>
      <div className="iq-sub">에어컨·스피커·전등을 폰으로 제어하는 스마트 센터. 수량만 고르면 바로 예상 견적이 나옵니다.</div>

      {step === "done" ? (
        <div className="iq-card iq-done">
          <div className="big">🎉</div>
          <h2>상담 신청 완료!</h2>
          <div className="iq-sub">담당자가 1영업일 안에 연락드릴게요.<br />견적 내역은 상담 시 다시 안내해드립니다.</div>
        </div>
      ) : (
        <>
          <div className="iq-card">
            <h2>1. 센터 규모</h2>
            <div className="iq-field">
              <label>센터 평수</label>
              <input className="iq-input" inputMode="numeric" placeholder="예: 120" value={pyeong} onChange={(e) => setPyeong(e.target.value.replace(/[^\d]/g, ""))} />
              <div className="hint">
                네트워크 규모가 자동으로 정해집니다 — {" "}
                <span className="iq-net">
                  {py >= 200 ? "대 (200평 이상)" : py > 100 ? "중 (~150평)" : "소 (~100평)"}
                </span>
              </div>
            </div>
          </div>

          <div className="iq-card">
            <h2>2. 제어할 기기</h2>
            <div className="iq-field">
              <label>에어컨 (대)</label>
              <Counter value={ac} onChange={setAc} />
            </div>
            <div className="iq-field">
              <label>스피커 (개)</label>
              <Counter value={speaker} onChange={setSpeaker} />
            </div>
            <div className="iq-field">
              <label>배전반 전등 스위치 (개)</label>
              <Counter value={panel} onChange={setPanel} />
              <div className="hint">센터 배전반(두꺼비집)을 열면 보이는 <strong>전등 차단기 스위치 개수</strong>를 세어주세요. 예: "천정등 좌/우", "천정등 中" 라벨이 붙은 스위치들.</div>
            </div>
          </div>

          <div className="iq-card">
            <h2>예상 견적</h2>
            {!canQuote ? (
              <div className="iq-sub">기기 수량을 선택하면 견적이 표시됩니다.</div>
            ) : (
              <>
                {quote.rows.map((r, i) => (
                  <div key={i} className="iq-quote-row">
                    <span className="l">{r.label}{r.qty > 1 ? ` × ${r.qty}` : ""}</span>
                    <span className="r">{won(r.amount)}</span>
                  </div>
                ))}
                <div className="iq-quote-row"><span className="l">공급가액</span><span className="r">{won(quote.supply)}</span></div>
                <div className="iq-total"><span>부가세 포함</span><span className="amt">{won(quote.total)}</span></div>
                <div className="hint" style={{ marginTop: 10 }}>{pricing?.note}</div>
              </>
            )}
          </div>

          {step === "quote" ? (
            <button type="button" className="iq-btn" disabled={!canQuote} onClick={() => setStep("form")}>
              이 견적으로 상담 신청하기
            </button>
          ) : (
            <div className="iq-card">
              <h2>상담 신청</h2>
              <div className="iq-field">
                <label>센터명 *</label>
                <input className="iq-input" value={form.centerName} onChange={(e) => setForm((f) => ({ ...f, centerName: e.target.value }))} placeholder="예: OO피트니스 강남점" />
              </div>
              <div className="iq-field">
                <label>업종 *</label>
                <select className="iq-input" value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}>
                  <option value="">선택하세요</option>
                  {INDUSTRIES.map((i2) => <option key={i2} value={i2}>{i2}</option>)}
                </select>
                {form.industry === "기타" && (
                  <input className="iq-input" style={{ marginTop: 8 }} value={form.industryEtc} onChange={(e) => setForm((f) => ({ ...f, industryEtc: e.target.value }))} placeholder="업종을 입력해주세요" />
                )}
              </div>
              <div className="iq-field">
                <label>브로제이 사용 여부 *</label>
                <div className="iq-seg">
                  <button type="button" className={form.usesBroj === true ? "on" : ""} onClick={() => setForm((f) => ({ ...f, usesBroj: true }))}>사용 중</button>
                  <button type="button" className={form.usesBroj === false ? "on" : ""} onClick={() => setForm((f) => ({ ...f, usesBroj: false }))}>아직 아니에요</button>
                </div>
              </div>
              <div className="iq-field">
                <label>주소</label>
                <input className="iq-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="시/구까지만 적어주셔도 됩니다" />
              </div>
              <div className="iq-field">
                <label>연락처 *</label>
                <input className="iq-input" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
              </div>
              {err && <div className="iq-err">{err}</div>}
              <button type="button" className="iq-btn" disabled={sending} onClick={submit}>{sending ? "신청 중…" : "상담 신청 완료하기"}</button>
              <button type="button" className="iq-btn ghost" onClick={() => setStep("quote")}>← 견적 다시 보기</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
