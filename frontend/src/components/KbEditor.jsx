import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { api } from "../api/client.js";
import { confirmDelete } from "../confirmDelete.js";
import { uploadFile, pickImageFile, pickAnyFile, mediaUrl, isPickCancelled } from "../api/upload.js";
import { KB_SECTIONS, kbSectionLabel, kbCoverKey } from "../mappers.js";
import { kbPresets, tagColor } from "../preferences.js";
import { notifyError } from "../toast.js";

export const BLOCK_TYPES = [
  { type: "text", label: "텍스트", desc: "일반 문단", slash: "텍스트" },
  { type: "h", label: "제목", desc: "섹션 제목", slash: "제목" },
  { type: "todo", label: "체크리스트", desc: "할 일 목록", slash: "체크" },
  { type: "bullet", label: "불릿 목록", desc: "순서 없는 목록", slash: "목록" },
  { type: "quote", label: "콜아웃", desc: "강조 박스", slash: "인용" },
  { type: "image", label: "이미지", desc: "사진 · 슬라이드", slash: "이미지" },
  { type: "file", label: "파일", desc: "PDF · 영상", slash: "파일" },
  { type: "table", label: "표", desc: "간단한 표", slash: "표" },
  { type: "code", label: "코드", desc: "코드 블록", slash: "코드" },
  { type: "divider", label: "구분선", desc: "섹션 구분", slash: "구분" },
];

