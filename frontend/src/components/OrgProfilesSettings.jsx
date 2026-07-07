import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { pickImageFile, uploadFile, mediaUrl } from "../api/upload.js";
import { notifyError, toastSuccess } from "../toast.js";

const fieldStyle = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "11px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  background: "#fff",
};

export default function OrgProfilesSettings({ back, I }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sealPreview, setSealPreview] = useState(null);
  const [sealUploading, setSealUploading] = useState(false);

  const reload = () =>
    api
      .listOrganizations()
      .then(setOrgs)
      .catch((e) => notifyError(e, e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const startNew = () =>
    setEditing({
      name: "",
      bizNo: "",
      ceoName: "",
      contactName: "",
      contactTitle: "",
      address: "",
      phone: "",
      email: "",
      businessType: "",
      bankName: "",
      bankAccount: "",
      isDefault: orgs.length === 0,
    });

  const save = async () => {
    if (!editing?.name?.trim()) {
      notifyError(new Error("회사명을 입력하세요"));
      return;
    }
    setSaving(true);
    try {
      await api.saveOrganization(editing);
      toastSuccess("저장했어요");
      setEditing(null);
      setLoading(true);
      reload();
    } catch (e) {
      notifyError(e, e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("이 소속 프로필을 삭제할까요?")) return;
    try {
      await api.deleteOrganization(id);
      toastSuccess("삭제했어요");
      reload();
    } catch (e) {
      notifyError(e, e.message);
    }
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let alive = true;
    if (!editing?.sealKey) {
      setSealPreview(null);
      return;
    }
    mediaUrl(editing.sealKey)
      .then((u) => {
        if (alive) setSealPreview(u);
      })
      .catch(() => {
        if (alive) setSealPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [editing?.sealKey]);

  const pickSeal = async () => {
    try {
      setSealUploading(true);
      const file = await pickImageFile();
      const key = await uploadFile(file);
      set("sealKey", key);
      toastSuccess("직인 이미지를 올렸어요");
    } catch (e) {
      if (e?.message !== "파일이 선택되지 않았습니다") notifyError(e, e.message);
    } finally {
      setSealUploading(false);
    }
  };

  if (editing) {
    return (
      <div className="fade">
        <div className="pad row between" style={{ marginTop: 8 }}>
          <button type="button" className="iconbtn" onClick={() => setEditing(null)}>
            {I.back({})}
          </button>
          <div className="h-eyebrow" style={{ marginTop: 0 }}>
            {editing.id ? "소속 수정" : "소속 추가"}
          </div>
          <div style={{ width: 42 }} />
        </div>
        <div className="pad" style={{ marginTop: 8, paddingBottom: 24 }}>
          <div className="small" style={{ lineHeight: 1.55, marginBottom: 14 }}>
            견적서 공급자 정보로 사용돼요. 여러 소속을 등록하고 견적 작성 시 선택할 수 있어요.
          </div>
          {[
            ["name", "회사명 *"],
            ["bizNo", "사업자등록번호"],
            ["ceoName", "대표자"],
            ["contactName", "담당자 성명"],
            ["contactTitle", "담당자 직함"],
            ["businessType", "업태 · 종목"],
            ["address", "주소"],
            ["phone", "전화"],
            ["email", "이메일"],
            ["bankName", "은행"],
            ["bankAccount", "계좌번호"],
          ].map(([k, label]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 5 }}>
                {label}
              </div>
              <input value={editing[k] || ""} onChange={(e) => set(k, e.target.value)} style={fieldStyle} />
            </div>
          ))}
          <label className="row" style={{ gap: 8, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={!!editing.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
            <span style={{ fontSize: 14 }}>기본 소속으로 사용</span>
          </label>
          <div style={{ marginBottom: 16 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
              직인 · 도장 (PDF 견적서에 자동 표시)
            </div>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              {sealPreview ? (
                <img src={sealPreview} alt="직인 미리보기" style={{ width: 72, height: 72, objectFit: "contain", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
              ) : (
                <div className="small" style={{ color: "var(--muted)" }}>PNG/JPG 권장 (투명 배경)</div>
              )}
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="chip" style={{ fontSize: 12 }} disabled={sealUploading} onClick={pickSeal}>
                  {sealUploading ? "업로드…" : editing.sealKey ? "직인 변경" : "직인 업로드"}
                </button>
                {editing.sealKey && (
                  <button type="button" className="chip" style={{ fontSize: 12, color: "var(--muted)" }} onClick={() => set("sealKey", null)}>
                    제거
                  </button>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-accent" style={{ width: "100%", padding: 14 }} disabled={saving} onClick={save}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button type="button" className="iconbtn" onClick={back}>
          {I.back({})}
        </button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>
          견적 소속 · 회사
        </div>
        <button type="button" className="chip" style={{ color: "var(--accent-deep)", fontWeight: 700 }} onClick={startNew}>
          + 추가
        </button>
      </div>
      <div className="pad" style={{ marginTop: 8 }}>
        {loading && <div className="small" style={{ textAlign: "center", padding: 30 }}>불러오는 중…</div>}
        {!loading && orgs.length === 0 && (
          <div className="card small" style={{ padding: 24, textAlign: "center", lineHeight: 1.6 }}>
            등록된 소속이 없어요.
            <br />
            내 회사 정보를 넣으면 견적서에 자동으로 들어가요.
          </div>
        )}
        <div className="card" style={{ padding: "4px 16px" }}>
          {orgs.map((o) => (
            <div key={o.id} className="list-item row between" style={{ gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {o.name}
                  {o.isDefault && (
                    <span className="tag green" style={{ marginLeft: 8, fontSize: 11 }}>
                      기본
                    </span>
                  )}
                </div>
                <div className="small" style={{ marginTop: 4, lineHeight: 1.5 }}>
                  {[o.contactName && `담당 ${o.contactName}`, o.contactTitle, o.ceoName && `대표 ${o.ceoName}`, o.bizNo, o.phone]
                    .filter(Boolean)
                    .map((t, i) => (
                      <div key={i}>{t}</div>
                    ))}
                  {!o.contactName && !o.contactTitle && !o.ceoName && !o.bizNo && !o.phone && "정보 없음"}
                </div>
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <button type="button" className="chip" style={{ fontSize: 12 }} onClick={() => setEditing(o)}>
                  수정
                </button>
                <button type="button" className="iconbtn" style={{ width: 34, height: 34 }} onClick={() => remove(o.id)} aria-label="삭제">
                  {I.trash?.({ width: 15, height: 15, style: { color: "var(--muted)" } }) || "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
