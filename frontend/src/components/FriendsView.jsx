import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { notifyError, toastSuccess } from "../toast.js";

export default function FriendsView({ back, I }) {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [f, p] = await Promise.all([api.listFriends(), api.listPendingFriends()]);
      setFriends(f || []);
      setPending(p || []);
    } catch (e) {
      notifyError(e, e.message || "불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const requestFriend = async () => {
    const v = email.trim();
    if (!v) return;
    setSaving(true);
    try {
      await api.requestFriend(v);
      setEmail("");
      toastSuccess("친구 요청을 보냈어요");
      await reload();
    } catch (e) {
      notifyError(e, e.message || "요청 실패");
    } finally {
      setSaving(false);
    }
  };

  const accept = async (id) => {
    try {
      await api.acceptFriend(id);
      toastSuccess("친구가 되었어요 · 인맥에도 연결됐어요");
      await reload();
    } catch (e) {
      notifyError(e, e.message || "수락 실패");
    }
  };

  const decline = async (id) => {
    try {
      await api.declineFriend(id);
      await reload();
    } catch (e) {
      notifyError(e, e.message || "거절 실패");
    }
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button className="iconbtn" onClick={back}>{I.back({})}</button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>친구</div>
        <div style={{ width: 42 }} />
      </div>
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="small" style={{ lineHeight: 1.55, color: "var(--muted)", marginBottom: 12 }}>
          Storyahub 가입 친구와 미팅·지식백과를 공유할 수 있어요. 수락하면 서로 인맥에도 연결됩니다.
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="친구 이메일"
            style={{
              flex: 1,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "12px 13px",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          />
          <button className="btn btn-accent" style={{ padding: "12px 16px", flexShrink: 0 }} onClick={requestFriend} disabled={saving}>
            추가
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="pad" style={{ marginTop: 8 }}>
          <div className="section-h" style={{ marginTop: 0 }}>받은 요청</div>
          <div className="card" style={{ padding: "4px 16px" }}>
            {pending.map((p) => (
              <div key={p.id} className="list-item row between">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.user?.name || p.user?.email}</div>
                  {p.user?.name && <div className="small">{p.user.email}</div>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="chip" style={{ color: "var(--accent-deep)" }} onClick={() => accept(p.id)}>수락</button>
                  <button type="button" className="chip" style={{ color: "var(--muted)" }} onClick={() => decline(p.id)}>거절</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pad" style={{ marginTop: 14, marginBottom: 20 }}>
        <div className="section-h" style={{ marginTop: 0 }}>내 친구</div>
        <div className="card" style={{ padding: "4px 16px" }}>
          {loading && <div className="small" style={{ padding: "20px 0", textAlign: "center" }}>불러오는 중…</div>}
          {!loading && friends.length === 0 && (
            <div className="small" style={{ padding: "20px 0", textAlign: "center", lineHeight: 1.5 }}>아직 친구가 없어요</div>
          )}
          {friends.map((f) => (
            <div key={f.id} className="list-item">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{f.user?.name || f.user?.email}</div>
              {f.user?.name && <div className="small">{f.user.email}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
