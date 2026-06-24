import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import {
  uploadFile,
  pickImageFile,
  pickImageFiles,
  fileToBase64,
  isPickCancelled,
  isNativeShell,
} from "../api/upload.js";
import { autoCropBusinessCard } from "../cardCrop.js";
import { normalizeImageFile, prepareImageForOcr } from "../imageFileUtils.js";
import { getClients } from "../store.js";
import ContactGroupTagPanel from "./ContactGroupTagPanel.jsx";
import { toastError, toastSuccess, notifyError } from "../toast.js";

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const MAX_CARDS = 10;

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
  const [pendingQueue, setPendingQueue] = useState([]);
  const [cards, setCards] = useState([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [ocrError, setOcrError] = useState("");
  const [saving, setSaving] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const fileRef = useRef(null);
  const pendingQueueRef = useRef([]);

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
    pendingQueueRef.current = pendingQueue;
  }, [pendingQueue]);

  useEffect(() => {
    return () => {
      pendingQueueRef.current.forEach((item) => {
        if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      });
      cards.forEach((c) => {
        if (c.preview?.startsWith("blob:")) URL.revokeObjectURL(c.preview);
      });
    };
  }, []);

  const clearPendingQueue = () => {
    pendingQueueRef.current.forEach((item) => {
      if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    });
    pendingQueueRef.current = [];
    setPendingQueue([]);
  };

  const addPendingFiles = (fileList) => {
    const raw = Array.from(fileList || []);
    const files = raw.map(normalizeImageFile).filter(Boolean);
    if (!raw.length) return;
    if (!files.length) {
      setOcrError("이미지 파일만 선택할 수 있습니다.");
      toastError("이미지 파일만 선택할 수 있습니다.");
      return;
    }
    setOcrError("");
    setPendingQueue((prev) => {
      const room = MAX_CARDS - prev.length;
      if (room <= 0) {
        toastError(`최대 ${MAX_CARDS}장까지 추가할 수 있어요`);
        return prev;
      }
      const slice = files.slice(0, room);
      if (files.length > room) toastError(`최대 ${MAX_CARDS}장 · ${room}장만 추가됐어요`);
      const next = [
        ...prev,
        ...slice.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ];
      pendingQueueRef.current = next;
      return next;
    });
  };

  const removePendingAt = (idx) => {
    setPendingQueue((prev) => {
      const item = prev[idx];
      if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      const next = prev.filter((_, i) => i !== idx);
      pendingQueueRef.current = next;
      return next;
    });
  };

  const queueCount = () => Math.max(pendingQueue.length, pendingQueueRef.current.length);

  const captureToQueue = async () => {
    if (queueCount() >= MAX_CARDS) {
      toastError(`최대 ${MAX_CARDS}장까지 촬영할 수 있어요`);
      return;
    }
    setOcrError("");
    try {
      const file = await pickImageFile(true);
      addPendingFiles([file]);
    } catch (e) {
      if (isPickCancelled(e)) return;
      const msg = e.message || "촬영 실패";
      setOcrError(msg);
      toastError(msg);
    }
  };

  const pickAlbumToQueue = async () => {
    if (ocrRunning || queueCount() >= MAX_CARDS) {
      if (queueCount() >= MAX_CARDS) toastError(`최대 ${MAX_CARDS}장까지 추가할 수 있어요`);
      return;
    }
    setOcrError("");
    try {
      const room = MAX_CARDS - queueCount();
      const files = await pickImageFiles(room);
      addPendingFiles(files);
    } catch (e) {
      if (isPickCancelled(e)) return;
      const msg = e.message || "사진 선택 실패";
      setOcrError(msg);
      toastError(msg);
    }
  };

  const ocrOneFile = async (file) => {
    const prepared = await prepareImageForOcr(file);
    const cropped = await autoCropBusinessCard(prepared);
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

  const processFiles = async (queueItems) => {
    const files = (queueItems || [])
      .map((item) => (item?.file ? normalizeImageFile(item.file) : normalizeImageFile(item)))
      .filter(Boolean)
      .slice(0, MAX_CARDS);
    if (!files.length) {
      setStep("capture");
      setOcrError("인식할 사진을 추가해주세요.");
      toastError("인식할 사진을 추가해주세요.");
      return;
    }
    setOcrError("");
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
    clearPendingQueue();
    setCards(scanned);
    setReviewIdx(0);
    setStep("review");
  };

  const startOcrFromQueue = () => {
    if (ocrRunning) return;
    const queue = pendingQueueRef.current;
    if (!queue.length) {
      setOcrError("명함 사진을 먼저 추가해주세요.");
      toastError("명함 사진을 먼저 추가해주세요.");
      return;
    }
    setOcrError("");
    setOcrRunning(true);
    setStep("scanning");
    setScanProgress({ done: 0, total: queue.length });
    processFiles(queue)
      .catch((e) => {
        setStep("capture");
        notifyError(e, e.message || "명함 인식 실패");
      })
      .finally(() => setOcrRunning(false));
  };

  const onFileInput = (e) => {
    const files = e.target.files;
    e.target.value = "";
    if (files?.length) addPendingFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) addPendingFiles(e.dataTransfer.files);
  };

  useEffect(() => {
    const onPaste = (e) => {
      if (step !== "capture") return;
      const imgs = [...e.clipboardData.items].filter((i) => i.type.startsWith("image/"));
      const files = imgs.map((i) => i.getAsFile()).filter(Boolean);
      if (files.length) addPendingFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step, pendingQueue.length]);

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
            accept="image/jpeg,image/png,image/heic,image/heif,image/*"
            multiple
            style={{ display: "none" }}
            onChange={onFileInput}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (isNativeShell() || isMobileDevice()) void pickAlbumToQueue();
              else fileRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              if (isNativeShell() || isMobileDevice()) void pickAlbumToQueue();
              else fileRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            style={{
              borderRadius: 18,
              border: "2px dashed var(--line)",
              background: "#FBFAF6",
              padding: pendingQueue.length ? "20px 16px" : "50px 20px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            {pendingQueue.length === 0 ? (
              <>
                <div style={{ display: "flex", justifyContent: "center", color: "var(--accent-deep)" }}>
                  {I.image({ width: 34, height: 34 })}
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 14 }}>명함 사진을 모아두세요</div>
                <div className="small" style={{ marginTop: 6, lineHeight: 1.5 }}>
                  여러 장 촬영 · 앨범 다중 선택 · 한 번에 OCR
                  <br />
                  사진을 추가하면 <strong style={{ color: "var(--ink)", fontWeight: 700 }}>인식 시작</strong> 버튼이 나타나요
                  {!isMobileDevice() && !isNativeShell() && (
                    <>
                      <br />
                      클릭 · 드래그 · 붙여넣기(Cmd+V)
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
                  {pendingQueue.length}장 준비됨 · 최대 {MAX_CARDS}장
                </div>
                <div className="small" style={{ marginBottom: 10, color: "var(--muted)" }}>
                  탭해서 사진 추가 · ✕로 삭제
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {pendingQueue.map((item, i) => (
                    <div key={item.previewUrl} style={{ position: "relative", aspectRatio: "3/2", borderRadius: 10, overflow: "hidden", background: "#ECE8E0" }}>
                      <img src={item.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <span
                        onClick={(e) => { e.stopPropagation(); removePendingAt(i); }}
                        style={{
                          position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%",
                          background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, display: "flex",
                          alignItems: "center", justifyContent: "center", cursor: "pointer",
                        }}
                      >✕</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            {isMobileDevice() && (
              <button
                type="button"
                className="btn"
                style={{ flex: 1, padding: 14, fontSize: 14 }}
                onClick={captureToQueue}
                disabled={pendingQueue.length >= MAX_CARDS || ocrRunning}
              >
                📷 {pendingQueue.length ? "촬영 추가" : "명함 촬영"}
              </button>
            )}
            <button
              type="button"
              className="btn"
              style={{ flex: 1, padding: 14, fontSize: 14 }}
              onClick={() => void pickAlbumToQueue()}
              disabled={pendingQueue.length >= MAX_CARDS || ocrRunning}
            >
              {pendingQueue.length ? "앨범에서 더 추가" : "앨범 선택"}
            </button>
          </div>
          {pendingQueue.length > 0 && (
            <div className="fade" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-accent"
                style={{ width: "100%", padding: 16, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={startOcrFromQueue}
                disabled={ocrRunning}
              >
                {ocrRunning ? "인식 중…" : `${pendingQueue.length}장 인식 시작`}
              </button>
              <div className="small" style={{ textAlign: "center", marginTop: 8, color: "var(--muted)", lineHeight: 1.5 }}>
                추가한 사진을 확인한 뒤 한 번에 OCR해요
              </div>
            </div>
          )}
          <button type="button" className="btn" style={{ width: "100%", padding: 14, marginTop: pendingQueue.length ? 14 : 10, fontSize: 14 }} onClick={startManual} disabled={ocrRunning}>
            명함 없이 직접 입력
          </button>
          {ocrError && (
            <div className="small" style={{ color: "var(--accent-deep)", textAlign: "center", marginTop: 10 }}>
              {ocrError}
            </div>
          )}
          {isNativeShell() && (
            <div className="small" style={{ textAlign: "center", marginTop: 8, color: "var(--muted)", lineHeight: 1.5 }}>
              앨범에서 여러 장을 한 번에 고를 수 있어요.
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
              cards.forEach((c) => {
                if (c.preview?.startsWith("blob:")) URL.revokeObjectURL(c.preview);
              });
              setCards([]);
              clearPendingQueue();
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