function defaultBlock(type) {
  switch (type) {
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
  if (b.val) return b.val;
  if (b.type === "table" && b.rows) return b.rows.flat().join(" ");
  if (b.name) return b.name;
  return "";
}

function fileNameFromKey(key) {
  if (!key) return "첨부파일";
  const name = key.split("/").pop() || "첨부파일";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
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
          <div className="mi-ic" style={{ fontSize: 16 }}>
            {bt.type === "image" ? "🖼" : bt.type === "file" ? "📎" : bt.label[0]}
          </div>
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
  const [url, setUrl] = useState(null);
  const kind = block.kind || fileKind(block.mime, block.name);
  useEffect(() => {
    if (!block.mediaKey) return;
    mediaUrl(block.mediaKey)
      .then(setUrl)
      .catch(() => {});
  }, [block.mediaKey]);
  return (
    <div className="fileblk" style={{ cursor: url || onClick ? "pointer" : "default" }} onClick={() => (url ? window.open(url, "_blank", "noopener") : onClick?.())}>
      <div className="fileic" style={{ background: FILE_COLORS[kind] || FILE_COLORS.file }}>{FILE_ICONS[kind] || "📄"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.name || "첨부파일"}</div>
        <div className="small">{block.meta || (url ? "탭해서 열기" : "불러오는 중…")}</div>
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
          style={{ padding: "10px 14px", cursor: "pointer" }}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(bt.type);
            onClose();
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14 }}>{bt.label}</div>
          <div className="small">/{bt.slash}</div>
        </div>
      ))}
    </div>
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
}) {
  const editableTypes = ["text", "h", "quote", "bullet", "todo", "code"];
  const isEditable = editableTypes.includes(b.type);
  const ph =
    b.type === "h"
      ? "제목"
      : b.type === "todo"
        ? "할 일"
        : b.type === "bullet"
          ? "목록 항목"
          : b.type === "quote"
            ? "콜아웃"
            : b.type === "code"
              ? "// 코드"
              : "입력하거나 / 로 블록 추가";

  const styleFor = () => {
    if (b.type === "h") return { fontWeight: 800, fontSize: 20, lineHeight: 1.35, letterSpacing: "-.01em", padding: "14px 0 4px" };
    if (b.type === "quote")
      return {
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.5,
        color: "var(--accent-deep)",
        borderLeft: "3px solid var(--accent)",
        background: "var(--accent-soft)",
        borderRadius: "0 12px 12px 0",
        padding: "12px 14px",
      };
    if (b.type === "code")
      return {
        background: "#23201B",
        color: "#EDE7DA",
        borderRadius: 12,
        padding: 14,
        fontSize: 12.5,
        fontFamily: "ui-monospace,Menlo,monospace",
        whiteSpace: "pre-wrap",
      };
    return { fontSize: 16, lineHeight: 1.75, color: "#2C2A26", padding: "7px 0" };
  };

  const editableRef = useRef(null);
  const wasFocused = useRef(false);

  useLayoutEffect(() => {
    if (focused && !wasFocused.current && editableRef.current) {
      editableRef.current.focus();
    }
    wasFocused.current = focused;
  }, [focused]);

  const bindEditable = (el) => {
    editableRef.current = el;
    if (el && el.innerText !== (b.val || "") && document.activeElement !== el) {
      el.innerText = b.val || "";
    }
  };

  return (
    <div className="blk">
      <div>
      {b.type === "divider" && <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />}

      {b.type === "bullet" && (
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ink)", marginTop: 10 }} />
          <div
            className="editable"
            contentEditable
            suppressContentEditableWarning
            data-ph={ph}
            style={{ flex: 1, ...styleFor() }}
            onFocus={() => onFocus(i)}
            onInput={(e) => onChange(i, { val: e.currentTarget.innerText })}
            onKeyDown={(e) => onKeyDown(e, i)}
            ref={bindEditable}
          />
        </div>
      )}

      {b.type === "todo" && (
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <span style={{ marginTop: 2, cursor: "pointer" }} onClick={() => onToggleTodo(i)}>
            <Checkbox on={b.done} />
          </span>
          <div
            className="editable"
            contentEditable
            suppressContentEditableWarning
            data-ph={ph}
            style={{
              flex: 1,
              ...styleFor(),
              textDecoration: b.done ? "line-through" : "none",
              color: b.done ? "var(--muted)" : "var(--ink)",
            }}
            onFocus={() => onFocus(i)}
            onInput={(e) => onChange(i, { val: e.currentTarget.innerText })}
            onKeyDown={(e) => onKeyDown(e, i)}
            ref={bindEditable}
          />
        </div>
      )}

      {isEditable && b.type !== "bullet" && b.type !== "todo" && (
        <div
          className="editable"
          contentEditable
          suppressContentEditableWarning
          data-ph={ph}
          style={styleFor()}
          onFocus={() => onFocus(i)}
          onInput={(e) => onChange(i, { val: e.currentTarget.innerText })}
          onKeyDown={(e) => onKeyDown(e, i)}
          ref={bindEditable}
        />
      )}

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
        <div className="imgblk" style={{ cursor: "pointer", padding: b.mediaKey ? 12 : 26 }} onClick={() => onUpload(i, "image")}>
          {imageUrls[b.mediaKey] ? (
            <img src={imageUrls[b.mediaKey]} alt="" style={{ maxWidth: "100%", borderRadius: 12, display: "block", margin: "0 auto" }} />
          ) : (
            <div style={{ fontSize: 28, color: "var(--accent-deep)" }}>🖼</div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{b.mediaKey ? "탭하여 변경" : "사진 · 이미지 추가"}</div>
          {!b.mediaKey && <div className="small" style={{ marginTop: 4 }}>PNG, JPG, WEBP</div>}
        </div>
      )}

      {b.type === "file" && (
        <div onClick={() => !b.mediaKey && onUpload(i, "file")}>
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

const BLOG_MENU = [
  ["text", "본문"],
  ["h", "소제목"],
  ["image", "이미지"],
  ["file", "파일"],
  ["quote", "인용"],
  ["divider", "구분선"],
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 8000,
        background: "rgba(20,16,12,.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 0 max(12px, env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          maxHeight: "min(82vh, 640px)",
          background: "#fff",
          borderRadius: "20px 20px 14px 14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -8px 40px rgba(20,16,12,.18)",
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
    </div>
  );
}

function parseArticleBlocks(article) {
  const raw = article?.blocks || [];
  const cover = raw.find((b) => b.type === "cover");
  const blocks = raw.filter((b) => b.type !== "cover");
  const section = article?.section || "knowledge";
  const defaultBlocks =
    section === "book"
      ? [
          { type: "h", val: "독후감" },
          { type: "text", val: "" },
        ]
      : [{ type: "text", val: "" }];
  return {
    coverKey: cover?.mediaKey || article?.bookMeta?.coverKey || null,
    blocks: blocks.length ? blocks : defaultBlocks,
  };
}

export default function KbEditor({ article, back, onSaved, onDeleted, categories = [], prefs }) {
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
  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const isBook = section === "book";
  const sectionPresets = kbPresets(prefs, section);
  const catSuggestions = [
    ...new Set([...sectionPresets.categories, ...categories.filter((c) => c && c !== "미분류")]),
  ];
  const tagPresets = sectionPresets.tags;
  const [blocks, setBlocks] = useState(initial.blocks);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [slash, setSlash] = useState(null);
  const [menuAt, setMenuAt] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageUrls, setImageUrls] = useState({});

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

  const insertAt = useCallback((idx, type) => {
    setBlocks((p) => {
      const nb = [...p];
      nb.splice(idx, 0, defaultBlock(type));
      return nb;
    });
    setMenuAt(null);
    setFocusIdx(type === "text" || type === "h" || type === "quote" ? idx : -1);
    setSaved(false);
    if (type === "image" || type === "file") setPendingUpload({ idx, kind: type });
  }, []);

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

  const handleKeyDown = (e, i) => {
    const b = blocks[i];
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const nextType = b.type === "bullet" || b.type === "todo" ? b.type : "text";
      insertAt(i + 1, nextType);
    }
    if (e.key === "Backspace" && !(b.val || "").length && blocks.length > 1) {
      e.preventDefault();
      deleteBlock(i);
    }
    if (e.key === "/" && (b.val || "") === "") {
      setSlash({ idx: i, filter: "" });
    }
  };

  const handleInput = (i, patch) => {
    updateBlock(i, patch);
    const val = patch.val ?? "";
    if (slash?.idx === i) {
      if (val.startsWith("/")) setSlash({ idx: i, filter: val.slice(1) });
      else setSlash(null);
    }
  };

  const pickSlash = (type) => {
    if (slash == null) return;
    const i = slash.idx;
    setBlocks((p) => p.map((b, k) => (k === i ? defaultBlock(type) : b)));
    setSlash(null);
    setFocusIdx(i);
    setSaved(false);
  };

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

  useEffect(() => {
    if (!pendingUpload) return;
    uploadBlockMedia(pendingUpload.idx, pendingUpload.kind);
    setPendingUpload(null);
  }, [pendingUpload, uploadBlockMedia]);

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

  const toolbarInsert = (type) => insertAt(blocks.length, type);

  const doSave = async (silent = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const title = (titleRef.current?.textContent || "").trim() || "제목 없음";
      const payload = blocks.map(({ preview, ...rest }) => rest);
      if (coverKey) payload.unshift({ type: "cover", mediaKey: coverKey });
      const meta =
        section === "book"
          ? {
              author: (bookMeta.author || "").trim(),
              isbn: (bookMeta.isbn || "").trim(),
              publisher: (bookMeta.publisher || "").trim(),
              coverKey: coverKey || bookMeta.coverKey || null,
            }
          : null;
      await api.saveKb({
        id: article?.id,
        title,
        section,
        category: cat.trim() || "미분류",
        tags,
        bookMeta: meta,
        blocks: payload,
      });
      onSaved?.();
      setSaved(true);
      if (!silent) setTimeout(back, 700);
    } catch (e) {
      if (!silent) notifyError(e, e.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!article?.id) return back();
    if (!confirmDelete(article.title || "이 글")) return;
    try {
      await api.deleteKb(article.id);
      onDeleted?.();
      back();
    } catch (e) {
      notifyError(e, e.message);
    }
  };

  return (
    <div className="fade kbe-wrap">
      <div className="kbe-bar">
        <div className="kbe-inner kbe-bar-inner">
          <button type="button" className="iconbtn" onClick={back}>←</button>
          <div className="kbe-actions">
            {!isNew && (
              <button type="button" className="btn btn-ghost" style={{ padding: "8px 10px", fontSize: 12, color: "var(--accent-deep)" }} onClick={handleDelete}>
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

      <div className="kbe-scroll">
        <div className="kbe-inner">
        {isNew && (
          <div className="seg" style={{ marginTop: 16, marginBottom: 4 }}>
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

        <div className="kbe-cover" onClick={uploadCover} style={isBook ? { aspectRatio: "2/3", maxHeight: 320, margin: "16px auto 0", maxWidth: 220 } : undefined}>
          {coverKey && imageUrls[coverKey] ? (
            <img src={imageUrls[coverKey]} alt="" style={isBook ? { objectFit: "cover" } : undefined} />
          ) : (
            <>
              <div style={{ fontSize: 28, color: "var(--accent-deep)" }}>{isBook ? "📚" : "🖼"}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{isBook ? "책 표지 추가" : "대표 이미지 추가"}</div>
              <div className="small">{isBook ? "표지가 썸네일로 보여요" : "글 상단에 표시돼요 (선택)"}</div>
            </>
          )}
        </div>

        {isBook && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="chip"
              style={{ width: "100%", padding: 12, color: "var(--accent-deep)", borderColor: "#F3D8CB" }}
              onClick={() => setBookSearchOpen(true)}
            >
              🔍 책 검색으로 불러오기
            </button>
            {bookSearchOpen && (
              <BookSearchSheet onClose={() => setBookSearchOpen(false)} onPick={applyBookFromSearch} />
            )}
            <div className="sheet-field" style={{ marginTop: 12 }}>
              <label>저자</label>
              <input
                value={bookMeta.author}
                onChange={(e) => { setBookMeta((p) => ({ ...p, author: e.target.value })); setSaved(false); }}
                placeholder="저자명"
                style={{ width: "100%", padding: "11px 12px", borderRadius: 11, border: "1px solid var(--line)", fontFamily: "inherit", fontSize: 14 }}
              />
            </div>
          </div>
        )}

        <div className="kbe-meta">
          <span className="tag gray" style={{ padding: "6px 10px", fontSize: 12 }}>{kbSectionLabel(section)}</span>
          <input
            value={cat}
            onChange={(e) => { setCat(e.target.value); setSaved(false); }}
            onFocus={() => setFocusIdx(-1)}
            list="kb-cat-suggestions"
            placeholder="하위 카테고리"
            className="chip cat"
            style={{ border: "1px solid var(--line)", borderRadius: 20, padding: "7px 13px", fontSize: 13, fontWeight: 700, background: cat ? "var(--accent-soft)" : "#fff", color: "var(--accent-deep)", outline: "none", width: "auto", minWidth: 100 }}
          />
          <datalist id="kb-cat-suggestions">
            {catSuggestions.map((c) => <option key={c} value={c} />)}
          </datalist>
          {catSuggestions.filter((c) => c !== cat).slice(0, 4).map((c) => (
            <button key={c} type="button" className="chip" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setCat(c); setSaved(false); setFocusIdx(-1); }}>{c}</button>
          ))}
        </div>

        <div
          ref={titleRef}
          className="editable kbe-title"
          contentEditable
          suppressContentEditableWarning
          data-ph={isBook ? "책 제목" : "제목"}
          onFocus={() => setFocusIdx(-1)}
        />
        <div className="kbe-titleline" />

        <div className="kbe-tags">
          {tags.map((t) => (
            <span key={t} className={`tag ${tagColor(t)}`} style={{ padding: "5px 10px", fontSize: 12 }}>
              #{t}
              <span style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => { setTags((p) => p.filter((x) => x !== t)); setSaved(false); }}>✕</span>
            </span>
          ))}
          {tagPresets.filter((t) => !tags.includes(t)).slice(0, 6).map((t) => (
            <button key={t} type="button" className="chip" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setTags((p) => [...p, t]); setSaved(false); }}>+ {t}</button>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = tagInput.trim();
              if (!v || tags.includes(v)) return;
              setTags((p) => [...p, v]);
              setTagInput("");
              setSaved(false);
            }}
            placeholder="+ 태그 입력"
            style={{ border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 12, minWidth: 90, padding: "5px 4px", color: "var(--muted)" }}
          />
        </div>

        {blocks.map((b, i) => (
          <React.Fragment key={i}>
            <div className="kbe-addzone" onClick={() => setMenuAt(menuAt === i ? null : i)}>
              <span className="kbe-addbtn">+</span>
            </div>
            {menuAt === i && (
              <div className="kbe-menu">
                {BLOG_MENU.map(([type, label]) => (
                  <button key={type} type="button" className="kbe-mi" onClick={() => insertAt(i, type)}>{label}</button>
                ))}
              </div>
            )}
            <div className="kbe-blk">
              <button type="button" className="del" onClick={() => deleteBlock(i)}>✕</button>
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
              />
            </div>
          </React.Fragment>
        ))}

        <div className="kbe-addzone" onClick={() => setMenuAt(menuAt === blocks.length ? null : blocks.length)}>
          <span className="kbe-addbtn">+</span>
        </div>
        {menuAt === blocks.length && (
          <div className="kbe-menu">
            {BLOG_MENU.map(([type, label]) => (
              <button key={type} type="button" className="kbe-mi" onClick={() => insertAt(blocks.length, type)}>{label}</button>
            ))}
          </div>
        )}
        </div>
      </div>

      <div className="kbe-toolbar">
        <div className="kbe-inner kbe-toolbar-inner">
          <button type="button" className="kbe-tool" onClick={() => toolbarInsert("image")}>🖼<span>사진</span></button>
          <button type="button" className="kbe-tool" onClick={() => toolbarInsert("file")}>📎<span>파일</span></button>
          <span className="kbe-tdiv" />
          <button type="button" className="kbe-tool" onClick={() => toolbarInsert("h")}>H<span>소제목</span></button>
          <button type="button" className="kbe-tool" onClick={() => toolbarInsert("quote")}>❝<span>인용</span></button>
          <button type="button" className="kbe-tool" onClick={() => toolbarInsert("divider")}>—<span>구분선</span></button>
          <button type="button" className="kbe-tool" onClick={() => toolbarInsert("text")}>¶<span>본문</span></button>
        </div>
      </div>
    </div>
  );
}

