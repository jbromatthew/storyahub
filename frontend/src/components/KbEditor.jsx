import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client.js";
import { uploadFile, pickImageFile, pickAnyFile, mediaUrl } from "../api/upload.js";

const WRITE_CATS = ["영업 노하우", "강의 노트", "제품 자료", "시장 조사"];
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
  return "";
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
    if (b.type === "h") return { fontWeight: 700, fontSize: 20, lineHeight: 1.35 };
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
    return { fontSize: 14.5, lineHeight: 1.65 };
  };

  return (
    <div
      className="blk"
      style={{ position: "relative" }}
      onMouseEnter={(e) => {
        e.currentTarget.querySelector(".blk-actions")?.style && (e.currentTarget.querySelector(".blk-actions").style.opacity = "1");
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget.querySelector(".blk-actions");
        if (el) el.style.opacity = "0.35";
      }}
    >
      <div
        className="blk-actions row"
        style={{
          position: "absolute",
          left: -4,
          top: 4,
          gap: 2,
          opacity: 0.35,
          transition: ".15s",
        }}
      >
        <button
          type="button"
          className="iconbtn"
          style={{ width: 28, height: 28, fontSize: 11 }}
          title="위로"
          onClick={() => onMove(i, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="iconbtn"
          style={{ width: 28, height: 28, fontSize: 11 }}
          title="아래로"
          onClick={() => onMove(i, 1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="iconbtn"
          style={{ width: 28, height: 28, fontSize: 11, color: "var(--accent-deep)" }}
          title="삭제"
          onClick={() => onDelete(i)}
        >
          ✕
        </button>
      </div>

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
            ref={(el) => {
              if (el && focused && document.activeElement !== el) el.focus();
              if (el && el.innerText !== (b.val || "") && document.activeElement !== el) el.innerText = b.val || "";
            }}
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
            ref={(el) => {
              if (el && focused && document.activeElement !== el) el.focus();
              if (el && el.innerText !== (b.val || "") && document.activeElement !== el) el.innerText = b.val || "";
            }}
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
          ref={(el) => {
            if (el && focused && document.activeElement !== el) el.focus();
            if (el && el.innerText !== (b.val || "") && document.activeElement !== el) el.innerText = b.val || "";
          }}
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
        <div className="imgblk" style={{ cursor: "pointer" }} onClick={() => onUpload(i, "image")}>
          {imageUrls[b.mediaKey] ? (
            <img src={imageUrls[b.mediaKey]} alt="" style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 8 }} />
          ) : (
            <div style={{ fontSize: 28, color: "var(--accent-deep)" }}>🖼</div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{b.mediaKey ? "탭하여 변경" : "이미지 추가"}</div>
        </div>
      )}

      {b.type === "file" && (
        <div className="fileblk" style={{ cursor: "pointer" }} onClick={() => onUpload(i, "file")}>
          <div className="fileic" style={{ background: b.kind === "video" ? "#5B6B8C" : "#C2491F" }}>📄</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis" }}>{b.name || "파일 추가"}</div>
            <div className="small">{b.meta || "탭하여 업로드"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function KbReadView({ article, back, onEdit }) {
  const [imageUrls, setImageUrls] = useState({});
  const blocks = article?.blocks || [];

  useEffect(() => {
    (async () => {
      const urls = {};
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
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button className="iconbtn" onClick={back}>
          ←
        </button>
        <button className="btn btn-ghost" style={{ padding: "10px 16px", fontSize: 13 }} onClick={onEdit}>
          편집
        </button>
      </div>
      <div className="pad" style={{ marginTop: 10, marginBottom: 20 }}>
        <div className="h-eyebrow">{article?.c}</div>
        <div className="h-title" style={{ marginTop: 6 }}>
          {article?.t}
        </div>
        {article?.tags?.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {article.tags.map((t) => (
              <span key={t} className="tag gray">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="divider" style={{ margin: "20px 0" }} />
        {blocks.map((b, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {b.type === "h" && <div style={{ fontWeight: 700, fontSize: 20, margin: "8px 0" }}>{b.val}</div>}
            {b.type === "text" && <div style={{ fontSize: 14.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{b.val}</div>}
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
              <div style={{ borderLeft: "3px solid var(--accent)", padding: "10px 14px", background: "var(--accent-soft)", borderRadius: "0 12px 12px 0" }}>
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

export default function KbEditor({ article, back, onSaved, onDeleted }) {
  const isNew = !article?.id;
  const titleRef = useRef(null);
  const [cat, setCat] = useState(article?.c || WRITE_CATS[0]);
  const [tags, setTags] = useState(article?.tags || []);
  const [blocks, setBlocks] = useState(
    article?.blocks?.length ? article.blocks : [{ type: "text", val: "" }]
  );
  const [focusIdx, setFocusIdx] = useState(0);
  const [slash, setSlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageUrls, setImageUrls] = useState({});

  useEffect(() => {
    (async () => {
      const urls = {};
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

  const insertBlock = useCallback((after, type) => {
    setBlocks((p) => {
      const nb = [...p];
      nb.splice(after + 1, 0, defaultBlock(type));
      return nb;
    });
    setFocusIdx(after + 1);
    setSaved(false);
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
      insertBlock(i, nextType);
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

  const uploadBlockMedia = async (i, kind) => {
    try {
      const file = kind === "image" ? await pickImageFile(false) : await pickAnyFile();
      const key = await uploadFile(file);
      if (kind === "image") {
        const preview = URL.createObjectURL(file);
        updateBlock(i, { mediaKey: key, preview });
        setImageUrls((p) => ({ ...p, [key]: preview }));
      } else {
        updateBlock(i, {
          mediaKey: key,
          name: file.name,
          meta: `${file.type || "file"} · 업로드됨`,
          kind: file.type?.startsWith("video/") ? "video" : "pdf",
        });
      }
    } catch (e) {
      if (e.message !== "파일이 선택되지 않았습니다") alert(e.message);
    }
  };

  const doSave = async (silent = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const title = (titleRef.current?.textContent || "").trim() || "제목 없음";
      const payload = blocks.map(({ preview, ...rest }) => rest);
      await api.saveKb({
        id: article?.id,
        title,
        category: cat,
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

  const fmt = (cmd) => {
    document.execCommand(cmd, false, null);
  };

  const handleDelete = async () => {
    if (!article?.id) return back();
    if (!confirm("이 글을 삭제할까요?")) return;
    try {
      await api.deleteKb(article.id);
      onDeleted?.();
      back();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button className="iconbtn" onClick={back}>
          ←
        </button>
        <div className="row" style={{ gap: 8 }}>
          {!isNew && (
            <button className="btn btn-ghost" style={{ padding: "10px 14px", fontSize: 13, color: "var(--accent-deep)" }} onClick={handleDelete}>
              삭제
            </button>
          )}
          <button className="btn btn-accent" style={{ padding: "10px 20px", fontSize: 14 }} onClick={() => doSave(false)} disabled={saving}>
            {saved ? "저장됨" : saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      <div className="pad" style={{ marginTop: 10 }}>
        <div className="h-eyebrow">지식백과 · {isNew ? "새 글" : "편집"}</div>
        <div
          ref={titleRef}
          className="editable"
          contentEditable
          suppressContentEditableWarning
          data-ph="제목 없음"
          style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", marginTop: 6, lineHeight: 1.3 }}
        >
          {isNew ? "" : article?.t}
        </div>
      </div>

      <div className="pad row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setSaved(false);
          }}
          style={{
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "7px 12px",
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: 13,
            background: "#fff",
          }}
        >
          {WRITE_CATS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {tags.map((t) => (
          <span key={t} className="tag" style={{ padding: "7px 11px", fontSize: 12.5 }}>
            #{t}
            <span style={{ cursor: "pointer", marginLeft: 3 }} onClick={() => setTags((p) => p.filter((x) => x !== t))}>
              ✕
            </span>
          </span>
        ))}
        {PRESET_TAGS.filter((t) => !tags.includes(t))
          .slice(0, 4)
          .map((t) => (
            <button key={t} type="button" className="chip" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setTags((p) => [...p, t])}>
              + {t}
            </button>
          ))}
      </div>

      <div className="pad ftoolbar" style={{ margin: "12px 0 6px" }}>
        {[
          ["bold", "B"],
          ["italic", "I"],
          ["underline", "U"],
          ["strikeThrough", "S"],
        ].map(([cmd, label]) => (
          <span key={cmd} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt(cmd)}>
            {label}
          </span>
        ))}
      </div>

      <div className="pad" style={{ marginTop: 6, paddingBottom: 80 }}>
        {blocks.map((b, i) => (
          <div key={i} style={{ position: "relative" }}>
            {slash?.idx === i && (
              <SlashMenu filter={slash.filter} onPick={pickSlash} onClose={() => setSlash(null)} />
            )}
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
        ))}
        <button
          type="button"
          className="addrow"
          style={{ marginTop: 12 }}
          onClick={() => insertBlock(blocks.length - 1, "text")}
        >
          + 블록 추가
        </button>
      </div>
    </div>
  );
}

export function kbSearchText(article) {
  const parts = [article.t, article.c, ...(article.tags || [])];
  for (const b of article.blocks || []) parts.push(blockText(b));
  return parts.join(" ").toLowerCase();
}
