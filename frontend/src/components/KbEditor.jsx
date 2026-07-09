import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { confirmDelete } from "../confirmDelete.js";
import { uploadFile, pickImageFile, pickAnyFile, mediaUrl, openMediaFile, isPickCancelled } from "../api/upload.js";
import { fileNameFromKey } from "../fileUtils.js";
import { KB_SECTIONS, kbSectionLabel, kbCoverKey } from "../mappers.js";
import { kbPresets, tagColor, mergePreferencesRaw } from "../preferences.js";
import { notifyError, toastSuccess } from "../toast.js";
import { confirmAction } from "../confirm.js";
import {
  getCaretOffset,
  insertTextAtCaret,
  normalizePlainText,
  parseClipboardToBlocks,
  setCaretAt,
  stripLeadingBulletMarker,
} from "../kbPaste.js";
import {
  applyInlineFormat,
  hasInlineHtml,
  readEditableHtml,
  richToText,
  sanitizeInline,
  seedEditable,
} from "../kbRich.js";

export const BLOCK_TYPES = [
  { type: "text", label: "텍스트", desc: "일반 문단", slash: "텍스트", ic: "¶" },
  { type: "h1", label: "제목 1", desc: "가장 큰 제목", slash: "제목1", ic: "H₁" },
  { type: "h2", label: "제목 2", desc: "중간 제목", slash: "제목2", ic: "H₂" },
  { type: "h3", label: "제목 3", desc: "작은 제목", slash: "제목3", ic: "H₃" },
  { type: "toggle", label: "토글", desc: "접었다 펴는 블록", slash: "토글", ic: "▸" },
  { type: "todo", label: "체크리스트", desc: "할 일 목록", slash: "체크", ic: "☑" },
  { type: "bullet", label: "불릿 목록", desc: "순서 없는 목록", slash: "목록", ic: "•" },
  { type: "quote", label: "콜아웃", desc: "강조 박스", slash: "인용", ic: "❝" },
  { type: "image", label: "이미지", desc: "사진 · 슬라이드", slash: "이미지", ic: "🖼" },
  { type: "file", label: "파일", desc: "PDF · 영상", slash: "파일", ic: "📎" },
  { type: "table", label: "표", desc: "간단한 표", slash: "표", ic: "▦" },
  { type: "code", label: "코드", desc: "코드 블록", slash: "코드", ic: "</>" },
  { type: "divider", label: "구분선", desc: "섹션 구분", slash: "구분", ic: "—" },
];

// 텍스트 입력 커서를 바로 두는 블록(입력형)
const TEXT_INSERT_TYPES = new Set(["text", "h", "quote", "toggle", "bullet", "todo", "code"]);

function defaultBlock(type) {
  switch (type) {
    case "h1":
      return { type: "h", level: 1, val: "" };
    case "h2":
      return { type: "h", level: 2, val: "" };
    case "h3":
      return { type: "h", level: 3, val: "" };
    case "h":
      return { type: "h", level: 2, val: "" };
    case "toggle":
      return { type: "toggle", val: "", body: "", open: true };
    case "file":
      return { type, name: "파일 추가", meta: "탭하여 업로드", kind: "pdf" };
    case "image":
      return { type };
    case "todo":
      return { type, done: false, val: "" };
    case "table":
      return { type, rows: [["열1", "열2"], ["", ""]] };
    default:
      return { type, val: "" };
  }
}

function blockText(b) {
  if (b.type === "table" && b.rows) return b.rows.flat().map(richToText).join(" ");
  const val = richToText(b.val || "");
  const body = b.type === "toggle" ? " " + richToText(b.body || "") : "";
  if (val || body) return (val + body).trim();
  if (b.name) return b.name;
  return "";
}

function fileKind(mime, name = "") {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  if (/\.pdf$/i.test(name) || mime === "application/pdf") return "pdf";
  if (/\.(doc|docx)$/i.test(name)) return "doc";
  if (/\.(xls|xlsx)$/i.test(name)) return "sheet";
  return "file";
}

const FILE_ICONS = { image: "🖼", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘", sheet: "📗", file: "📄" };
const FILE_COLORS = { image: "#5C6BC0", video: "#5B6B8C", audio: "#7C5CB8", pdf: "#C2491F", doc: "#2563EB", sheet: "#059669", file: "#8B7355" };

// 페이지 아이콘용 이모지
const PAGE_EMOJIS = [
  "📄", "📝", "📚", "📖", "📔", "🧠", "💡", "🎯", "🔖", "🗂",
  "📊", "📈", "💰", "🧩", "⚙️", "🚀", "🔥", "⭐", "✅", "📌",
  "🎤", "🎓", "🏢", "🤝", "💬", "🗓", "🔬", "🧪", "🌱", "☕",
];

function EmojiPicker({ current, onPick, onClear, onClose }) {
  return (
    <>
      <div className="kbe-emoji-back" onClick={onClose} />
      <div className="kbe-emoji-pop card">
        <div className="kbe-emoji-grid">
          {PAGE_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              className={"kbe-emoji" + (current === em ? " on" : "")}
              onClick={() => { onPick(em); onClose(); }}
            >
              {em}
            </button>
          ))}
        </div>
        {current && (
          <button type="button" className="kbe-emoji-clear" onClick={() => { onClear(); onClose(); }}>
            아이콘 제거
          </button>
        )}
      </div>
    </>
  );
}

function Checkbox({ on }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: on ? "none" : "2px solid var(--line)",
        background: on ? "var(--green)" : "transparent",
        color: "#fff",
        fontSize: 12,
      }}
    >
      {on && "✓"}
    </span>
  );
}