export function KbReadView({ article, back, onEdit }) {
  const [imageUrls, setImageUrls] = useState({});
  const rawBlocks = article?.blocks || [];
  const coverKey = kbCoverKey(article);
  const blocks = rawBlocks.filter((b) => b.type !== "cover");

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

  return (
    <div className="fade kbe-read">
      <div className="kbe-read-top">
        <div className="kbe-inner kbe-read-top-inner">
          <button type="button" className="iconbtn" onClick={back}>←</button>
          <button type="button" className="btn btn-ghost" style={{ padding: "10px 16px", fontSize: 13 }} onClick={onEdit}>
            편집
          </button>
        </div>
      </div>
      {coverKey && imageUrls[coverKey] && (
        <div className="kbe-cover-read" style={article?.section === "book" ? { maxHeight: 360 } : undefined}>
          <img src={imageUrls[coverKey]} alt="" style={article?.section === "book" ? { objectFit: "contain", background: "#F4F1EA" } : undefined} />
        </div>
      )}
      <div className="kbe-read-body">
        <div className="h-eyebrow">{kbSectionLabel(article?.section)} · {article?.c}</div>
        <div className="h-title" style={{ marginTop: 6 }}>{article?.t}</div>
        {article?.section === "book" && article?.bookMeta?.author && (
          <div className="small" style={{ marginTop: 8, fontWeight: 600 }}>{article.bookMeta.author}</div>
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
            {b.type === "h" && <div style={{ fontWeight: 800, fontSize: 20, margin: "8px 0" }}>{b.val}</div>}
            {b.type === "text" && <div style={{ fontSize: 16, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{b.val}</div>}
            {b.type === "bullet" && (
              <div className="row" style={{ gap: 10 }}>
                <span>•</span>
                <span>{b.val}</span>
              </div>
            )}
            {b.type === "todo" && (
              <div className="row" style={{ gap: 10 }}>
                <Checkbox on={b.done} />
                <span style={{ textDecoration: b.done ? "line-through" : "none", color: b.done ? "var(--muted)" : "inherit" }}>{b.val}</span>
              </div>
            )}
            {b.type === "quote" && (
              <div style={{ borderLeft: "3px solid var(--accent)", padding: "10px 14px", background: "var(--accent-soft)", borderRadius: "0 12px 12px 0", fontWeight: 600 }}>
                {b.val}
              </div>
            )}
            {b.type === "code" && (
              <pre style={{ background: "#23201B", color: "#EDE7DA", borderRadius: 12, padding: 14, fontSize: 12.5, overflow: "auto" }}>{b.val}</pre>
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
  for (const b of article.blocks || []) parts.push(blockText(b));
  return parts.join(" ").toLowerCase();
}
