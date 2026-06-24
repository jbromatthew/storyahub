import React, { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api/client.js";
import { confirmDelete, confirmAction } from "../confirmDelete.js";
import { notifyError, toastError } from "../toast.js";
import { getClients } from "../store.js";
import { groupTodosBySource, groupDisplayRows, groupProgress, filterGroupsForToday, listTodoCategories, TODO_CATEGORY_DETAIL } from "../todoGroups.js";

const PRI = { high: "#DD5E39", mid: "#C9A23A", low: "#C0B9AC" };

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}
function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
function Plus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

let _uid = 1;
const newSubId = () => `s${Date.now()}${_uid++}`;

export function todoProgressCounts(todos) {
  let done = 0;
  let total = 0;
  for (const t of todos) {
    const subs = t.subs || [];
    if (subs.length) {
      total += subs.length;
      done += subs.filter((s) => s.done).length;
    } else {
      total += 1;
      if (isTodoDone(t)) done += 1;
    }
  }
  return { done, total };
}

export function isTodoDone(t) {
  const subs = t.subs || [];
  return subs.length ? subs.every((s) => s.done) : t.done || t.status === "done";
}

export function todoSubRatio(t) {
  const subs = t.subs || [];
  if (!subs.length) return t.done ? 1 : 0;
  return subs.filter((s) => s.done).length / subs.length;
}

function groupRatio(items) {
  if (!items.length) return 0;
  return items.filter(isTodoDone).length / items.length;
}

