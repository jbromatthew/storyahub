import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { notifyError, toastSuccess } from "../toast.js";

const ROLE_LABELS = {
  viewer: "뷰어",
  editor: "편집자",
};

export default function ShareSheet({ open, onClose, resourceType, resourceId, title }) {
  const [shares, setShares] = useState([]);
  const [friends, setFriends] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !resourceId) return;
    setLoading(true);
    Promise.all([api.listShares(resourceType, resourceId), api.listFriends()])
      .then(([s, f]) => {
        setShares(s || []);
        setFriends(f || []);
      })
      .catch((e) => notifyError(e, e.message || "불러오기 실패"))
      .finally(() => setLoading(false));
  }, [open, resourceType, resourceId]);

  if (!open) return null;

  const addShare = async () => {
    const v = email.trim();
    if (!v) return;
    setSaving(true);
    try {
      const row = await api.addShare(resourceType, resourceId, { email: v, role });
      setShares((p) => {
        const rest = p.filter((x) => x.user?.id !== row.user?.id);
        return [...rest, row];
      });
      setEmail("");
      toastSuccess("공유했어요");
    } catch (e) {
      notifyError(e, e.message || "공유 실패");
    } finally {
      setSaving(false);
    }
  };

  const setShareRole = async (shareId, nextRole) => {
    try {
      const row = await api.updateShare(shareId, { role: nextRole });
      setShares((p) => p.map((x) => (x.id === shareId ? row : x)));
    } catch (e) {
      notifyError(e, e.message || "권한 변경 실패");
    }
  };

  const removeShare = async (shareId) => {
    try {
      await api.removeShare(shareId);
      setShares((p) => p.filter((x) => x.id !== shareId));
    } catch (e) {
      notifyError(e, e.message || "삭제 실패");
    }
  };

  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet-bottom filter-select-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>공유</div>
        <div className="small" style={{ color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
          {title || "항목"} · 친구에게 뷰어/편집 권한을 줄 수 있어요
        </div>

        <div className="filter-pick-search" style={{ marginBottom: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="친구 이메일"
            list="share-friend-emails"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14 }}
          />
          <datalist id="share-friend-emails">
            {friends.map((f) => (
              <option key={f.user.id} value={f.user.email} />
            ))}
          </datalist>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ border: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: "var(--ink)" }}
          >
            <option value="viewer">뷰어</option>
            <option value="editor">편집자</option>
          </select>
          <button type="button" className="chip" style={{ padding: "6px 10px", fontSize: 12 }} onClick={addShare} disabled={saving}>
            추가
          </button>
        </div>

        <div className="filter-select-list">
          {loading && <div className="small" style={{ textAlign: "center", padding: "24px 0" }}>불러오는 중…</div>}
          {!loading && shares.length === 0 && (
            <div className="small" style={{ textAlign: "center", padding: "24px 0", lineHeight: 1.5, color: "var(--muted)" }}>
              아직 공유한 사람이 없어요
            </div>
          )}
          {shares.map((s) => (
            <div key={s.id} className="filter-pick-item" style={{ cursor: "default" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.user?.name || s.user?.email}</div>
                {s.user?.name && <div className="small">{s.user.email}</div>}
              </div>
              <div className="row" style={{ gap: 8, flex: "0 0 auto", alignItems: "center" }}>
                <select
                  value={s.role}
                  onChange={(e) => setShareRole(s.id, e.target.value)}
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12 }}
                >
                  <option value="viewer">{ROLE_LABELS.viewer}</option>
                  <option value="editor">{ROLE_LABELS.editor}</option>
                </select>
                <button type="button" className="chip" style={{ padding: "6px 8px", color: "var(--muted)" }} onClick={() => removeShare(s.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-accent" style={{ width: "100%", marginTop: 14, padding: 14 }} onClick={onClose}>
          완료
        </button>
      </div>
    </div>,
    document.body,
  );
}
