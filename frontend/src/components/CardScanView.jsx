import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import {
  uploadFile,
  pickImageFile,
  pickImageFiles,
  fileToBase64,
  isPickCancelled,
} from "../api/upload.js";
import { autoCropBusinessCard } from "../cardCrop.js";
import { getClients } from "../store.js";
import ContactGroupTagPanel from "./ContactGroupTagPanel.jsx";
import { toastError, notifyError } from "../toast.js";

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const emptyFields = () => ({
  name: "",
  title: "",
  department: "",
  co: "",
  phone: "",
  email: "",
  addr: "",
});

function CardReviewFields({ fields, setField }) {
  const field = (k, label) => (
    <div style={{ marginBottom: 12 }}>
      <div className="small" style={{ fontWeight: 700, marginBottom: 5 }}>
        {label}
      </div>
      <input
        value={fields[k]}
        onChange={(e) => setField(k, e.target.value)}
        style={{
          width: "100%",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "12px 13px",
          fontFamily: "inherit",
          fontSize: 14,
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
        }}
      />
    </div>
  );
  return (
    <>
      {field("name", "이름")}
      {field("title", "직책")}
      {field("department", "부서")}
      {field("co", "회사")}
      {field("phone", "전화")}
      {field("email", "이메일")}
      {field("addr", "주소")}
      <div
        className="small"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginTop: -2,
          marginBottom: 14,
          color: "var(--accent-deep)",
        }}
      >
        주소를 위치로 변환해 ‘내 주변 거래처’에 자동 연결돼요
      </div>
    </>
  );
}

