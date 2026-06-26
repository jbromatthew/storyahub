import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { mediaUrl } from "../api/upload.js";
import { fileKindFromName } from "../fileUtils.js";
import { notifyError } from "../toast.js";

const sheetTableCss = `
.file-viewer-sheet table {
  border-collapse: collapse;
  background: #fff;
  color: #111;
  font-size: 13px;
  min-width: max-content;
  width: max-content;
}
.file-viewer-sheet td, .file-viewer-sheet th {
  border: 1px solid #d0d7de;
  padding: 7px 11px;
  white-space: nowrap;
  background: #fff;
  color: #111;
  vertical-align: middle;
}
.file-viewer-sheet th {
  background: #f6f8fa;
  font-weight: 700;
  position: sticky;
  top: 0;
  z-index: 1;
}
.file-viewer-sheet tr:nth-child(even) td { background: #fbfcfd; }
`;

function SheetPreview({ blob, activeSheet, onSheets }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const buf = await blob.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const names = wb.SheetNames || [];
        onSheets?.(names);
        const sheetName = activeSheet && names.includes(activeSheet) ? activeSheet : names[0];
        if (!sheetName) {
          if (alive) setErr("시트가 비어 있어요");
          return;
        }
        const sheet = wb.Sheets[sheetName];
        const tableHtml = XLSX.utils.sheet_to_html(sheet, { editable: false });
        if (alive) setHtml(tableHtml);
      } catch (e) {
        if (alive) setErr(e?.message || "엑셀을 불러오지 못했어요");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [blob, activeSheet, onSheets]);

  if (loading) return <div className="small" style={{ padding: 40, textAlign: "center" }}>엑셀 불러오는 중…</div>;
  if (err) return <div className="small" style={{ padding: 40, textAlign: "center", color: "var(--accent-deep)" }}>{err}</div>;
  return (
    <>
      <style>{sheetTableCss}</style>
      <div className="file-viewer-sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

export default function FileViewerOverlay({ file, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState("");

  const name = file?.name || "첨부파일";
  const kind = fileKindFromName(name, file?.mime || "");

  useEffect(() => {
    if (!file) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [file]);

  useEffect(() => {
    if (!file?.mediaKey) return;
    let alive = true;
    let localUrl = null;
    setLoading(true);
    setErr("");
    setBlobUrl(null);
    setBlob(null);
    setSheetNames([]);
    setActiveSheet("");

    (async () => {
      try {
        let b = null;
        try {
          const url = await mediaUrl(file.mediaKey);
          localUrl = url;
          const res = await fetch(url);
          b = await res.blob();
        } catch {
          const { url } = await api.getUploadUrl(file.mediaKey);
          const res = await fetch(url);
          b = await res.blob();
          localUrl = URL.createObjectURL(b);
        }
        if (!alive) return;
        setBlob(b);
        setBlobUrl(localUrl);
      } catch (e) {
        if (alive) setErr(e?.message || "파일을 불러오지 못했어요");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (localUrl?.startsWith("blob:")) URL.revokeObjectURL(localUrl);
    };
  }, [file?.mediaKey]);

  const onSheets = useCallback((names) => {
    setSheetNames(names);
    setActiveSheet((cur) => (cur && names.includes(cur) ? cur : names[0] || ""));
  }, []);

  const download = async () => {
    try {
      const href = blobUrl || (await mediaUrl(file.mediaKey));
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
    } catch (e) {
      notifyError(e, "다운로드 실패");
    }
  };

  const openExternal = async () => {
    try {
      const { url } = await api.getUploadUrl(file.mediaKey);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      notifyError(e, "외부에서 열기 실패");
    }
  };

  if (!file) return null;

  let body = null;
  if (loading) {
    body = <div className="small" style={{ padding: 48, textAlign: "center" }}>불러오는 중…</div>;
  } else if (err) {
    body = (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div className="small" style={{ color: "var(--accent-deep)", lineHeight: 1.6 }}>{err}</div>
        <button type="button" className="chip" style={{ marginTop: 14, color: "var(--accent-deep)" }} onClick={openExternal}>
          다른 앱에서 열기
        </button>
      </div>
    );
  } else if (kind === "image" && blobUrl) {
    body = (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh", padding: 16, background: "#fff", borderRadius: 12 }}>
        <img src={blobUrl} alt={name} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain" }} />
      </div>
    );
  } else if (kind === "pdf" && blobUrl) {
    body = (
      <iframe title={name} src={blobUrl} style={{ width: "100%", height: "72vh", border: "none", background: "#fff", borderRadius: 12 }} />
    );
  } else if (kind === "sheet" && blob) {
    body = (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--line)",
          padding: 8,
          overflow: "hidden",
        }}
      >
        {sheetNames.length > 1 && (
          <div className="row" style={{ gap: 6, padding: "4px 4px 10px", flexWrap: "wrap", flexShrink: 0 }}>
            {sheetNames.map((sn) => (
              <button key={sn} type="button" className={`chip${activeSheet === sn ? " on" : ""}`} onClick={() => setActiveSheet(sn)}>
                {sn}
              </button>
            ))}
          </div>
        )}
        <div
          className="file-viewer-sheet-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x pan-y",
            overscrollBehavior: "contain",
          }}
        >
          <SheetPreview blob={blob} activeSheet={activeSheet} onSheets={onSheets} />
        </div>
      </div>
    );
  } else {
    body = (
      <div style={{ padding: 32, textAlign: "center", lineHeight: 1.6, background: "#fff", borderRadius: 12 }}>
        <div className="small">미리보기를 지원하지 않는 형식이에요.</div>
        <button type="button" className="btn btn-accent" style={{ marginTop: 16, padding: "12px 18px" }} onClick={download}>
          다운로드
        </button>
        <button type="button" className="chip" style={{ marginTop: 10, color: "var(--accent-deep)" }} onClick={openExternal}>
          다른 앱에서 열기
        </button>
      </div>
    );
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 12000, background: "rgba(28,26,22,.45)" }}
      onClick={onClose}
    >
      <div
        className="fade"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--paper, #FBF9F4)",
          maxWidth: 720,
          margin: "0 auto",
          boxShadow: "0 0 0 1px var(--line)",
          height: "100dvh",
          maxHeight: "100dvh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "#fff", flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div className="small">{kind === "sheet" ? "엑셀 미리보기" : kind === "pdf" ? "PDF 미리보기" : "파일 미리보기"}</div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <button type="button" className="chip" style={{ fontSize: 12 }} onClick={download}>
              ↓ 저장
            </button>
            <button type="button" className="iconbtn" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: kind === "sheet" ? "hidden" : "auto",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding: 16,
            background: "#F3F0E8",
          }}
        >
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
}