export default function NestedTodoList({
  todos = [],
  meetings = [],
  contacts: contactsProp,
  onRefresh,
  openDetail,
  showAdd = true,
  editable = false,
  onTaskDeleted,
  compact = false,
  focusAdd = false,
  groupBySource = true,
  hideCompletedGroups = false,
}) {
  const contacts = contactsProp || getClients();
  const groups = useMemo(
    () => groupTodosBySource(todos, { meetings, contacts }),
    [todos, meetings, contacts]
  );
  const visibleGroups = useMemo(() => {
    if (!hideCompletedGroups) return groups.map((g) => ({ group: g, disp: groupDisplayRows(g) }));
    return filterGroupsForToday(groups);
  }, [groups, hideCompletedGroups]);
  const categories = useMemo(() => listTodoCategories(todos), [todos]);
  const useGroups = groupBySource && !compact;

  const [open, setOpen] = useState(() => new Set(todos.filter((t) => (t.subs || []).length).map((t) => t.id)));
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [adding, setAdding] = useState({});
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editTitleId, setEditTitleId] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSub, setDraftSub] = useState("");
  const addInputRef = useRef(null);
  const editInputRef = useRef(null);

  useEffect(() => {
    setOpen((p) => {
      const n = new Set(p);
      for (const t of todos) {
        if ((t.subs || []).length) n.add(t.id);
      }
      return n;
    });
  }, [todos]);

  useEffect(() => {
    if (!useGroups) return;
    setOpenGroups((p) => {
      const n = new Set(p);
      for (const { group: g } of visibleGroups) n.add(g.id);
      return n;
    });
  }, [useGroups, visibleGroups]);

  useEffect(() => {
    if (selectedCatId && categories.some((c) => c.id === selectedCatId)) return;
    if (categories.length) setSelectedCatId(categories[0].id);
    else setSelectedCatId(null);
  }, [categories, selectedCatId]);

  useEffect(() => {
    if (focusAdd && addInputRef.current) {
      addInputRef.current.focus();
      addInputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusAdd]);

  useEffect(() => {
    if (editInputRef.current) editInputRef.current.focus();
  }, [editTitleId, editSub]);

  const patch = async (id, body) => {
    await api.updateTodo(id, body);
    await onRefresh?.();
  };

  const saveTitle = async (t) => {
    const next = draftTitle.trim();
    setEditTitleId(null);
    if (!next || next === t.t) return;
    try {
      await patch(t.id, { title: next });
    } catch (e) {
      notifyError(e, "제목 수정 실패");
    }
  };

  const saveSubText = async (t, sid) => {
    const next = draftSub.trim();
    setEditSub(null);
    const cur = (t.subs || []).find((s) => s.id === sid);
    if (!next || next === cur?.text) return;
    const subs = (t.subs || []).map((s) => (s.id === sid ? { ...s, text: next } : s));
    try {
      await patch(t.id, { subs });
    } catch (e) {
      notifyError(e, "세부 항목 수정 실패");
    }
  };

  const startEditTitle = (t, e) => {
    e?.stopPropagation();
    setEditSub(null);
    setEditTitleId(t.id);
    setDraftTitle(t.t || "");
  };

  const startEditSub = (t, s, e) => {
    e?.stopPropagation();
    setEditTitleId(null);
    setEditSub({ todoId: t.id, subId: s.id });
    setDraftSub(s.text || "");
  };

  const renderEditableTitle = (t, { done, nested = false, className = "nt-ptitle" } = {}) => {
    const cls = className + (done ? " s" : "") + (nested ? " nested" : "") + (editable ? " editable" : "");
    if (editable && editTitleId === t.id) {
      return (
        <input
          ref={editInputRef}
          className="nt-edit-input"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => saveTitle(t)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); saveTitle(t); }
            if (e.key === "Escape") setEditTitleId(null);
          }}
        />
      );
    }
    return (
      <span
        className={cls}
        onClick={(e) => {
          if (editable) startEditTitle(t, e);
          else {
            e.stopPropagation();
            openDetail?.(t);
          }
        }}
      >
        {t.t}
      </span>
    );
  };

  const renderEditableSubText = (t, s) => {
    const editing = editable && editSub?.todoId === t.id && editSub?.subId === s.id;
    if (editing) {
      return (
        <input
          ref={editInputRef}
          className="nt-edit-input"
          value={draftSub}
          onChange={(e) => setDraftSub(e.target.value)}
          onBlur={() => saveSubText(t, s.id)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); saveSubText(t, s.id); }
            if (e.key === "Escape") setEditSub(null);
          }}
        />
      );
    }
    return (
      <span
        className={"nt-stext" + (s.done ? " s" : "") + (editable ? " editable" : "")}
        onClick={(e) => editable ? startEditSub(t, s, e) : e.stopPropagation()}
      >
        {s.text}
      </span>
    );
  };

  const toggleOpen = (id, e) => {
    e?.stopPropagation();
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleGroup = (id, e) => {
    e?.stopPropagation();
    setOpenGroups((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleParent = async (t) => {
    if ((t.subs || []).length) return;
    const next = t.done ? "todo" : "done";
    await patch(t.id, { status: next });
  };

  const toggleSub = async (t, sid) => {
    const subs = (t.subs || []).map((s) => (s.id === sid ? { ...s, done: !s.done } : s));
    await patch(t.id, { subs });
  };

  const addSub = async (t) => {
    const text = (adding[t.id] || "").trim();
    if (!text) {
      toastError("세부 항목을 입력해 주세요");
      return;
    }
    const subs = [...(t.subs || []), { id: newSubId(), text, done: false }];
    setAdding((a) => ({ ...a, [t.id]: "" }));
    try {
      await patch(t.id, { subs });
      setOpen((p) => new Set(p).add(t.id));
    } catch (e) {
      notifyError(e, "세부 항목 추가 실패");
    }
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) {
      toastError("할 일 제목을 입력해 주세요");
      addInputRef.current?.focus();
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      if (selectedCatId) {
        const cat = todos.find((t) => t.id === selectedCatId);
        const subs = [...(cat?.subs || []), { id: newSubId(), text: title, done: false }];
        await patch(selectedCatId, { subs });
        setOpenGroups((p) => new Set(p).add(`cat:${selectedCatId}`));
      } else {
        await api.createTodo({ title, priority: "mid" });
      }
      setNewTitle("");
      await onRefresh?.();
    } catch (e) {
      notifyError(e, e.message || "추가 실패");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const title = newCategory.trim();
    if (!title) {
      toastError("대분류 이름을 입력해 주세요");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const created = await api.createTodo({ title, priority: "mid", detail: TODO_CATEGORY_DETAIL });
      setNewCategory("");
      setAddingCategory(false);
      setSelectedCatId(created.id);
      await onRefresh?.();
    } catch (e) {
      notifyError(e, e.message || "대분류 추가 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (t, e) => {
    e?.stopPropagation();
    if (!(await confirmDelete(t.t || "할 일"))) return;
    try {
      await api.deleteTodo(t.id);
      await onRefresh?.();
      onTaskDeleted?.(t);
    } catch (err) {
      notifyError(err, err.message || "삭제 실패");
    }
  };

  const deleteSub = async (t, s, e) => {
    e?.stopPropagation();
    if (!(await confirmAction(`「${s.text || "세부 항목"}」을(를) 삭제할까요?`, "되돌릴 수 없어요."))) return;
    const subs = (t.subs || []).filter((x) => x.id !== s.id);
    try {
      await patch(t.id, { subs });
    } catch (err) {
      notifyError(err, err.message || "세부 항목 삭제 실패");
    }
  };

  const showDelete = !compact || editable;

  const openSubs = (id, e) => {
    e.stopPropagation();
    setOpen((p) => new Set(p).add(id));
  };

  const { done: totalDone, total: progressTotal } = todoProgressCounts(
    hideCompletedGroups
      ? todos.filter((t) => {
          if (t.isCategory) {
            const subs = t.subs || [];
            return subs.length ? subs.some((s) => !s.done) : t.status !== "done";
          }
          return !isTodoDone(t);
        })
      : todos.filter((t) => !t.isCategory)
  );

  const renderTodo = (t, { nested = false } = {}) => {
    const done = isTodoDone(t);
    const subs = t.subs || [];
    const hasSubs = subs.length > 0;
    const r = todoSubRatio(t);
    const doneCount = subs.filter((s) => s.done).length;
    const isOpen = open.has(t.id);

    if (nested && !hasSubs) {
      return (
        <div key={t.id} className="nt-sitem">
          <span
            className={"nt-cb" + (done ? " on g" : "")}
            onClick={(e) => {
              e.stopPropagation();
              toggleParent(t);
            }}
          >
            {done && <Check />}
          </span>
          <span className="nt-pridot" style={{ background: PRI[t.pri] || PRI.mid, width: 6, height: 6 }} />
          {renderEditableTitle(t, { done, className: "nt-stext" })}
          {t.due && t.due !== "-" && (
            <span className="small" style={{ flex: "0 0 auto", fontSize: 11 }}>{t.due}</span>
          )}
          {showDelete && (
            <button type="button" className="nt-del" onClick={(e) => deleteTask(t, e)} aria-label="삭제">✕</button>
          )}
        </div>
      );
    }

    return (
      <div key={t.id} className={"nt-card" + (done ? " done" : "") + (nested ? " nested" : "")}>
        <div
          className="nt-phead"
          onClick={() => {
            if (hasSubs) toggleOpen(t.id);
            else if (!isOpen) toggleParent(t);
          }}
        >
          {hasSubs ? (
            <span className={"nt-chev" + (isOpen ? " open" : "")} onClick={(e) => toggleOpen(t.id, e)}>
              <Chevron />
            </span>
          ) : (
            <span
              className={"nt-cb big" + (done ? " on g" : "")}
              onClick={(e) => {
                e.stopPropagation();
                toggleParent(t);
              }}
            >
              {done && <Check />}
            </span>
          )}
          <span className="nt-pridot" style={{ background: PRI[t.pri] || PRI.mid }} />
          {renderEditableTitle(t, { done, nested })}
          {hasSubs && <span className={"nt-count" + (done ? " full" : "")}>{doneCount}/{subs.length}</span>}
          {!hasSubs && !isOpen && !nested && (
            <button type="button" className="nt-split" onClick={(e) => openSubs(t.id, e)}>
              + 세부
            </button>
          )}
          {!hasSubs && isOpen && !nested && (
            <span className="nt-chev open" onClick={(e) => toggleOpen(t.id, e)}>
              <Chevron />
            </span>
          )}
          {!hasSubs && t.due && t.due !== "-" && !isOpen && (
            <span className="small" style={{ flex: "0 0 auto", fontSize: 11 }}>{t.due}</span>
          )}
          {showDelete && (
            <button type="button" className="nt-del" onClick={(e) => deleteTask(t, e)} aria-label="삭제">✕</button>
          )}
        </div>

        {hasSubs && (
          <div className="nt-bar">
            <i className={r === 1 ? "full" : ""} style={{ width: `${r * 100}%` }} />
          </div>
        )}

        {isOpen && (
          <div className="nt-subs">
            {subs.map((s) => (
              <div key={s.id} className="nt-sitem">
                <span className={"nt-cb" + (s.done ? " on" : "")} onClick={() => toggleSub(t, s.id)}>
                  {s.done && <Check />}
                </span>
                {renderEditableSubText(t, s)}
                {editable && (
                  <button type="button" className="nt-del" onClick={(e) => deleteSub(t, s, e)} aria-label="세부 항목 삭제">✕</button>
                )}
              </div>
            ))}
            <div className="nt-addrow">
              <button type="button" className="nt-iadd" aria-label="세부 항목 추가" onClick={() => addSub(t)}>
                <Plus />
              </button>
              <input
                value={adding[t.id] || ""}
                onChange={(e) => setAdding((a) => ({ ...a, [t.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub(t))}
                placeholder="세부 항목 추가"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="nt-list">
      {!compact && (visibleGroups.length > 0 || (!hideCompletedGroups && todos.length > 0)) && (
        <div className="nt-hint">
          {editable && "탭해서 수정 · ✕ 로 삭제 · "}
          {useGroups
            ? `${totalDone}/${progressTotal} 완료 · 대분류를 펼치면 할 일(소분류)이 보여요`
            : `${totalDone}/${todos.length} 완료 · 세부 항목을 다 끝내면 자동 완료돼요`}
        </div>
      )}

      {editable && compact && todos.some((t) => (t.subs || []).length) && (
        <div className="nt-hint" style={{ marginBottom: 8 }}>탭해서 수정 · ✕ 로 세부 항목 삭제</div>
      )}

      {todos.length === 0 && !showAdd && (
        <div className="small" style={{ textAlign: "center", padding: "24px 0" }}>할 일이 없어요</div>
      )}

      {useGroups && visibleGroups.length === 0 && hideCompletedGroups && showAdd && (
        <div className="small" style={{ textAlign: "center", padding: "12px 0 4px", color: "var(--muted)", lineHeight: 1.55 }}>
          오늘 할 일을 모두 마쳤어요
        </div>
      )}

      {useGroups
        ? visibleGroups.map(({ group: g, disp }) => {
            const total = disp.mode === "lines" ? disp.rows.length : disp.rows.length;
            const done =
              disp.mode === "lines"
                ? disp.rows.filter((r) => r.done).length
                : disp.rows.filter(isTodoDone).length;
            const gr = total ? done / total : 0;
            const gOpen = openGroups.has(g.id);
            const allDone = total > 0 && done === total;

            return (
              <div key={g.id} className={"nt-card nt-group" + (allDone ? " done" : "")}>
                <div className="nt-phead" onClick={() => toggleGroup(g.id)}>
                  <span className={"nt-chev" + (gOpen ? " open" : "")} onClick={(e) => toggleGroup(g.id, e)}>
                    <Chevron />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nt-ptitle" style={{ fontSize: 14.5 }}>{g.label}</div>
                    {g.sublabel && <div className="small" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.45 }}>{g.sublabel}</div>}
                  </div>
                  <span className={"nt-count" + (allDone ? " full" : "")}>{done}/{total}</span>
                </div>
                <div className="nt-bar">
                  <i className={gr === 1 ? "full" : ""} style={{ width: `${gr * 100}%` }} />
                </div>
                {gOpen && (
                  <div className="nt-subs" style={{ paddingTop: 0 }}>
                    {disp.mode === "lines"
                      ? disp.rows.map((row) => (
                          <div key={`${row.kind}-${row.id}`} className="nt-sitem">
                            <span
                              className={"nt-cb" + (row.done ? " on g" : "")}
                              onClick={() =>
                                row.kind === "sub"
                                  ? toggleSub(row.parent, row.id)
                                  : toggleParent(row.parent)
                              }
                            >
                              {row.done && <Check />}
                            </span>
                            <span
                              className="nt-pridot"
                              style={{ background: PRI[row.parent.pri] || PRI.mid, width: 6, height: 6 }}
                            />
                            {row.kind === "sub" ? (
                              renderEditableSubText(row.parent, {
                                id: row.id,
                                text: row.text,
                                done: row.done,
                              })
                            ) : (
                              renderEditableTitle(row.parent, {
                                done: row.done,
                                nested: true,
                                className: "nt-stext",
                              })
                            )}
                            {editable && row.kind === "sub" && (
                              <button
                                type="button"
                                className="nt-del"
                                onClick={(e) => deleteSub(row.parent, { id: row.id, text: row.text, done: row.done }, e)}
                                aria-label="세부 항목 삭제"
                              >
                                ✕
                              </button>
                            )}
                            {editable && row.kind !== "sub" && showDelete && (
                              <button type="button" className="nt-del" onClick={(e) => deleteTask(row.parent, e)} aria-label="삭제">✕</button>
                            )}
                          </div>
                        ))
                      : disp.rows.map((t) => renderTodo(t, { nested: !(t.subs || []).length }))}
                  </div>
                )}
              </div>
            );
          })
        : todos.map((t) => renderTodo(t))}

      {showAdd && (
        <>
          {useGroups && (
            <div style={{ marginBottom: 10 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 8, color: "var(--muted)" }}>
                대분류
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: addingCategory ? 8 : 0 }}>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={"chip" + (selectedCatId === c.id ? " on" : "")}
                    disabled={saving}
                    onClick={() => setSelectedCatId(c.id)}
                  >
                    {c.t}
                  </button>
                ))}
                <button
                  type="button"
                  className="chip"
                  style={{ color: "var(--accent-deep)" }}
                  disabled={saving}
                  onClick={() => setAddingCategory((v) => !v)}
                >
                  + 대분류
                </button>
              </div>
              {addingCategory && (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
                    placeholder="대분류 이름 (예: 업무, 개인)"
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 11,
                      border: "1px solid var(--line)",
                      fontFamily: "inherit",
                      fontSize: 14,
                    }}
                  />
                  <button type="button" className="chip" disabled={saving} onClick={addCategory}>
                    추가
                  </button>
                </div>
              )}
              <div className="small" style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.45 }}>
                {selectedCatId ? "선택한 대분류 안에 소분류로 추가돼요" : "대분류를 고르거나 새로 만든 뒤 할 일을 추가하세요"}
              </div>
            </div>
          )}
          <div className="nt-newtask">
          <input
            ref={addInputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTask())}
            placeholder={selectedCatId ? "소분류 할 일 추가" : "새 할 일 추가"}
          />
          <button
            type="button"
            className="nt-send"
            aria-label="할 일 추가"
            onClick={(e) => { e.preventDefault(); addTask(); }}
            disabled={saving}
          >
            +
          </button>
        </div>
        </>
      )}
    </div>
  );
}
