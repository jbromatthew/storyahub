import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { notifyError, toastSuccess } from "../toast.js";

function Checkbox({ on }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        border: on ? "none" : "2px solid var(--line)",
        background: on ? "var(--accent)" : "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

export default function ContactIntroSheet({ contact, contacts, onClose, onSaved }) {
  const [mode, setMode] = useState("referrer");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const pool = useMemo(
    () => contacts.filter((x) => x.id !== contact.id),
    [contacts, contact.id]
  );

  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return pool.slice(0, 40);
    return pool.filter((c) => (c.person + c.co).toLowerCase().includes(s)).slice(0, 40);
  }, [pool, q]);

  const toggle = (id) => {
    if (mode === "referrer") {
      setPicked(new Set([id]));
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!picked.size) {
      notifyError(new Error("선택한 인맥이 없어요"));
      return;
    }
    setSaving(true);
    try {
      if (mode === "referrer") {
        const refId = [...picked][0];
        await api.updateContact(contact.id, { referredById: refId });
        toastSuccess("소개 관계를 저장했어요");
      } else {
        await Promise.all(
          [...picked].map((id) => api.updateContact(id, { referredById: contact.id }))
        );
        toastSuccess(`${picked.size}명과 소개 관계를 연결했어요`);
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      notifyError(e, "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet-bottom" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>소개 관계 추가</div>
        <div className="small" style={{ lineHeight: 1.5, marginBottom: 14, color: "var(--muted)" }}>
          {mode === "referrer"
            ? "이 인맥을 소개해준 사람을 한 명 선택하세요."
            : "이 사람이 소개한 인맥을 여러 명 선택할 수 있어요."}
        </div>

        <div className="seg" style={{ marginBottom: 14 }}>
          <button type="button" className={mode === "referrer" ? "on" : ""} style={{ flex: 1 }} onClick={() => { setMode("referrer"); setPicked(new Set()); }}>
            소개해준 사람
          </button>
          <button type="button" className={mode === "introduced" ? "on" : ""} style={{ flex: 1 }} onClick={() => { setMode("introduced"); setPicked(new Set()); }}>
            내가 소개한 인맥
          </button>
        </div>

        <div className="row" style={{ gap: 9, background: "#F4F1EA", borderRadius: 11, padding: "10px 12px", marginBottom: 10 }}>
          <span style={{ color: "var(--muted)" }}>🔍</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 · 회사 검색"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14 }}
          />
          {q && (
            <button type="button" className="chip" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setQ("")}>
              ✕
            </button>
          )}
        </div>

        <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 14 }}>
          {found.length === 0 && (
            <div className="small" style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)" }}>
              검색 결과가 없어요
            </div>
          )}
          {found.map((x) => {
            const on = picked.has(x.id);
            return (
              <div
                key={x.id}
                className="list-item row between"
                style={{ padding: "12px 0", cursor: "pointer", gap: 10 }}
                onClick={() => toggle(x.id)}
              >
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <div className="avatar" style={{ width: 36, height: 36, borderRadius: 11, fontSize: 13 }}>
                    {x.init}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{x.person}</div>
                    <div className="small" style={{ fontSize: 12 }}>{x.co}</div>
                  </div>
                </div>
                <Checkbox on={on} />
              </div>
            );
          })}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: 13 }} onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-accent" style={{ flex: 1, padding: 13 }} disabled={saving || !picked.size} onClick={save}>
            {saving ? "저장 중…" : mode === "referrer" ? "연결" : `${picked.size || ""}명 연결`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
