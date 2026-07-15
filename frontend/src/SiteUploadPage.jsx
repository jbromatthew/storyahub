import React, { useState, useRef } from "react";
import { getApiBase } from "./api/client.js";

const API = getApiBase();

async function postInfo(token, pin) {
  const r = await fetch(`${API}/public/construction/site-upload/${token}/info`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "확인 실패");
  return j;
}
async function uploadPhoto(token, pin, siteName, kind, uploader, file) {
  const r = await fetch(`${API}/public/construction/site-upload/${token}/photo`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "X-Pin": pin,
      "X-Site": encodeURIComponent(siteName),
      "X-Kind": kind,
      "X-Uploader": encodeURIComponent(uploader || ""),
    },
    body: file,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "업로드 실패");
  return j;
}

const box = { maxWidth: 480, margin: "0 auto", padding: "24px 18px 60px" };
const inp = { width: "100%", border: "1px solid #E3DED4", borderRadius: 12, padding: "13px 14px", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ width: "100%", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 800, background: bg, color: fg, cursor: "pointer", fontFamily: "inherit" });

export default function SiteUploadPage({ token }) {
  const [pin, setPin] = useState("");
  const [info, setInfo] = useState(null);
  const [uploader, setUploader] = useState("");
  const [siteName, setSiteName] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  const kindRef = useRef("before");

  const verify = async () => {
    setErr(""); setBusy("verify");
    try { setInfo(await postInfo(token, pin.trim())); }
    catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };
  const refresh = async () => { try { setInfo(await postInfo(token, pin.trim())); } catch { /* keep */ } };

  const trigger = (kind) => {
    setErr(""); setMsg("");
    if (!siteName.trim()) { setErr("개소 이름을 먼저 입력하세요"); return; }
    kindRef.current = kind;
    fileRef.current?.click();
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(kindRef.current); setErr(""); setMsg("");
    try {
      await uploadPhoto(token, pin.trim(), siteName.trim(), kindRef.current, uploader, file);
      setMsg(`'${siteName.trim()}' ${kindRef.current === "after" ? "공사 후" : "공사 전"} 사진을 올렸습니다.`);
      await refresh();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(""); }
  };

  if (!info) {
    return (
      <div style={{ minHeight: "100dvh", background: "#F7F4EE", fontFamily: "Pretendard, system-ui, sans-serif", color: "#1B1A17" }}>
        <div style={box}>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 24 }}>현장 사진 업로드</div>
          <div style={{ color: "#8C857A", marginTop: 8, lineHeight: 1.5, fontSize: 14 }}>담당자에게 받은 PIN을 입력하세요.</div>
          <input style={{ ...inp, marginTop: 20, textAlign: "center", letterSpacing: 6, fontSize: 22, fontWeight: 800 }} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="PIN" onKeyDown={(e) => { if (e.key === "Enter") verify(); }} />
          {err && <div style={{ color: "#C5221F", marginTop: 12, fontSize: 14 }}>{err}</div>}
          <button style={{ ...btn("#DD5E39"), marginTop: 16 }} disabled={busy === "verify" || pin.length < 4} onClick={verify}>{busy === "verify" ? "확인 중…" : "확인"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#F7F4EE", fontFamily: "Pretendard, system-ui, sans-serif", color: "#1B1A17" }}>
      <div style={box}>
        <div style={{ fontSize: 13, color: "#8C857A", fontWeight: 700, marginTop: 12 }}>현장 사진 업로드</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{info.apartmentName}</div>
        {info.title && <div style={{ color: "#8C857A", marginTop: 2 }}>{info.title}</div>}

        <div style={{ marginTop: 22 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#8C857A" }}>올리는 사람 (이름/팀)</label>
          <input style={{ ...inp, marginTop: 6 }} value={uploader} onChange={(e) => setUploader(e.target.value)} placeholder="예: A설치팀 이기사" />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#8C857A" }}>개소 이름</label>
          <input style={{ ...inp, marginTop: 6 }} value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="예: 1층 현관, 3번 출입구" list="site-names" />
          <datalist id="site-names">{(info.sites || []).map((s) => <option key={s.name} value={s.name} />)}</datalist>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <button style={btn("#1B1A17")} disabled={!!busy} onClick={() => trigger("before")}>{busy === "before" ? "올리는 중…" : "📷 공사 전"}</button>
          <button style={btn("#0D7A3E")} disabled={!!busy} onClick={() => trigger("after")}>{busy === "after" ? "올리는 중…" : "📷 공사 후"}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFile} />

        {msg && <div style={{ color: "#0D7A3E", marginTop: 14, fontSize: 14, fontWeight: 700 }}>{msg}</div>}
        {err && <div style={{ color: "#C5221F", marginTop: 14, fontSize: 14 }}>{err}</div>}

        <div style={{ marginTop: 26, fontSize: 13, fontWeight: 700, color: "#8C857A" }}>등록된 개소 {(info.sites || []).length}곳</div>
        <div style={{ marginTop: 8 }}>
          {(info.sites || []).length === 0 ? (
            <div style={{ color: "#8C857A", fontSize: 14 }}>아직 없습니다. 위에서 개소 이름을 적고 사진을 올리세요.</div>
          ) : info.sites.map((s) => (
            <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: "1px solid #ECE7DD" }}>
              <span style={{ fontWeight: 700 }}>{s.name}</span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: s.hasBefore ? "#0D7A3E" : "#C5C0B6" }}>{s.hasBefore ? "✓ 전" : "· 전"}</span>
                <span style={{ margin: "0 8px", color: s.hasAfter ? "#0D7A3E" : "#C5C0B6" }}>{s.hasAfter ? "✓ 후" : "· 후"}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28, fontSize: 12, color: "#B7B0A4", lineHeight: 1.5 }}>이 링크는 사진 업로드 전용입니다. 다른 정보는 보이지 않습니다.</div>
      </div>
    </div>
  );
}
