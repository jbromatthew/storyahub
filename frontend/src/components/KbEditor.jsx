import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { api } from "../api/client.js";
import { confirmDelete } from "../confirmDelete.js";
import { uploadFile, pickImageFile, pickAnyFile, mediaUrl, isPickCancelled } from "../api/upload.js";

const PRESET_TAGS = ["결제완료", "결제대기", "핫리드", "신규", "VIP", "보류"];

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

function parseArticleBlocks(article) {
  const raw = article?.blocks || [];
  const cover = raw.find((b) => b.type === "cover");
  const blocks = raw.filter((b) => b.type !== "cover");
  return {
    coverKey: cover?.mediaKey || null,
    blocks: blocks.length ? blocks : [{ type: "text", val: "" }],
  };
}

export default function KbEditor({ article, back, onSaved, onDeleted, categories = [] }) {
  const isNew = !article?.id;
  const titleRef = useRef(null);
  const initial = parseArticleBlocks(article);
  const initialCat = article?.c && article.c !== "미분류" ? article.c : "";
  const [cat, setCat] = useState(initialCat);
  const [tags, setTags] = useState(article?.tags || []);
  const [coverKey, setCoverKey] = useState(initial.coverKey);
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
      if (!isPickCancelled(e) && e?.message !== "파일이 선택되지 않았습니다") alert(e.message);
    }
  }, [updateBlock]);

  useEffect(() => {
    if (!pendingUpload) return;
    uploadBlockMedia(pendingUpload.idx, pendingUpload.kind);
    setPendingUpload(null);
  }, [pendingUpload, uploadBlockMedia]);

  const uploadCover = async () => {
    try {
      const file = await pickImageFile(false);
      const key = await uploadFile(file);
      setCoverKey(key);
      setImageUrls((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
      setSaved(false);
    } catch (e) {
      if (!isPickCancelled(e)) alert(e.message);
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
      await api.saveKb({
        id: article?.id,
        title,
        category: cat.trim() || "미분류",
        tags,
        blocks: payload,
      });
      onSaved?.();
      setSaved(true);
      if (!silent) setTimeout(back, 700);
    } catch (e) {
      if (!silent) alert(e.message || "저장 실패");
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
      alert(e.message);
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
        <div className="kbe-cover" onClick={uploadCover}>
          {coverKey && imageUrls[coverKey] ? (
            <img src={imageUrls[coverKey]} alt="" />
          ) : (
            <>
              <div style={{ fontSize: 28, color: "var(--accent-deep)" }}>🖼</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>대표 이미지 추가</div>
              <div className="small">글 상단에 표시돼요 (선택)</div>
            </>
          )}
        </div>

        <div className="kbe-meta">
          <input
            value={cat}
            onChange={(e) => { setCat(e.target.value); setSaved(false); }}
            onFocus={() => setFocusIdx(-1)}
            list="kb-cat-suggestions"
            placeholder="카테고리"
            className="chip cat"
            style={{ border: "1px solid var(--line)", borderRadius: 20, padding: "7px 13px", fontSize: 13, fontWeight: 700, background: cat ? "var(--accent-soft)" : "#fff", color: "var(--accent-deep)", outline: "none", width: "auto", minWidth: 100 }}
          />
          <datalist id="kb-cat-suggestions">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
          {categories.filter((c) => c !== cat).slice(0, 3).map((c) => (
            <button key={c} type="button" className="chip" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setCat(c); setSaved(false); setFocusIdx(-1); }}>{c}</button>
          ))}
        </div>

        <div
          ref={titleRef}
          className="editable kbe-title"
          contentEditable
          suppressContentEditableWarning
          data-ph="제목"
          onFocus={() => setFocusIdx(-1)}
        />
        <div className="kbe-titleline" />

        <div className="kbe-tags">
          {tags.map((t) => (
            <span key={t} className="tag gray" style={{ padding: "5px 10px", fontSize: 12 }}>
              #{t}
              <span style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => setTags((p) => p.filter((x) => x !== t))}>✕</span>
            </span>
          ))}
          {PRESET_TAGS.filter((t) => !tags.includes(t)).slice(0, 3).map((t) => (
            <button key={t} type="button" className="chip" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setTags((p) => [...p, t])}>+ {t}</button>
          ))}
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
  const coverBlock = rawBlocks.find((b) => b.type === "cover");
  const blocks = rawBlocks.filter((b) => b.type !== "cover");

  useEffect(() => {
    (async () => {
      const urls = {};
      if (coverBlock?.mediaKey) {
        try {
          urls[coverBlock.mediaKey] = await mediaUrl(coverBlock.mediaKey);
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
      {coverBlock?.mediaKey && imageUrls[coverBlock.mediaKey] && (
        <div className="kbe-cover-read">
          <img src={imageUrls[coverBlock.mediaKey]} alt="" />
        </div>
      )}
      <div className="kbe-read-body">
        <div className="h-eyebrow">{article?.c}</div>
        <div className="h-title" style={{ marginTop: 6 }}>{article?.t}</div>
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
  const parts = [article.t, article.c, ...(article.tags || [])];
  for (const b of article.blocks || []) parts.push(blockText(b));
  return parts.join(" ").toLowerCase();
}
