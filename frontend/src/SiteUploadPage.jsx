import React, { useState, useRef, useEffect } from "react";
import { getApiBase } from "./api/client.js";
import { compressImageToJpeg } from "./api/upload.js";

const API = getApiBase();

async function postInfo(token, pin) {
  const r = await fetch(`${API}/public/construction/site-upload/${token}/info`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `확인 실패 (${r.status})`);
  return j;
}
async function uploadPhoto(token, pin, siteName, kind, uploader, file) {
  let r;
  try {
    r = await fetch(`${API}/public/construction/site-upload/${token}/photo`, {
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
  } catch {
    throw new Error("네트워크 오류로 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `업로드 실패 (${r.status})`);
  return j;
}

async function renameSiteApi(token, pin, oldName, newName) {
  const r = await fetch(`${API}/public/construction/site-upload/${token}/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, oldName, newName }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `이름 수정 실패 (${r.status})`);
}
async function deleteSiteApi(token, pin, name) {
  const r = await fetch(`${API}/public/construction/site-upload/${token}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, name }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `삭제 실패 (${r.status})`);
}

const box = { maxWidth: 560, margin: "0 auto", padding: "22px 16px 70px" };
const inp = { width: "100%", border: "1px solid #E3DED4", borderRadius: 12, padding: "13px 14px", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 800, background: bg, color: fg, cursor: "pointer", fontFamily: "inherit", width: "100%" });

export default function SiteUploadPage({ token }) {
  const [pin, setPin] = useState("");
  const [info, setInfo] = useState(null);
  const [uploader, setUploader] = useState("");
  const [localSites, setLocalSites] = useState([]); // 새로 추가 중인 개소 [{id, name}]
  const [busy, setBusy] = useState(""); // `${name}|${kind}`
  const [err, setErr] = useState("");
  const [ver, setVer] = useState(0); // 썸네일 캐시버스터
  const [preview, setPreview] = useState(null); // 확대보기 url
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);
  const pendingRef = useRef({ name: "", kind: "before" });
  const idRef = useRef(1);

  const verify = async () => {
    setErr(""); setBusy("verify");
    try { setInfo(await postInfo(token, pin.trim())); }
    catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };
  const refresh = async () => {
    try {
      const fresh = await postInfo(token, pin.trim());
      setInfo(fresh);
      const existing = new Set((fresh.sites || []).map((s) => s.name.trim()));
      setLocalSites((prev) => prev.filter((s) => !existing.has(s.name.trim())));
      setVer((v) => v + 1);
    } catch { /* keep */ }
  };

  const viewUrl = (name, kind) => `${API}/public/construction/site-upload/${token}/view?pin=${encodeURIComponent(pin.trim())}&site=${encodeURIComponent(name)}&kind=${kind}&v=${ver}`;

  const trigger = (name, kind) => {
    setErr("");
    if (!name.trim()) { setErr("개소 이름을 먼저 입력하세요"); return; }
    pendingRef.current = { name: name.trim(), kind };
    fileRef.current?.click();
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { name, kind } = pendingRef.current;
    setBusy(`${name}|${kind}`); setErr("");
    try {
      const jpeg = await compressImageToJpeg(file);
      await uploadPhoto(token, pin.trim(), name, kind, uploader, jpeg);
      await refresh();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(""); }
  };

  const addLocalSite = () => setLocalSites((prev) => [...prev, { id: idRef.current++, name: "" }]);
  const setLocalName = (id, name) => setLocalSites((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  const removeLocal = (id, name) => {
    if (name && name.trim() && !window.confirm(`'${name.trim()}' 개소를 삭제할까요?`)) return;
    setLocalSites((prev) => prev.filter((s) => s.id !== id));
  };
  const renameServer = async (oldName) => {
    const v = window.prompt("새 개소 이름", oldName);
    if (v == null) return;
    const nn = v.trim();
    if (!nn || nn === oldName) return;
    setErr("");
    try { await renameSiteApi(token, pin.trim(), oldName, nn); await refresh(); }
    catch (e) { setErr(e.message); }
  };
  const deleteServer = async (name) => {
    if (!window.confirm(`'${name}' 개소를 삭제할까요? 올린 사진도 함께 삭제됩니다.`)) return;
    setErr("");
    try { await deleteSiteApi(token, pin.trim(), name); await refresh(); }
    catch (e) { setErr(e.message); }
  };

  const q = search.trim().toLowerCase();
  const serverRows = [...(info?.sites || [])].filter((s) => !q || s.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const localRows = localSites.filter((s) => !q || (s.name || "").toLowerCase().includes(q));

  if (!info) {
    return (
      <Shell>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 20 }}>현장 사진 업로드</div>
        <div style={{ color: "#8C857A", marginTop: 8, lineHeight: 1.5, fontSize: 14 }}>담당자에게 받은 PIN을 입력하세요.</div>
        <input style={{ ...inp, marginTop: 20, textAlign: "center", letterSpacing: 6, fontSize: 22, fontWeight: 800 }} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="PIN" onKeyDown={(e) => { if (e.key === "Enter") verify(); }} />
        {err && <div style={{ color: "#C5221F", marginTop: 12, fontSize: 14 }}>{err}</div>}
        <button style={{ ...btn("#DD5E39"), marginTop: 16 }} disabled={busy === "verify" || pin.length < 4} onClick={verify}>{busy === "verify" ? "확인 중…" : "확인"}</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ fontSize: 13, color: "#8C857A", fontWeight: 700, marginTop: 10 }}>현장 사진 업로드</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{info.apartmentName}</div>
      {info.title && <div style={{ color: "#8C857A", marginTop: 2 }}>{info.title}</div>}

      <div style={{ marginTop: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: "#8C857A" }}>올리는 사람 (이름/팀)</label>
        <input style={{ ...inp, marginTop: 6 }} value={uploader} onChange={(e) => setUploader(e.target.value)} placeholder="예: A설치팀 이기사" />
      </div>

      {err && <div style={{ color: "#C5221F", marginTop: 14, fontSize: 14 }}>{err}</div>}

      <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>개소 {(info.sites || []).length + localSites.length}곳</div>
        <button type="button" style={{ ...btn("#1B1A17"), width: "auto", padding: "8px 14px" }} onClick={addLocalSite}>+ 개소 추가</button>
      </div>

      {(info.sites || []).length > 3 && (
        <input style={{ ...inp, marginTop: 10, padding: "10px 12px" }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 개소 이름 검색" />
      )}

      <div style={{ marginTop: 10 }}>
        {serverRows.map((s) => (
          <div key={s.name} style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15, flex: 1, wordBreak: "break-all" }}>{s.name}</div>
              <button type="button" onClick={() => renameServer(s.name)} style={{ border: "1px solid #E3DED4", background: "#fff", color: "#1B1A17", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>이름수정</button>
              <button type="button" onClick={() => deleteServer(s.name)} style={{ border: "1px solid #F0C4A8", background: "#fff", color: "#C0392B", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>삭제</button>
            </div>
            <Slots name={s.name} hasBefore={s.hasBefore} hasAfter={s.hasAfter} busy={busy} viewUrl={viewUrl} onPreview={setPreview} onUpload={trigger} />
          </div>
        ))}
        {localRows.map((s) => (
          <div key={s.id} style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input value={s.name} onChange={(e) => setLocalName(s.id, e.target.value)} placeholder="개소 이름 (예: 1층 현관)" style={{ ...inp, flex: 1, fontSize: 15, padding: "10px 12px" }} />
              <button type="button" onClick={() => removeLocal(s.id, s.name)} style={{ border: "1px solid #E3DED4", background: "#fff", color: "#C0392B", borderRadius: 8, width: 34, height: 40, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>
            <Slots name={s.name} busy={busy} viewUrl={viewUrl} onPreview={setPreview} onUpload={trigger} />
          </div>
        ))}
        {(info.sites || []).length + localSites.length === 0 && (
          <div style={{ color: "#8C857A", fontSize: 14, padding: "14px 0" }}>“+ 개소 추가”로 개소를 만들고 사진을 올리세요.</div>
        )}
        {q && serverRows.length === 0 && localRows.length === 0 && (
          <div style={{ color: "#8C857A", fontSize: 14, padding: "14px 0" }}>“{search}” 검색 결과가 없습니다.</div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: "#B7B0A4", lineHeight: 1.5 }}>이 링크는 사진 업로드·확인 전용입니다. 다른 정보는 보이지 않습니다.</div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFile} />
      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <img src={preview} alt="미리보기" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#F7F4EE", fontFamily: "Pretendard, system-ui, sans-serif", color: "#1B1A17" }}>
      <div style={box}>{children}</div>
    </div>
  );
}

function Slot({ label, name, kind, has, busy, viewUrl, onPreview, onUpload }) {
  const loading = busy === `${name.trim()}|${kind}`;
  const src = has && name.trim() ? viewUrl(name, kind) : null;
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  return (
    <div style={{ flex: "1 1 0" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#8C857A", marginBottom: 4 }}>{label}</div>
      {src && !broken ? (
        <div style={{ position: "relative" }}>
          <img src={src} alt={label} onClick={() => onPreview(src)} onError={() => setBroken(true)}
            style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 10, border: "1px solid #E3DED4", display: "block", cursor: "zoom-in" }} />
          <button type="button" onClick={() => onUpload(name, kind)} disabled={loading}
            style={{ position: "absolute", bottom: 6, right: 6, border: "none", background: "rgba(27,26,23,.72)", color: "#fff", borderRadius: 8, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{loading ? "…" : "다시"}</button>
        </div>
      ) : (
        <button type="button" onClick={() => onUpload(name, kind)} disabled={loading}
          style={{ width: "100%", height: 110, borderRadius: 10, border: broken ? "1px solid #F0C4A8" : "1px dashed #D8D1C5", background: broken ? "#FFF7F2" : "#fff", color: broken ? "#B96A16" : "#8C857A", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
          {loading ? "올리는 중…" : broken ? "⚠ 미리보기 불가\n다시 올리기" : `📷 ${label}`}
        </button>
      )}
    </div>
  );
}

function Slots({ name, hasBefore, hasAfter, busy, viewUrl, onPreview, onUpload }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Slot label="공사 전" name={name} kind="before" has={hasBefore} busy={busy} viewUrl={viewUrl} onPreview={onPreview} onUpload={onUpload} />
      <Slot label="공사 후" name={name} kind="after" has={hasAfter} busy={busy} viewUrl={viewUrl} onPreview={onPreview} onUpload={onUpload} />
    </div>
  );
}