export default function CardScanView({ back, onSaved, user, onUserUpdated, contactPresets = { groups: [], tags: [] }, I }) {
  const [step, setStep] = useState("capture");
  const [cards, setCards] = useState([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [ocrError, setOcrError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const current = cards[reviewIdx];
  const setCurrentField = (k, v) => {
    setCards((prev) =>
      prev.map((c, i) => (i === reviewIdx ? { ...c, fields: { ...c.fields, [k]: v } } : c)),
    );
  };
  const setCurrentGroup = (g) => {
    setCards((prev) => prev.map((c, i) => (i === reviewIdx ? { ...c, group: g } : c)));
  };
  const setCurrentTags = (tags) => {
    setCards((prev) => prev.map((c, i) => (i === reviewIdx ? { ...c, tags } : c)));
  };

  useEffect(() => {
    return () => {
      cards.forEach((c) => {
        if (c.preview?.startsWith("blob:")) URL.revokeObjectURL(c.preview);
      });
    };
  }, []);

  const ocrOneFile = async (file) => {
    const cropped = await autoCropBusinessCard(file);
    const mime = cropped.type || "image/jpeg";
    let result;
    let cardImageKey = null;
    try {
      cardImageKey = await uploadFile(cropped);
      result = await api.ocrCard({ mediaKey: cardImageKey, mimeType: mime });
    } catch (uploadErr) {
      console.warn("upload fallback to base64 OCR", uploadErr);
      const imageBase64 = await fileToBase64(cropped);
      result = await api.ocrCard({ imageBase64, mimeType: mime });
    }
    return {
      preview: URL.createObjectURL(cropped),
      cardImageKey,
      fields: {
        name: result.name || "",
        title: result.title || "",
        department: result.department || "",
        co: result.company || "",
        phone: result.phone || "",
        email: result.email || "",
        addr: result.address || "",
      },
      group: "미분류",
      tags: [],
      warn: !result.name && !result.company,
    };
  };

  const processFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f?.type?.startsWith("image/")).slice(0, 10);
    if (!files.length) {
      setOcrError("이미지 파일만 선택할 수 있습니다.");
      return;
    }
    setOcrError("");
    setStep("scanning");
    setScanProgress({ done: 0, total: files.length });
    const scanned = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const card = await ocrOneFile(files[i]);
        scanned.push(card);
      } catch (e) {
        scanned.push({
          preview: URL.createObjectURL(files[i]),
          cardImageKey: null,
          fields: emptyFields(),
          group: "미분류",
          tags: [],
          error: e.message || "OCR 실패",
        });
      }
      setScanProgress({ done: i + 1, total: files.length });
    }
    setCards(scanned);
    setReviewIdx(0);
    setStep("review");
  };

  const pickFromDialog = async (capture = false, multiple = false) => {
    setOcrError("");
    try {
      if (multiple) {
        const files = await pickImageFiles(10);
        await processFiles(files);
      } else {
        const file = await pickImageFile(capture);
        await processFiles([file]);
      }
    } catch (e) {
      if (isPickCancelled(e)) return;
      const msg = e.message || "파일 선택 실패";
      setOcrError(msg);
      toastError(msg);
    }
  };

  const onFileInput = (e) => {
    const files = e.target.files;
    e.target.value = "";
    if (files?.length) processFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  useEffect(() => {
    const onPaste = (e) => {
      if (step !== "capture") return;
      const imgs = [...e.clipboardData.items].filter((i) => i.type.startsWith("image/"));
      const files = imgs.map((i) => i.getAsFile()).filter(Boolean);
      if (files.length) processFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step]);

  const startManual = () => {
    setOcrError("");
    setCards([
      {
        preview: null,
        cardImageKey: null,
        fields: emptyFields(),
        group: "미분류",
        tags: [],
      },
    ]);
    setReviewIdx(0);
    setStep("review");
  };

  const saveAll = async () => {
    setSaving(true);
    let linked = 0;
    try {
      for (const card of cards) {
        const f = card.fields;
        const res = await api.createContact({
          person: f.name.trim() || f.co.trim() || "이름 없음",
          title: f.title.trim() || null,
          department: f.department.trim() || null,
          company: f.co,
          phone: f.phone,
          email: f.email,
          address: f.addr,
          group: card.group === "미분류" ? null : card.group,
          tags: card.tags,
          cardImageKey: card.cardImageKey,
        });
        if (res.linkedCount > 1) linked++;
      }
      onSaved?.();
      if (linked > 0) toastSuccess(`동일 연락처 ${linked}건 — 다른 소속으로 묶였어요`);
      setStep("done");
      setTimeout(back, 1100);
    } catch (e) {
      notifyError(e, e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button className="iconbtn" onClick={back}>
          {I.back({})}
        </button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>
          명함 스캔
        </div>
        <div style={{ width: 42 }} />
      </div>

      {step === "capture" && (
        <div className="pad fade" style={{ marginTop: 10 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={onFileInput}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            style={{
              borderRadius: 18,
              border: "2px dashed var(--line)",
              background: "#FBFAF6",
              padding: "50px 20px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", color: "var(--accent-deep)" }}>
              {I.image({ width: 34, height: 34 })}
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, marginTop: 14 }}>명함 사진을 올려주세요</div>
            <div className="small" style={{ marginTop: 6, lineHeight: 1.5 }}>
              여러 장 한 번에 · 자동 크롭 · OCR
              <br />
              클릭 · 드래그 · 붙여넣기(Cmd+V)
            </div>
          </div>
          <button
            className="btn btn-accent"
            style={{ width: "100%", padding: 16, marginTop: 16, fontSize: 15 }}
            onClick={() => pickFromDialog(false, true)}
          >
            여러 장 선택 (최대 10)
          </button>
          <button
            className="btn"
            style={{ width: "100%", padding: 14, marginTop: 10, fontSize: 14 }}
            onClick={() => pickFromDialog(false, false)}
          >
            한 장 선택
          </button>
          {isMobileDevice() && (
            <button
              className="btn"
              style={{ width: "100%", padding: 14, marginTop: 10, fontSize: 14 }}
              onClick={() => pickFromDialog(true, false)}
            >
              카메라로 촬영
            </button>
          )}
          <button className="btn" style={{ width: "100%", padding: 14, marginTop: 10, fontSize: 14 }} onClick={startManual}>
            명함 없이 직접 입력
          </button>
          {ocrError && (
            <div className="small" style={{ color: "var(--accent-deep)", textAlign: "center", marginTop: 10 }}>
              {ocrError}
            </div>
          )}
          <div className="small" style={{ textAlign: "center", marginTop: 12 }}>
            <span className="tag green" style={{ fontSize: 11 }}>
              무제한 무료
            </span>{" "}
            명함 스캔 · 배경 자동 제거
          </div>
        </div>
      )}

      {step === "scanning" && (
        <div className="fade" style={{ padding: "110px 30px", textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
          <div style={{ marginTop: 22, fontWeight: 700, fontSize: 17 }}>
            명함 인식 중… ({scanProgress.done}/{scanProgress.total})
          </div>
          <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
            크롭 · OCR · 연락처 분류
          </div>
        </div>
      )}

      {step === "review" && current && (
        <div className="pad fade" style={{ marginTop: 10, marginBottom: 12 }}>
          {cards.length > 1 && (
            <div className="row between" style={{ marginBottom: 12, gap: 8 }}>
              <button
                type="button"
                className="chip"
                disabled={reviewIdx <= 0}
                onClick={() => setReviewIdx((i) => Math.max(0, i - 1))}
              >
                ← 이전
              </button>
              <div className="small" style={{ fontWeight: 700 }}>
                {reviewIdx + 1} / {cards.length}
              </div>
              <button
                type="button"
                className="chip"
                disabled={reviewIdx >= cards.length - 1}
                onClick={() => setReviewIdx((i) => Math.min(cards.length - 1, i + 1))}
              >
                다음 →
              </button>
            </div>
          )}
          {current.preview && (
            <div style={{ marginBottom: 14, borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}>
              <img src={current.preview} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "contain", background: "#f5f5f5" }} />
            </div>
          )}
          <div
            className="card row"
            style={{
              padding: 12,
              gap: 12,
              marginBottom: 14,
              background: current.error ? "#FFF8F6" : "var(--green-soft)",
              border: current.error ? "1px solid #F3D8CB" : "1px solid #CDE5D6",
            }}
          >
            <span style={{ color: current.error ? "var(--accent-deep)" : "var(--green)" }}>{I.check({})}</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: current.error ? "var(--accent-deep)" : "var(--green)" }}>
              {current.error || current.warn ? "내용을 확인하고 저장하세요" : "인식 완료 · 저장 전 확인"}
            </div>
          </div>
          <CardReviewFields fields={current.fields} setField={setCurrentField} />
          <ContactGroupTagPanel
            user={user}
            onUserUpdated={onUserUpdated}
            contactPresets={contactPresets}
            contacts={getClients()}
            group={current.group}
            tags={current.tags}
            onGroupChange={setCurrentGroup}
            onTagsChange={setCurrentTags}
          />
          <button
            className="btn btn-accent"
            style={{ width: "100%", padding: 16, fontSize: 15 }}
            onClick={saveAll}
            disabled={saving}
          >
            {saving ? "저장 중…" : cards.length > 1 ? `${cards.length}명 모두 저장` : "연락처로 저장"}
          </button>
          <button
            className="btn"
            style={{ width: "100%", padding: 12, marginTop: 8, background: "transparent", color: "var(--muted)" }}
            onClick={() => {
              setCards([]);
              setStep("capture");
            }}
          >
            다시 촬영
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="fade" style={{ padding: "110px 30px", textAlign: "center" }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "var(--green-soft)",
              color: "var(--green)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            {I.check({ width: 28, height: 28 })}
          </div>
          <div style={{ marginTop: 18, fontWeight: 800, fontSize: 18 }}>저장 완료</div>
          <div className="small" style={{ marginTop: 8 }}>
            {cards.length}명 등록
          </div>
        </div>
      )}
    </div>
  );
}