function AddBlockMenu({ onPick, onClose }) {
  return (
    <div
      className="card addmenu"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        zIndex: 25,
        marginTop: 6,
        padding: "6px 10px",
        boxShadow: "0 8px 24px rgba(0,0,0,.12)",
      }}
    >
      {BLOCK_TYPES.map((bt) => (
        <div
          key={bt.type}
          className="mi"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(bt.type);
            onClose();
          }}
        >
          <div className="mi-ic" style={{ fontSize: 16 }}>{bt.ic}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{bt.label}</div>
            <div className="small">{bt.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function KbFileRow({ block, onClick }) {
  const [opening, setOpening] = useState(false);
  const kind = block.kind || fileKind(block.mime, block.name);
  const handleOpen = async () => {
    if (onClick) {
      onClick();
      return;
    }
    if (!block.mediaKey || opening) return;
    setOpening(true);
    try {
      await openMediaFile(block.mediaKey, block.name || fileNameFromKey(block.mediaKey));
    } catch (err) {
      notifyError(err, err.message || "파일을 열 수 없습니다");
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="fileblk" style={{ cursor: block.mediaKey ? "pointer" : "default" }} onClick={handleOpen}>
      <div className="fileic" style={{ background: FILE_COLORS[kind] || FILE_COLORS.file }}>{FILE_ICONS[kind] || "📄"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.name || "첨부파일"}</div>
        <div className="small">{block.meta || (opening ? "여는 중…" : block.mediaKey ? "탭해서 열기" : "…")}</div>
      </div>
    </div>
  );
}

function SlashMenu({ filter, onPick, onClose }) {
  const q = (filter || "").toLowerCase();
  const items = BLOCK_TYPES.filter(
    (b) => !q || b.label.includes(q) || b.slash.includes(q) || b.type.includes(q)
  );
  return (
    <div
      className="card"
      style={{
        position: "absolute",
        left: 0,
        top: "100%",
        zIndex: 20,
        width: "min(280px, 90vw)",
        padding: "4px 0",
        marginTop: 4,
        boxShadow: "0 8px 24px rgba(0,0,0,.12)",
      }}
    >
      {items.map((bt) => (
        <div
          key={bt.type}
          className="mi"
          style={{ padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 11 }}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(bt.type);
            onClose();
          }}
        >
          <span className="kbe-slash-ic">{bt.ic}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{bt.label}</div>
            <div className="small">{bt.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const RTB_BUTTONS = [
  { kind: "bold", label: "B", title: "굵게", style: { fontWeight: 800 } },
  { kind: "italic", label: "i", title: "기울임", style: { fontStyle: "italic", fontFamily: "Georgia,serif" } },
  { kind: "underline", label: "U", title: "밑줄", style: { textDecoration: "underline" } },
  { kind: "strike", label: "S", title: "취소선", style: { textDecoration: "line-through" } },
  { kind: "highlight", label: "🖊", title: "형광펜" },
  { kind: "code", label: "</>", title: "인라인 코드", style: { fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12 } },
  { kind: "link", label: "🔗", title: "링크" },
];

/** 텍스트 선택 시 위에 뜨는 인라인 서식 툴바 */
function RichToolbar({ onApply }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setPos(null); return; }
      const anchor = sel.anchorNode;
      const host = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
      const el = host?.closest?.("[data-kbrich]");
      if (!el) { setPos(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { setPos(null); return; }
      setPos({ top: rect.top, left: rect.left + rect.width / 2, el, idx: Number(el.getAttribute("data-idx")) });
    };
    const onSel = () => window.requestAnimationFrame(update);
    document.addEventListener("selectionchange", onSel);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!pos) return null;
  const act = (kind) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    applyInlineFormat(pos.el, kind);
    onApply(pos.idx, readEditableHtml(pos.el));
  };
  return createPortal(
    <div
      className="kbe-rtb"
      style={{ position: "fixed", top: Math.max(8, pos.top - 48), left: pos.left, transform: "translateX(-50%)", zIndex: 60 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {RTB_BUTTONS.map((btn) => (
        <button key={btn.kind} type="button" className="kbe-rtb-btn" title={btn.title} style={btn.style} onMouseDown={act(btn.kind)}>
          {btn.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function BlockRow({
  b,
  i,
  focused,
  imageUrls,
  onFocus,
  onChange,
  onKeyDown,
  onDelete,
  onMove,
  onUpload,
  onToggleTodo,
  onTableChange,
  onPaste,
  onUnlist,
}) {
  const editableTypes = ["text", "h", "quote", "bullet", "todo", "code"];
  const isEditable = editableTypes.includes(b.type);
  const hLevel = b.type === "h" ? b.level || 2 : 0;
  const ph =
    b.type === "h"
      ? hLevel === 1 ? "제목 1" : hLevel === 3 ? "제목 3" : "제목 2"
      : b.type === "todo"
        ? "할 일"
        : b.type === "bullet"
          ? "목록 항목"
          : b.type === "quote"
            ? "인용구"
            : b.type === "code"
              ? "// 코드"
              : b.type === "toggle"
                ? "토글 제목"
                : "내용을 입력하거나 '/' 로 블록 추가";

  const styleFor = () => {
    if (b.type === "h") {
      const size = hLevel === 1 ? 27 : hLevel === 3 ? 18 : 21;
      return { fontWeight: 700, fontSize: size, lineHeight: 1.35, letterSpacing: "-.02em", padding: hLevel === 1 ? "22px 0 4px" : "16px 0 4px", color: "var(--kb-ink,#1A1A1A)" };
    }
    if (b.type === "quote")
      return {
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.65,
        color: "#4A4A4A",
        borderLeft: "3px solid var(--kb-accent,#B7975A)",
        background: "var(--kb-callout,#F7F6F3)",
        borderRadius: "2px 10px 10px 2px",
        padding: "14px 16px",
      };
    if (b.type === "code")
      return {
        background: "#F5F4F1",
        color: "#37352F",
        borderRadius: 8,
        padding: 14,
        fontSize: 13,
        fontFamily: "ui-monospace,Menlo,monospace",
        whiteSpace: "pre-wrap",
        border: "1px solid #E7E5E0",
      };
    return { fontSize: 16, lineHeight: 1.75, color: "var(--kb-body,#37352F)", padding: "3px 0" };
  };

  const editableRef = useRef(null);
  const wasFocused = useRef(false);

  useLayoutEffect(() => {
    if (focused && !wasFocused.current && editableRef.current) {
      editableRef.current.focus();
    }
    wasFocused.current = focused;
  }, [focused]);

  const makeBind = (field, primary) => (el) => {
    if (primary) editableRef.current = el;
    if (el && document.activeElement !== el) {
      if (field === "body") { if (el.innerText !== (b[field] || "")) el.innerText = b[field] || ""; }
      else seedEditable(el, b[field] || "");
    }
  };

  const richEditable = (extraStyle, opts = {}) => (
    <div
      className="editable"
      contentEditable
      suppressContentEditableWarning
      data-kbrich
      data-idx={i}
      data-field="val"
      data-ph={ph}
      style={{ ...styleFor(), ...extraStyle }}
      onFocus={() => onFocus(i)}
      onInput={(e) => onChange(i, { val: readEditableHtml(e.currentTarget) })}
      onPaste={(e) => onPaste?.(e, i)}
      onKeyDown={(e) => onKeyDown(e, i)}
      ref={makeBind("val", true)}
      {...opts}
    />
  );

  return (
    <div className="blk">
      <div>
      {b.type === "divider" && <div className="kbe-divider-line" />}

      {b.type === "bullet" && (
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <span
            role="button"
            tabIndex={0}
            title="목록 해제"
            aria-label="목록 해제"
            style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--kb-body,#37352F)", marginTop: 12, flexShrink: 0, cursor: "pointer" }}
            onClick={() => onUnlist?.(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onUnlist?.(i);
              }
            }}
          />
          {richEditable({ flex: 1 })}
        </div>
      )}

      {b.type === "todo" && (
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <span style={{ marginTop: 2, cursor: "pointer" }} onClick={() => onToggleTodo(i)}>
            <Checkbox on={b.done} />
          </span>
          {richEditable({
            flex: 1,
            textDecoration: b.done ? "line-through" : "none",
            color: b.done ? "var(--muted)" : "var(--kb-body,#37352F)",
          })}
        </div>
      )}

      {b.type === "toggle" && (
        <div className="kbe-toggle">
          <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
            <button
              type="button"
              className={"kbe-toggle-caret" + (b.open ? " open" : "")}
              aria-label={b.open ? "접기" : "펼치기"}
              onClick={() => onChange(i, { open: !b.open })}
            >
              ▸
            </button>
            {richEditable({ flex: 1, fontWeight: 600 })}
          </div>
          {b.open && (
            <div
              className="editable kbe-toggle-body"
              contentEditable
              suppressContentEditableWarning
              data-ph="토글 안 내용"
              onFocus={() => onFocus(i)}
              onInput={(e) => onChange(i, { body: e.currentTarget.innerText })}
              onPaste={(e) => {
                e.preventDefault();
                const text = normalizePlainText(e.clipboardData?.getData("text/plain") || "");
                insertTextAtCaret(e.currentTarget, text);
                onChange(i, { body: e.currentTarget.innerText });
              }}
              ref={makeBind("body", false)}
            />
          )}
        </div>
      )}

      {isEditable && b.type !== "bullet" && b.type !== "todo" && richEditable()}

      {b.type === "table" && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", fontSize: 13 }}>
          {(b.rows || [["", ""]]).map((row, ri) => (
            <div key={ri} className="row" style={{ borderBottom: ri < b.rows.length - 1 ? "1px solid var(--line)" : "none" }}>
              {row.map((cell, ci) => (
                <div
                  key={ci}
                  className="editable"
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontWeight: ri === 0 ? 700 : 500,
                    background: ri === 0 ? "#F4F1EA" : "#fff",
                    borderRight: ci < row.length - 1 ? "1px solid var(--line)" : "none",
                    outline: "none",
                    minHeight: 20,
                  }}
                  onInput={(e) => {
                    const rows = (b.rows || []).map((r) => [...r]);
                    rows[ri][ci] = e.currentTarget.innerText;
                    onTableChange(i, rows);
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = normalizePlainText(e.clipboardData?.getData("text/plain") || "").replace(/\n+/g, " ");
                    insertTextAtCaret(e.currentTarget, text);
                    const rows = (b.rows || []).map((r) => [...r]);
                    rows[ri][ci] = e.currentTarget.innerText;
                    onTableChange(i, rows);
                  }}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="chip"
            style={{ margin: 8, fontSize: 12 }}
            onClick={() => {
              const cols = b.rows?.[0]?.length || 2;
              onTableChange(i, [...(b.rows || []), Array(cols).fill("")]);
            }}
          >
            + 행 추가
          </button>
        </div>
      )}

      {b.type === "image" && (
        <div className="imgblk" style={{ cursor: "pointer", padding: b.mediaKey ? 0 : 20, border: b.mediaKey ? "none" : "1px dashed #DADCE0", borderRadius: 8, background: b.mediaKey ? "transparent" : "#FAFAFA" }} onClick={() => onUpload(i, "image")}>
          {imageUrls[b.mediaKey] ? (
            <img src={imageUrls[b.mediaKey]} alt="" style={{ maxWidth: "100%", borderRadius: 8, display: "block", margin: "8px 0" }} />
          ) : (
            <div style={{ fontSize: 24, color: "#888" }}>🖼</div>
          )}
          {!b.mediaKey && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: "#666" }}>사진 추가</div>
              <div className="small" style={{ marginTop: 4, color: "#AAA" }}>PNG, JPG, WEBP</div>
            </>
          )}
        </div>
      )}

      {b.type === "file" && (
        <div onClick={() => onUpload(i, "file")} style={{ cursor: "pointer" }}>
          {b.mediaKey ? (
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <KbFileRow block={b} />
              </div>
              <button type="button" className="chip" style={{ flex: "0 0 auto", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onUpload(i, "file"); }}>
                변경
              </button>
            </div>
          ) : (
            <div className="fileblk" style={{ cursor: "pointer" }}>
              <div className="fileic" style={{ background: "var(--accent-deep)" }}>📎</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>파일 첨부</div>
                <div className="small">PDF · 엑셀 · 영상 · 기타</div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// 블록 삽입 팝오버 — 전체 블록 타입 노출
const INSERT_MENU = BLOCK_TYPES;

const TOOLBAR_ITEMS = [
  { type: "image", ic: "🖼", label: "사진" },
  { type: "file", ic: "📎", label: "파일" },
  { type: "h2", ic: "H", label: "제목" },
  { type: "toggle", ic: "▸", label: "토글" },
  { type: "todo", ic: "☑", label: "체크" },
  { type: "bullet", ic: "•", label: "목록" },
  { type: "quote", ic: "❝", label: "인용" },
  { type: "table", ic: "▦", label: "표" },
  { type: "code", ic: "</>", label: "코드" },
  { type: "divider", ic: "—", label: "구분선" },
  { type: "text", ic: "¶", label: "본문" },
];

function BookSearchSheet({ onClose, onPick }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [isEnd, setIsEnd] = useState(true);
  const [picking, setPicking] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setItems([]);
      setIsEnd(true);
      return;
    }
    const t = window.setTimeout(() => {
      setLoading(true);
      api
        .searchBooks(term, { page: 1, size: 12 })
        .then((r) => {
          setItems(r.items || []);
          setIsEnd(r.isEnd);
          setPage(1);
        })
        .catch((e) => {
          notifyError(e, "책 검색 실패");
          setItems([]);
        })
        .finally(() => setLoading(false));
    }, 320);
    return () => window.clearTimeout(t);
  }, [query]);

  const submit = (e) => {
    e?.preventDefault();
    setQuery(q.trim());
  };

  const loadMore = async () => {
    if (loading || isEnd || !query.trim()) return;
    setLoading(true);
    try {
      const r = await api.searchBooks(query.trim(), { page: page + 1, size: 12 });
      setItems((p) => [...p, ...(r.items || [])]);
      setIsEnd(r.isEnd);
      setPage((p) => p + 1);
    } catch (e) {
      notifyError(e, "책 검색 실패");
    } finally {
      setLoading(false);
    }
  };

  const pick = async (book) => {
    setPicking(book.title);
    try {
      await onPick(book);
      onClose();
    } catch (e) {
      notifyError(e, "책 불러오기 실패");
    } finally {
      setPicking("");
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 8000,
        background: "rgba(20,16,12,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, calc(100% - 32px))",
          maxHeight: "min(78vh, 620px)",
          minHeight: 320,
          background: "#fff",
          borderRadius: 18,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(20,16,12,.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line)" }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>책 검색</div>
            <button type="button" className="iconbtn" onClick={onClose} aria-label="닫기">✕</button>
          </div>
          <form onSubmit={submit} className="row" style={{ gap: 8 }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목 · 저자 · ISBN"
              style={{
                flex: 1,
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "12px 13px",
                fontFamily: "inherit",
                fontSize: 14,
                outline: "none",
              }}
            />
            <button type="submit" className="btn btn-accent" style={{ padding: "12px 16px", flexShrink: 0 }}>
              검색
            </button>
          </form>
          <div className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>
            카카오 다음 도서 검색 · 표지·저자 정보를 자동으로 채워요
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 16px" }}>
          {!query.trim() && (
            <div className="small" style={{ textAlign: "center", padding: "36px 12px", lineHeight: 1.55 }}>
              읽은 책 제목이나 저자를 검색해 보세요
            </div>
          )}
          {query.trim() && !loading && items.length === 0 && (
            <div className="small" style={{ textAlign: "center", padding: "36px 12px" }}>
              “{query}” 검색 결과가 없어요
            </div>
          )}
          {items.map((book) => (
            <button
              key={`${book.isbn || book.title}-${book.url}`}
              type="button"
              disabled={!!picking}
              onClick={() => pick(book)}
              style={{
                width: "100%",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                textAlign: "left",
                padding: "12px 10px",
                border: "none",
                borderBottom: "1px solid var(--line)",
                background: picking === book.title ? "#FFF8F6" : "transparent",
                cursor: picking ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 72,
                  flexShrink: 0,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#F4F1EA",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                {book.thumbnail ? (
                  <img src={book.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "📚"
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{book.title}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  {[book.authors?.join(", "), book.publisher].filter(Boolean).join(" · ")}
                </div>
                {book.isbn && <div className="small" style={{ marginTop: 2, opacity: 0.75 }}>ISBN {book.isbn}</div>}
              </div>
              <span style={{ color: "var(--muted)", flexShrink: 0, marginTop: 4 }}>
                {picking === book.title ? "…" : "선택"}
              </span>
            </button>
          ))}
          {items.length > 0 && !isEnd && (
            <button
              type="button"
              className="chip"
              style={{ display: "block", width: "100%", marginTop: 12, padding: 12 }}
              disabled={loading}
              onClick={loadMore}
            >
              {loading ? "불러오는 중…" : "더 보기"}
            </button>
          )}
          {loading && items.length === 0 && (
            <div className="small" style={{ textAlign: "center", padding: "28px 0" }}>검색 중…</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function parseArticleBlocks(article) {
  const raw = article?.blocks || [];
  const cover = raw.find((b) => b.type === "cover");
  const iconBlock = raw.find((b) => b.type === "icon");
  const blocks = raw.filter((b) => b.type !== "cover" && b.type !== "icon");
  const section = article?.section || "knowledge";
  const defaultBlocks =
    section === "book"
      ? [
          { type: "h", val: "독후감" },
          { type: "text", val: "" },
        ]
      : section === "lecture"
        ? [
            { type: "h", val: "강연 정리" },
            { type: "text", val: "" },
          ]
        : [{ type: "text", val: "" }];
  return {
    coverKey: cover?.mediaKey || article?.bookMeta?.coverKey || null,
    icon: iconBlock?.emoji || "",
    blocks: blocks.length ? blocks : defaultBlocks,
  };
}

function KbCategoryBar({ section, cat, setCat, prefs, onUserUpdated, onDirty, extraCategories = [] }) {
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const presetCategories = kbPresets(prefs, section).categories;
  const categories = [
    ...new Set([...presetCategories, ...extraCategories.filter((c) => c && c !== "미분류")]),
  ];

  useEffect(() => {
    setEditing(false);
    setNewCat("");
  }, [section]);

  const persistCategories = async (nextCategories) => {
    setSaving(true);
    try {
      const base = mergePreferencesRaw(prefs);
      const { user: u } = await api.updatePreferences({
        ...base,
        kb: {
          ...base.kb,
          [section]: {
            ...base.kb[section],
            categories: nextCategories,
          },
        },
      });
      onUserUpdated?.(u);
    } catch (e) {
      notifyError(e, "카테고리 저장 실패");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const v = newCat.trim();
    if (!v) return;
    if (presetCategories.includes(v) || extraCategories.includes(v)) {
      setCat(v);
      setNewCat("");
      onDirty?.();
      return;
    }
    try {
      await persistCategories([...presetCategories, v]);
      setCat(v);
      setNewCat("");
      onDirty?.();
      toastSuccess(`"${v}" 카테고리를 추가했어요`);
    } catch {
      /* notified */
    }
  };

  const removeCategory = async (name) => {
    if (presetCategories.length <= 1) {
      notifyError(new Error("카테고리는 최소 1개 필요해요"));
      return;
    }
    if (!presetCategories.includes(name)) return;
    if (!(await confirmAction(`"${name}" 카테고리를 삭제할까요?`, "목록에서만 지워지고, 이미 쓴 글의 분류는 그대로예요."))) return;
    const next = presetCategories.filter((c) => c !== name);
    try {
      await persistCategories(next);
      if (cat === name) setCat("");
      onDirty?.();
    } catch {
      /* notified */
    }
  };

  return (
    <div className="kbe-meta">
      <span className="tag gray" style={{ padding: "6px 10px", fontSize: 12 }}>{kbSectionLabel(section)}</span>

      {categories.map((c) => (
        <span
          key={c}
          className={"chip" + (cat === c ? " on" : "")}
          style={{
            padding: editing ? "5px 8px 5px 10px" : "7px 13px",
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
          onClick={() => { if (!editing) { setCat(c); onDirty?.(); } }}
        >
          {c}
          {editing && presetCategories.includes(c) && (
            <button
              type="button"
              aria-label={`${c} 삭제`}
              style={{
                border: "none",
                background: "transparent",
                color: "#B85C4A",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: 14,
                lineHeight: 1,
                fontFamily: "inherit",
              }}
              onClick={(e) => { e.stopPropagation(); removeCategory(c); }}
            >
              ✕
            </button>
          )}
        </span>
      ))}

      {editing ? (
        <div className="row" style={{ gap: 6, flex: "1 1 140px", minWidth: 140 }}>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addCategory();
            }}
            placeholder="새 카테고리"
            disabled={saving}
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid var(--line)",
              borderRadius: 20,
              padding: "7px 13px",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button type="button" className="chip on" style={{ padding: "7px 12px", fontSize: 12, flex: "0 0 auto" }} disabled={saving || !newCat.trim()} onClick={addCategory}>
            추가
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="chip"
          style={{ padding: "7px 12px", fontSize: 12, color: "var(--accent-deep)" }}
          onClick={() => setEditing(true)}
        >
          + 카테고리
        </button>
      )}

      <button
        type="button"
        className="chip"
        style={{ padding: "7px 10px", fontSize: 12, color: editing ? "var(--ink)" : "var(--muted)", marginLeft: editing ? 0 : "auto" }}
        onClick={() => { setEditing((v) => !v); setNewCat(""); }}
      >
        {editing ? "완료" : "편집"}
      </button>
    </div>
  );
}

function KbTagBar({ tags, setTags, tagPresets, tagInput, setTagInput, onDirty, hint }) {
  const addTag = (v) => {
    const t = (v || tagInput).trim();
    if (!t || tags.includes(t)) return;
    setTags((p) => [...p, t]);
    setTagInput("");
    onDirty?.();
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="kbe-meta-h" style={{ marginBottom: 8 }}>태그</div>
      {hint && <div className="small" style={{ lineHeight: 1.5, marginBottom: 10, color: "var(--muted)" }}>{hint}</div>}
      <div className="kbe-tags">
        {tags.map((t) => (
          <span key={t} className={`tag ${tagColor(t)}`} style={{ padding: "5px 10px", fontSize: 12 }}>
            #{t}
            <span style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => { setTags((p) => p.filter((x) => x !== t)); onDirty?.(); }}>✕</span>
          </span>
        ))}
        {tagPresets.filter((t) => !tags.includes(t)).slice(0, 8).map((t) => (
          <button key={t} type="button" className="chip" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => addTag(t)}>+ {t}</button>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            addTag();
          }}
          placeholder="태그 입력 후 Enter"
          style={{ border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 12, minWidth: 120, padding: "5px 4px", color: "#888" }}
        />
      </div>
    </div>
  );
}

export default function KbEditor({ article, back, onSaved, onDeleted, categories = [], prefs, onUserUpdated, initialBookSearchOpen = false, erpMode = false }) {
  const isNew = !article?.id;
  const titleRef = useRef(null);
  const initial = parseArticleBlocks(article);
  const [section, setSection] = useState(article?.section || "knowledge");
  const initialCat = article?.c && article.c !== "미분류" ? article.c : "";
  const [cat, setCat] = useState(initialCat);
  const [tags, setTags] = useState(article?.tags || []);
  const [bookMeta, setBookMeta] = useState(() => ({
    author: article?.bookMeta?.author || "",
    isbn: article?.bookMeta?.isbn || "",
    publisher: article?.bookMeta?.publisher || "",
    coverKey: article?.bookMeta?.coverKey || null,
  }));
  const [coverKey, setCoverKey] = useState(initial.coverKey);
  const [bookSearchOpen, setBookSearchOpen] = useState(initialBookSearchOpen);
  const [tagInput, setTagInput] = useState("");
  const isOwner = !article?.shareRole || article?.shareRole === "owner";
  const isBook = section === "book";
  const isLecture = section === "lecture";
  const [lectureMeta, setLectureMeta] = useState(() => ({
    speaker: article?.lectureMeta?.speaker || article?.bookMeta?.speaker || "",
    event: article?.lectureMeta?.event || article?.bookMeta?.event || "",
    eventDate: article?.lectureMeta?.eventDate || article?.bookMeta?.eventDate || "",
    org: article?.lectureMeta?.org || article?.bookMeta?.org || "",
  }));
  const sectionPresets = kbPresets(prefs, section);
  const tagPresets = sectionPresets.tags;
  const [blocks, setBlocks] = useState(() =>
    initial.blocks.map((b) =>
      b.type === "bullet" ? { ...b, val: stripLeadingBulletMarker(b.val || "") } : b,
    ),
  );
  const [focusIdx, setFocusIdx] = useState(-1);
  const [slash, setSlash] = useState(null);
  const [menuAt, setMenuAt] = useState(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [visibility, setVisibility] = useState(article?.visibility || (erpMode ? "private" : "company"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageUrls, setImageUrls] = useState({});
  const [pageIcon, setPageIcon] = useState(initial.icon || "");
  const [iconPickOpen, setIconPickOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  useEffect(() => {
    if (titleRef.current) titleRef.current.textContent = isNew ? "" : (article?.t || "");
  }, [article?.id, isNew]);

  useEffect(() => {
    (async () => {
      const urls = {};
      if (coverKey) {
        try {
          urls[coverKey] = await mediaUrl(coverKey);
        } catch {
          /* ignore */
        }
      }
      for (const b of blocks) {
        if (b.type === "image" && b.mediaKey && !b.preview) {
          try {
            urls[b.mediaKey] = await mediaUrl(b.mediaKey);
          } catch {
            /* ignore */
          }
        }
      }
      if (Object.keys(urls).length) setImageUrls((p) => ({ ...p, ...urls }));
    })();
  }, [article?.id]);

  const updateBlock = useCallback((i, patch) => {
    setBlocks((p) => p.map((b, k) => (k === i ? { ...b, ...patch } : b)));
    setSaved(false);
  }, []);

  const uploadBlockMedia = useCallback(async (i, kind) => {
    try {
      const file = kind === "image" ? await pickImageFile(false) : await pickAnyFile();
      const key = await uploadFile(file);
      const kindLabel = fileKind(file.type, file.name);
      if (kind === "image") {
        const preview = URL.createObjectURL(file);
        updateBlock(i, { mediaKey: key, preview, mime: file.type });
        setImageUrls((p) => ({ ...p, [key]: preview }));
      } else {
        updateBlock(i, {
          mediaKey: key,
          name: file.name || fileNameFromKey(key),
          meta: `${(file.size / 1024).toFixed(0)}KB · 탭해서 열기`,
          mime: file.type,
          kind: kindLabel,
        });
      }
      setSaved(false);
    } catch (e) {
      if (!isPickCancelled(e) && e?.message !== "파일이 선택되지 않았습니다") notifyError(e, e.message);
    }
  }, [updateBlock]);

  const insertAt = useCallback((idx, type) => {
    const nb = defaultBlock(type);
    setBlocks((p) => {
      const arr = [...p];
      arr.splice(idx, 0, nb);
      return arr;
    });
    setMenuAt(null);
    setFocusIdx(TEXT_INSERT_TYPES.has(nb.type) ? idx : -1);
    setSaved(false);
    if (nb.type === "image" || nb.type === "file") void uploadBlockMedia(idx, nb.type);
  }, [uploadBlockMedia]);

  const deleteBlock = useCallback((i) => {
    setBlocks((p) => (p.length <= 1 ? [{ type: "text", val: "" }] : p.filter((_, k) => k !== i)));
    setFocusIdx(Math.max(0, i - 1));
    setSaved(false);
  }, []);

  const moveBlock = useCallback((i, dir) => {
    setBlocks((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const nb = [...p];
      [nb[i], nb[j]] = [nb[j], nb[i]];
      return nb;
    });
    setFocusIdx(i + dir);
    setSaved(false);
  }, []);

  const reorderBlock = useCallback((from, to) => {
    setBlocks((p) => {
      if (from == null || to == null || from === to) return p;
      const arr = [...p];
      const [moved] = arr.splice(from, 1);
      const target = to > from ? to - 1 : to;
      arr.splice(target, 0, moved);
      return arr;
    });
    setFocusIdx(-1);
    setSaved(false);
  }, []);

  // 마크다운 단축 변환 (마커 + 스페이스)
  const MD_SHORTCUTS = {
    "#": "h1", "##": "h2", "###": "h3",
    "-": "bullet", "*": "bullet",
    ">": "quote", "[]": "todo", "[ ]": "todo",
    "```": "code",
  };

  const focusBlockSoon = (idx) => {
    setFocusIdx(idx);
    window.requestAnimationFrame(() => {
      const host = document.querySelector(`[data-kbrich][data-idx="${idx}"]`);
      if (host) {
        host.focus();
        setCaretAt(host, 0);
      }
    });
  };

  const handleKeyDown = (e, i) => {
    const b = blocks[i];
    if (e.key === " " && b.type === "text") {
      const el = e.currentTarget;
      const marker = el.textContent || "";
      if (MD_SHORTCUTS[marker] && getCaretOffset(el) === marker.length) {
        e.preventDefault();
        el.textContent = "";
        const nb = defaultBlock(MD_SHORTCUTS[marker]);
        setBlocks((p) => p.map((x, k) => (k === i ? nb : x)));
        setSaved(false);
        setSlash(null);
        focusBlockSoon(i);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const nextType = b.type === "bullet" || b.type === "todo" ? b.type : "text";
      insertAt(i + 1, nextType);
    }
    if (e.key === "Backspace" && b.type === "bullet") {
      const el = e.currentTarget;
      const atStart = getCaretOffset(el) === 0;
      if (atStart && (b.val || "").length) {
        e.preventDefault();
        updateBlock(i, { type: "text" });
        return;
      }
    }
    if (e.key === "Backspace" && !richToText(b.val || "") && blocks.length > 1) {
      e.preventDefault();
      deleteBlock(i);
    }
    if (e.key === "/" && !richToText(b.val || "")) {
      setSlash({ idx: i, filter: "" });
    }
  };

  const handleInput = (i, patch) => {
    let next = patch;
    if (blocks[i]?.type === "bullet" && patch.val !== undefined) {
      next = { ...patch, val: stripLeadingBulletMarker(patch.val) };
    }
    updateBlock(i, next);
    const val = next.val ?? "";
    if (slash?.idx === i) {
      if (val.startsWith("/")) setSlash({ idx: i, filter: val.slice(1) });
      else setSlash(null);
    }
  };

  const handleBlockPaste = (e, i) => {
    e.preventDefault();
    e.stopPropagation();
    const b = blocks[i];
    const blockType = b.type;
    const el = e.currentTarget;
    let pasted;
    try {
      pasted = parseClipboardToBlocks(e.clipboardData, blockType);
    } catch (err) {
      notifyError(err, "붙여넣기 처리 실패");
      return;
    }
    if (!pasted.length) {
      const fallback = normalizePlainText(e.clipboardData?.getData?.("text/plain") || "");
      if (fallback) pasted = [{ type: "text", val: fallback }];
    }
    if (!pasted.length) return;

    const currentText = el.innerText || "";
    const offset = getCaretOffset(el);
    const before = currentText.slice(0, offset);
    const after = currentText.slice(offset);
    const multiBlock =
      pasted.length > 1 || pasted.some((p) => p.type === "divider" || p.type === "h" || p.type === "table");

    if (!multiBlock && pasted.length === 1 && !(pasted[0].val || "").includes("\n")) {
      const merged = before + pasted[0].val + after;
      el.innerText = merged;
      updateBlock(i, { val: merged });
      setSaved(false);
      window.requestAnimationFrame(() => setCaretAt(el, before.length + pasted[0].val.length));
      return;
    }

    const newBlocks = [];
    if (before.trim()) newBlocks.push({ ...defaultBlock(blockType), val: before });
    for (const pb of pasted) {
      newBlocks.push({ ...defaultBlock(pb.type), ...pb });
    }
    if (after.trim()) newBlocks.push({ ...defaultBlock(blockType), val: after });
    if (!newBlocks.length) return;

    setBlocks((prev) => {
      const nb = [...prev];
      nb.splice(i, 1, ...newBlocks);
      return nb;
    });
    setFocusIdx(i + newBlocks.length - 1);
    setSaved(false);
  };

  const handleTitlePaste = (e) => {
    e.preventDefault();
    const plain = normalizePlainText(e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text/html")?.replace(/<[^>]+>/g, " ") || "");
    const oneLine = plain.replace(/\s*\n+\s*/g, " ").trim();
    if (!oneLine) return;
    const el = e.currentTarget;
    const merged = insertTextAtCaret(el, oneLine);
    setSaved(false);
    window.requestAnimationFrame(() => setCaretAt(el, merged.length));
  };

  const pickSlash = (type) => {
    if (slash == null) return;
    const i = slash.idx;
    const nb = defaultBlock(type);
    setBlocks((p) => p.map((b, k) => (k === i ? nb : b)));
    setSlash(null);
    setFocusIdx(TEXT_INSERT_TYPES.has(nb.type) ? i : -1);
    setSaved(false);
    // '/필터' 로 남아있던 텍스트 제거 후 포커스
    window.requestAnimationFrame(() => {
      const host = document.querySelector(`[data-kbrich][data-idx="${i}"]`);
      if (host) {
        seedEditable(host, "");
        if (TEXT_INSERT_TYPES.has(nb.type)) { host.focus(); setCaretAt(host, 0); }
      }
    });
    if (nb.type === "image" || nb.type === "file") void uploadBlockMedia(i, nb.type);
  };

  const applyBookFromSearch = async (book) => {
    if (titleRef.current) titleRef.current.textContent = book.title || "";
    const author = (book.authors || []).join(", ");
    let nextCoverKey = coverKey;
    if (book.thumbnail) {
      const { key } = await api.importBookCover(book.thumbnail);
      nextCoverKey = key;
      setCoverKey(key);
      try {
        const url = await mediaUrl(key);
        setImageUrls((p) => ({ ...p, [key]: url }));
      } catch {
        setImageUrls((p) => ({ ...p, [key]: book.thumbnail }));
      }
    }
    setBookMeta({
      author,
      isbn: book.isbn || "",
      publisher: book.publisher || "",
      coverKey: nextCoverKey || null,
    });
    if (book.contents) {
      const snippet = book.contents.replace(/\s+/g, " ").trim().slice(0, 600);
      setBlocks((p) =>
        p.map((b, i) => (i === 1 && b.type === "text" && !(b.val || "").trim() ? { ...b, val: snippet } : b))
      );
    }
    setSaved(false);
  };

  const uploadCover = async () => {
    try {
      const file = await pickImageFile(false);
      const key = await uploadFile(file);
      setCoverKey(key);
      setBookMeta((p) => ({ ...p, coverKey: key }));
      setImageUrls((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
      setSaved(false);
    } catch (e) {
      if (!isPickCancelled(e)) notifyError(e, e.message);
    }
  };

  const toolbarInsert = (type) => {
    const at = focusIdx >= 0 ? focusIdx + 1 : blocks.length;
    insertAt(at, type);
  };

  const toggleInsertMenu = (idx) => setMenuAt((cur) => (cur === idx ? null : idx));

  const metaSummary = [kbSectionLabel(section), cat || null, tags.length ? `태그 ${tags.length}` : null, coverKey ? "대표이미지" : null]
    .filter(Boolean)
    .join(" · ");

  const exit = () => back?.(section);

  const doSave = async (silent = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const title = (titleRef.current?.textContent || "").trim() || "제목 없음";
      const payload = blocks.map(({ preview, ...rest }) => rest);
      if (coverKey) payload.unshift({ type: "cover", mediaKey: coverKey });
      if (pageIcon) payload.unshift({ type: "icon", emoji: pageIcon });
      const meta =
        section === "book"
          ? {
              author: (bookMeta.author || "").trim(),
              isbn: (bookMeta.isbn || "").trim(),
              publisher: (bookMeta.publisher || "").trim(),
              coverKey: coverKey || bookMeta.coverKey || null,
            }
          : section === "lecture"
            ? {
                speaker: (lectureMeta.speaker || "").trim(),
                event: (lectureMeta.event || "").trim(),
                eventDate: (lectureMeta.eventDate || "").trim(),
                org: (lectureMeta.org || "").trim(),
              }
            : null;
      const saveTags = [...tags];
      if (section === "lecture") {
        for (const v of [lectureMeta.event, lectureMeta.speaker, lectureMeta.org]) {
          const t = (v || "").trim();
          if (t && !saveTags.includes(t)) saveTags.push(t);
        }
      }
      await api.saveKb({
        id: article?.id,
        title,
        section,
        category: cat.trim() || "미분류",
        tags: saveTags,
        bookMeta: meta,
        blocks: payload,
        visibility: erpMode ? visibility : undefined,
      });
      onSaved?.();
      setSaved(true);
      if (!silent) setTimeout(exit, 700);
    } catch (e) {
      if (!silent) notifyError(e, e.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!article?.id) return exit();
    if (!(await confirmDelete(article.title || "이 글"))) return;
    try {
      await api.deleteKb(article.id);
      onDeleted?.();
      exit();
    } catch (e) {
      notifyError(e, e.message);
    }
  };

  return (
    <div className="fade kbe-wrap">
      <div className="kbe-bar">
        <div className="kbe-inner kbe-bar-inner">
          <button type="button" className="iconbtn" onClick={exit} aria-label="닫기" style={{ border: "none", background: "transparent", width: 36, height: 36 }}>←</button>
          <div className="kbe-bar-title">{isNew ? "글쓰기" : (article?.t || "글 수정")}</div>
          <div className="kbe-actions">
            <button
              type="button"
              className={"kbe-settings" + (metaOpen ? " on" : "")}
              onClick={() => setMetaOpen((v) => !v)}
              aria-label="글 설정"
              title="글 설정"
            >
              ⚙
            </button>
            {!isNew && isOwner && (
              <button type="button" className="kbe-draft" style={{ color: "#E03E3E" }} onClick={handleDelete}>
                삭제
              </button>
            )}
            <button type="button" className="kbe-draft" onClick={() => doSave(true)} disabled={saving}>
              {saved ? "저장됨" : "임시저장"}
            </button>
            <button type="button" className="kbe-pub" onClick={() => doSave(false)} disabled={saving}>
              {saving ? "발행 중…" : "발행"}
            </button>
          </div>
        </div>
      </div>

      {erpMode && isOwner && (
        <div className="kbe-vis-strip">
          <span className="kbe-vis-label">공개 범위</span>
          <KbVisibilityToggle visibility={visibility} onChange={(v) => { setVisibility(v); setSaved(false); }} />
          <span className="kbe-vis-desc">
            {visibility === "private" ? "나만 보기" : "팀 전체 공개"}
          </span>
        </div>
      )}

      <RichToolbar onApply={(idx, html) => updateBlock(idx, { val: html })} />

      <div className="kbe-scroll">
        <div className="kbe-inner">
          <div className="kbe-sheet">
            <div className="kbe-page-head">
              {coverKey && imageUrls[coverKey] && (
                <div className="kbe-page-cover">
                  <img src={imageUrls[coverKey]} alt="" />
                  <div className="kbe-page-cover-actions">
                    <button type="button" onClick={uploadCover}>커버 변경</button>
                    <button type="button" onClick={() => { setCoverKey(null); setSaved(false); }}>제거</button>
                  </div>
                </div>
              )}
              <div className={"kbe-page-meta" + (coverKey && imageUrls[coverKey] ? " over" : "")}>
                {pageIcon && (
                  <button type="button" className="kbe-page-icon" onClick={() => setIconPickOpen((v) => !v)}>
                    {pageIcon}
                  </button>
                )}
                <div className="kbe-page-addrow">
                  {!pageIcon && (
                    <button type="button" className="kbe-page-add" onClick={() => setIconPickOpen((v) => !v)}>😀 아이콘</button>
                  )}
                  {!(coverKey && imageUrls[coverKey]) && (
                    <button type="button" className="kbe-page-add" onClick={uploadCover}>🖼 커버</button>
                  )}
                </div>
                {iconPickOpen && (
                  <EmojiPicker
                    current={pageIcon}
                    onPick={(em) => { setPageIcon(em); setSaved(false); }}
                    onClear={() => { setPageIcon(""); setSaved(false); }}
                    onClose={() => setIconPickOpen(false)}
                  />
                )}
              </div>
            </div>

            {isNew && (
              <div className="seg" style={{ marginBottom: 14 }}>
                {KB_SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={section === s.id ? "on" : ""}
                    onClick={() => {
                      setSection(s.id);
                      setSaved(false);
                      if (s.id === "book" && blocks.length === 1 && blocks[0].type === "text" && !blocks[0].val) {
                        setBlocks([{ type: "h", val: "독후감" }, { type: "text", val: "" }]);
                      }
                    }}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="kbe-sheet-meta">
              <div className="kbe-meta-h">분류</div>
              <KbCategoryBar
                section={section}
                cat={cat}
                setCat={setCat}
                prefs={prefs}
                onUserUpdated={onUserUpdated}
                onDirty={() => setSaved(false)}
                extraCategories={categories}
              />
            </div>

            <KbTagBar
              tags={tags}
              setTags={setTags}
              tagPresets={tagPresets}
              tagInput={tagInput}
              setTagInput={setTagInput}
              onDirty={() => setSaved(false)}
              hint={isLecture ? "강연·세미나·행사명으로 나중에 찾기 쉽게 태그를 달아보세요" : undefined}
            />

            <div
              ref={titleRef}
              className="editable kbe-title"
              contentEditable
              suppressContentEditableWarning
              data-ph={isBook ? "책 제목을 입력하세요" : "제목"}
              onFocus={() => setFocusIdx(-1)}
              onPaste={handleTitlePaste}
            />

            {isBook && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 18,
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: "1px solid #C5E8D4",
                  background: "linear-gradient(180deg, #F6FFF9 0%, #fff 100%)",
                }}
              >
                <div className="small" style={{ lineHeight: 1.5, marginBottom: 10, color: "#2E7D52" }}>
                  카카오 도서 검색으로 제목·저자·표지를 자동으로 채울 수 있어요
                </div>
                <button
                  type="button"
                  className="chip"
                  style={{ width: "100%", padding: 12, color: "#03A84D", borderColor: "#C5E8D4", fontWeight: 700 }}
                  onClick={() => setBookSearchOpen(true)}
                >
                  🔍 책 검색으로 불러오기
                </button>
                {(bookMeta.author || coverKey) && (
                  <div className="small" style={{ marginTop: 10, lineHeight: 1.5, color: "var(--muted)" }}>
                    {bookMeta.author && <>저자: {bookMeta.author}</>}
                    {bookMeta.author && bookMeta.isbn && " · "}
                    {bookMeta.isbn && <>ISBN {bookMeta.isbn}</>}
                  </div>
                )}
                {bookSearchOpen && (
                  <BookSearchSheet onClose={() => setBookSearchOpen(false)} onPick={applyBookFromSearch} />
                )}
              </div>
            )}

            {isLecture && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 18,
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: "1px solid #D8D4F0",
                  background: "linear-gradient(180deg, #F8F7FF 0%, #fff 100%)",
                }}
              >
                <div className="small" style={{ fontWeight: 700, marginBottom: 10, color: "#5856D6" }}>🎤 강연 정보</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    value={lectureMeta.event}
                    onChange={(e) => { setLectureMeta((p) => ({ ...p, event: e.target.value })); setSaved(false); }}
                    placeholder="행사명 (예: BROJ SUMMIT 2026)"
                    style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }}
                  />
                  <div className="row" style={{ gap: 10 }}>
                    <input
                      value={lectureMeta.speaker}
                      onChange={(e) => { setLectureMeta((p) => ({ ...p, speaker: e.target.value })); setSaved(false); }}
                      placeholder="연사"
                      style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }}
                    />
                    <input
                      value={lectureMeta.org}
                      onChange={(e) => { setLectureMeta((p) => ({ ...p, org: e.target.value })); setSaved(false); }}
                      placeholder="주최 · 소속"
                      style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }}
                    />
                  </div>
                  <input
                    value={lectureMeta.eventDate}
                    onChange={(e) => { setLectureMeta((p) => ({ ...p, eventDate: e.target.value })); setSaved(false); }}
                    placeholder="일자 (예: 2026.06.16)"
                    style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontFamily: "inherit", fontSize: 14 }}
                  />
                </div>
                <div className="small" style={{ marginTop: 8, lineHeight: 1.45, color: "var(--muted)" }}>
                  저장 시 행사명·연사·주최도 태그로 자동 추가돼요
                </div>
              </div>
            )}

            <div className="kbe-body">
              {blocks.map((b, i) => (
                <React.Fragment key={i}>
                  <div className={"kbe-insert" + (menuAt === i ? " open" : "")}>
                    <div className="kbe-insert-line" />
                    <button type="button" className="kbe-insert-btn" aria-label="블록 추가" onClick={() => toggleInsertMenu(i)}>+</button>
                  </div>
                  {menuAt === i && (
                    <div className="kbe-menu">
                      {INSERT_MENU.map((bt) => (
                        <button key={bt.type} type="button" className="kbe-mi" onClick={() => insertAt(i, bt.type)}>
                          <span className="kbe-mi-ic">{bt.ic}</span>
                          <span>{bt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    className={"kbe-blk-wrap" + (dragIdx === i ? " dragging" : "") + (overIdx === i && dragIdx != null && dragIdx !== i ? " dropinto" : "")}
                    onDragOver={(e) => { if (dragIdx == null) return; e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
                    onDrop={(e) => { if (dragIdx == null) return; e.preventDefault(); reorderBlock(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                  >
                    <span
                      className="kbe-drag"
                      draggable
                      title="드래그해서 이동"
                      aria-label="블록 이동"
                      onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* noop */ } }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    >
                      ⠿
                    </span>
                    <div className="kbe-blk">
                      <div className="kbe-blk-ctrls">
                        <button type="button" className="kbe-ctrl" aria-label="위로" disabled={i === 0} onClick={() => moveBlock(i, -1)}>↑</button>
                        <button type="button" className="kbe-ctrl" aria-label="아래로" disabled={i === blocks.length - 1} onClick={() => moveBlock(i, 1)}>↓</button>
                        <button type="button" className="kbe-ctrl del" aria-label="블록 삭제" onClick={() => deleteBlock(i)}>✕</button>
                      </div>
                      {slash?.idx === i && <SlashMenu filter={slash.filter} onPick={pickSlash} onClose={() => setSlash(null)} />}
                      <BlockRow
                        b={b}
                        i={i}
                        focused={focusIdx === i}
                        imageUrls={{ ...imageUrls, ...(b.preview ? { [b.mediaKey]: b.preview } : {}) }}
                        onFocus={setFocusIdx}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        onDelete={deleteBlock}
                        onMove={moveBlock}
                        onUpload={uploadBlockMedia}
                        onToggleTodo={(idx) => updateBlock(idx, { done: !blocks[idx].done })}
                        onTableChange={(idx, rows) => updateBlock(idx, { rows })}
                        onPaste={handleBlockPaste}
                        onUnlist={(idx) => updateBlock(idx, { type: "text" })}
                      />
                    </div>
                  </div>
                </React.Fragment>
              ))}

              <div
                className={"kbe-insert kbe-insert-end" + (menuAt === blocks.length ? " open" : "") + (overIdx === blocks.length && dragIdx != null ? " dropinto" : "")}
                onDragOver={(e) => { if (dragIdx == null) return; e.preventDefault(); if (overIdx !== blocks.length) setOverIdx(blocks.length); }}
                onDrop={(e) => { if (dragIdx == null) return; e.preventDefault(); reorderBlock(dragIdx, blocks.length); setDragIdx(null); setOverIdx(null); }}
              >
                <div className="kbe-insert-line" />
                <button type="button" className="kbe-insert-btn" aria-label="블록 추가" onClick={() => toggleInsertMenu(blocks.length)}>+</button>
              </div>
              {menuAt === blocks.length && (
                <div className="kbe-menu">
                  {INSERT_MENU.map((bt) => (
                    <button key={bt.type} type="button" className="kbe-mi" onClick={() => insertAt(blocks.length, bt.type)}>
                      <span className="kbe-mi-ic">{bt.ic}</span>
                      <span>{bt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {metaOpen && (
        <div className="kbe-meta-panel">
          <div className="kbe-inner">
            <div className="kbe-meta-h">글 설정</div>
            {metaSummary && <div className="small" style={{ marginBottom: 12, color: "#888" }}>{metaSummary}</div>}

            {erpMode && isOwner && (
              <div style={{ marginBottom: 14 }}>
                <div className="kbe-meta-h" style={{ marginTop: 0 }}>공개 범위</div>
                <KbVisibilityToggle visibility={visibility} onChange={(v) => { setVisibility(v); setSaved(false); }} />
                <div className="small" style={{ marginTop: 8, color: "#888" }}>
                  {visibility === "private" ? "나만 볼 수 있습니다" : "승인된 팀 멤버 모두가 볼 수 있습니다"}
                </div>
              </div>
            )}

            <div className="kbe-meta-h" style={{ marginTop: 4 }}>대표 이미지 (선택)</div>
            <div className={"kbe-cover" + (coverKey && imageUrls[coverKey] ? " compact" : "")} onClick={uploadCover} style={isBook ? { maxWidth: 220 } : undefined}>
              {coverKey && imageUrls[coverKey] ? (
                <>
                  <img src={imageUrls[coverKey]} alt="" style={isBook ? { objectFit: "cover" } : undefined} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#333" }}>{isBook ? "책 표지" : "대표 이미지"}</div>
                    <div className="small" style={{ marginTop: 2 }}>탭하여 변경</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 22, color: "#AAA" }}>{isBook ? "📚" : "🖼"}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#666" }}>{isBook ? "책 표지 추가" : "대표 이미지 추가"}</div>
                </>
              )}
            </div>

            {isBook && (
              <div style={{ marginTop: 14 }}>
                <div className="sheet-field">
                  <label>저자</label>
                  <input
                    value={bookMeta.author}
                    onChange={(e) => { setBookMeta((p) => ({ ...p, author: e.target.value })); setSaved(false); }}
                    placeholder="저자명"
                    style={{ width: "100%", padding: "11px 12px", borderRadius: 8, border: "1px solid #E8EAED", fontFamily: "inherit", fontSize: 14 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="kbe-toolbar">
        <div className="kbe-inner kbe-toolbar-inner">
          {TOOLBAR_ITEMS.slice(0, 2).map((t) => (
            <button key={t.type} type="button" className="kbe-tool" onClick={() => toolbarInsert(t.type)}>
              <span className="kbe-tool-ic">{t.ic}</span>
              <span>{t.label}</span>
            </button>
          ))}
          <span className="kbe-tdiv" />
          {TOOLBAR_ITEMS.slice(2).map((t) => (
            <button key={t.type} type="button" className="kbe-tool" onClick={() => toolbarInsert(t.type)}>
              <span className="kbe-tool-ic">{t.ic}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function kbSavePayload(article, extra = {}) {
  const raw = article?._raw || {};
  return {
    id: article.id,
    title: article.t || raw.title || "제목 없음",
    section: article.section || raw.section || "knowledge",
    category: article.c || raw.category || "미분류",
    tags: article.tags || raw.tags || [],
    blocks: article.blocks || raw.blocks || [],
    bookMeta: article.bookMeta || raw.bookMeta || null,
    ...extra,
  };
}

function KbVisibilityToggle({ visibility, onChange, disabled, compact = false }) {
  return (
    <div className={"kbe-vis-toggle" + (compact ? " compact" : "")}>
      <button type="button" className={visibility === "private" ? "on" : ""} disabled={disabled} onClick={() => onChange("private")}>
        비공개
      </button>
      <button type="button" className={visibility === "company" ? "on" : ""} disabled={disabled} onClick={() => onChange("company")}>
        팀공개
      </button>
    </div>
  );
}

/** rich val 렌더 — 인라인 서식(HTML)이면 sanitize 후 dangerouslySetInnerHTML, 아니면 평문 */
function RichContent({ val, className, style, tag = "div" }) {
  const v = val || "";
  if (hasInlineHtml(v)) {
    const Tag = tag;
    return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: sanitizeInline(v) }} />;
  }
  const Tag = tag;
  return <Tag className={className} style={style}>{v}</Tag>;
}

function ToggleRead({ block }) {
  const [open, setOpen] = useState(block.open !== false);
  return (
    <div className="kbr-toggle">
      <button type="button" className={"kbr-toggle-head" + (open ? " open" : "")} onClick={() => setOpen((v) => !v)}>
        <span className="kbr-toggle-caret">▸</span>
        <RichContent tag="span" val={block.val} style={{ fontWeight: 600 }} />
      </button>
      {open && block.body && <div className="kbr-toggle-body">{block.body}</div>}
    </div>
  );
}

export function KbReadView({ article, back, onEdit, onShare, canEdit = true, erpMode = false, onArticleUpdated }) {
  const [imageUrls, setImageUrls] = useState({});
  const [visibility, setVisibility] = useState(article?.visibility || "private");
  const [visSaving, setVisSaving] = useState(false);
  const isOwner = !article?.shareRole || article?.shareRole === "owner";
  const rawBlocks = article?.blocks || [];
  const coverKey = kbCoverKey(article);
  const pageIcon = rawBlocks.find((b) => b.type === "icon")?.emoji || "";
  const blocks = rawBlocks.filter((b) => b.type !== "cover" && b.type !== "icon");

  useEffect(() => {
    setVisibility(article?.visibility || "private");
  }, [article?.id, article?.visibility]);

  useEffect(() => {
    (async () => {
      const urls = {};
      if (coverKey) {
        try {
          urls[coverKey] = await mediaUrl(coverKey);
        } catch {
          /* ignore */
        }
      }
      for (const b of blocks) {
        if (b.type === "image" && b.mediaKey) {
          try {
            urls[b.mediaKey] = await mediaUrl(b.mediaKey);
          } catch {
            /* ignore */
          }
        }
      }
      setImageUrls(urls);
    })();
  }, [article?.id]);

  const changeVisibility = async (next) => {
    if (!article?.id || next === visibility || visSaving) return;
    setVisSaving(true);
    try {
      const saved = await api.saveKb(kbSavePayload(article, { visibility: next }));
      setVisibility(next);
      onArticleUpdated?.(saved);
      toastSuccess(next === "company" ? "팀 공개로 변경했어요" : "비공개로 변경했어요");
    } catch (e) {
      notifyError(e, e.message || "공개 설정 변경 실패");
    } finally {
      setVisSaving(false);
    }
  };

  return (
    <div className="fade kbe-read">
      <div className="kbe-read-top">
        <div className="kbe-inner kbe-read-top-inner">
          <button type="button" className="iconbtn" onClick={back}>←</button>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {erpMode && isOwner ? (
              <KbVisibilityToggle visibility={visibility} onChange={changeVisibility} disabled={visSaving} compact />
            ) : onShare ? (
              <button type="button" className="btn btn-ghost" style={{ padding: "10px 16px", fontSize: 13 }} onClick={onShare}>
                공유
              </button>
            ) : null}
            {canEdit && (
              <button type="button" className="btn btn-ghost" style={{ padding: "10px 16px", fontSize: 13 }} onClick={onEdit}>
                편집
              </button>
            )}
          </div>
        </div>
      </div>
      {erpMode && isOwner && (
        <div className="kbe-vis-hint">
          {visibility === "private" ? "나만 볼 수 있는 글입니다" : "승인된 팀 멤버 모두가 볼 수 있습니다"}
        </div>
      )}
      {coverKey && imageUrls[coverKey] && (
        <div className="kbe-cover-read" style={article?.section === "book" ? { maxHeight: 360 } : undefined}>
          <img src={imageUrls[coverKey]} alt="" style={article?.section === "book" ? { objectFit: "contain", background: "#F4F1EA" } : undefined} />
        </div>
      )}
      <div className="kbe-read-body">
        {pageIcon && <div className="kbr-page-icon">{pageIcon}</div>}
        <div className="h-eyebrow">
          {kbSectionLabel(article?.section)} · {article?.c}
          {article?.isShared && article?.sharedBy ? ` · ${article.sharedBy.name || article.sharedBy.email}님과 공유` : ""}
        </div>
        <div className="h-title" style={{ marginTop: 6 }}>{article?.t}</div>
        {article?.section === "book" && article?.bookMeta?.author && (
          <div className="small" style={{ marginTop: 8, fontWeight: 600 }}>{article.bookMeta.author}</div>
        )}
        {article?.section === "lecture" && (article?.lectureMeta?.speaker || article?.bookMeta?.speaker) && (
          <div className="small" style={{ marginTop: 8, fontWeight: 600, lineHeight: 1.5 }}>
            {(article.lectureMeta?.speaker || article.bookMeta?.speaker) && `연사 ${article.lectureMeta?.speaker || article.bookMeta?.speaker}`}
            {(article.lectureMeta?.event || article.bookMeta?.event) && ` · ${article.lectureMeta?.event || article.bookMeta?.event}`}
          </div>
        )}
        {article?.tags?.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {article.tags.map((t) => (
              <span key={t} className="tag gray">#{t}</span>
            ))}
          </div>
        )}
        <div className="divider" style={{ margin: "20px 0" }} />
        {blocks.map((b, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {b.type === "h" && (
              <RichContent
                val={b.val}
                style={{
                  fontWeight: 800,
                  fontSize: (b.level || 2) === 1 ? 24 : (b.level || 2) === 3 ? 17 : 20,
                  lineHeight: 1.35,
                  margin: (b.level || 2) === 1 ? "18px 0 6px" : "12px 0 4px",
                }}
              />
            )}
            {b.type === "text" && <RichContent val={b.val} style={{ fontSize: 16, lineHeight: 1.75, whiteSpace: "pre-wrap" }} />}
            {b.type === "toggle" && <ToggleRead block={b} />}
            {b.type === "bullet" && (
              <div className="row" style={{ gap: 10 }}>
                <span>•</span>
                <RichContent tag="span" val={b.val} />
              </div>
            )}
            {b.type === "todo" && (
              <div className="row" style={{ gap: 10 }}>
                <Checkbox on={b.done} />
                <RichContent tag="span" val={b.val} style={{ textDecoration: b.done ? "line-through" : "none", color: b.done ? "var(--muted)" : "inherit" }} />
              </div>
            )}
            {b.type === "quote" && (
              <RichContent val={b.val} style={{ borderLeft: "3px solid var(--kb-accent,#B7975A)", padding: "10px 14px", background: "var(--kb-callout,#F7F6F3)", borderRadius: "2px 10px 10px 2px", fontWeight: 500 }} />
            )}
            {b.type === "code" && (
              <pre style={{ background: "#23201B", color: "#EDE7DA", borderRadius: 12, padding: 14, fontSize: 12.5, overflow: "auto" }}>{richToText(b.val)}</pre>
            )}
            {b.type === "divider" && <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "16px 0" }} />}
            {b.type === "image" && b.mediaKey && imageUrls[b.mediaKey] && (
              <img src={imageUrls[b.mediaKey]} alt="" style={{ maxWidth: "100%", borderRadius: 12 }} />
            )}
            {b.type === "file" && b.mediaKey && <KbFileRow block={b} />}
            {b.type === "table" && b.rows && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ border: "1px solid var(--line)", padding: "8px 10px", fontWeight: ri === 0 ? 700 : 400 }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function kbSearchText(article) {
  const parts = [article.t, article.c, kbSectionLabel(article.section), ...(article.tags || [])];
  if (article.bookMeta?.author) parts.push(article.bookMeta.author);
  const lm = article.lectureMeta || (article.section === "lecture" ? article.bookMeta : null);
  if (lm?.speaker) parts.push(lm.speaker);
  if (lm?.event) parts.push(lm.event);
  if (lm?.org) parts.push(lm.org);
  if (lm?.eventDate) parts.push(lm.eventDate);
  for (const b of article.blocks || []) parts.push(blockText(b));
  return parts.join(" ").toLowerCase();
}
