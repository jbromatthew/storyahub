import React, { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api/client.js";
import { confirmDelete } from "../confirmDelete.js";
import { notifyError, toastError } from "../toast.js";
import { getClients } from "../store.js";
import { groupTodosBySource } from "../todoGroups.js";

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
  compact = false,
  focusAdd = false,
  groupBySource = true,
}) {
  const contacts = contactsProp || getClients();
  const groups = useMemo(
    () => groupTodosBySource(todos, { meetings, contacts }),
    [todos, meetings, contacts]
  );
  const useGroups =
    groupBySource &&
    !compact &&
    todos.some((t) => {
      const raw = t._raw || t;
      return raw.meetingId || raw.contactId;
    });

  const [open, setOpen] = useState(() => new Set(todos.filter((t) => (t.subs || []).length).map((t) => t.id)));
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [adding, setAdding] = useState({});
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const addInputRef = useRef(null);

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
      for (const g of groups) n.add(g.id);
      return n;
    });
  }, [useGroups, groups]);

  useEffect(() => {
    if (focusAdd && addInputRef.current) {
      addInputRef.current.focus();
      addInputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusAdd]);

  const patch = async (id, body) => {
    await api.updateTodo(id, body);
    await onRefresh?.();
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
      await api.createTodo({ title, priority: "mid" });
      setNewTitle("");
      await onRefresh?.();
    } catch (e) {
      notifyError(e, e.message || "추가 실패");
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
    } catch (err) {
      notifyError(err, err.message || "삭제 실패");
    }
  };

  const openSubs = (id, e) => {
    e.stopPropagation();
    setOpen((p) => new Set(p).add(id));
  };

  const totalDone = todos.filter(isTodoDone).length;

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
          <span
            className={"nt-stext" + (done ? " s" : "")}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              openDetail?.(t);
            }}
          >
            {t.t}
          </span>
          {t.due && t.due !== "-" && (
            <span className="small" style={{ flex: "0 0 auto", fontSize: 11 }}>{t.due}</span>
          )}
          {!compact && (
            <button type="button" className="nt-split" style={{ color: "var(--muted)", padding: "2px 6px" }}
              onClick={(e) => deleteTask(t, e)} aria-label="삭제">
              ✕
            </button>
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
          <span
            className={"nt-ptitle" + (done ? " s" : "") + (nested ? " nested" : "")}
            onClick={(e) => {
              e.stopPropagation();
              openDetail?.(t);
            }}
          >
            {t.t}
          </span>
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
          {!compact && (
            <button type="button" className="nt-split" style={{ color: "var(--muted)", padding: "4px 8px" }}
              onClick={(e) => deleteTask(t, e)} aria-label="삭제">
              ✕
            </button>
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
                <span className={"nt-stext" + (s.done ? " s" : "")}>{s.text}</span>
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
      {!compact && todos.length > 0 && (
        <div className="nt-hint">
          {useGroups
            ? `${totalDone}/${todos.length} 완료 · 녹음·미팅별로 묶여 있어요`
            : `${totalDone}/${todos.length} 완료 · 세부 항목을 다 끝내면 자동 완료돼요`}
        </div>
      )}

      {todos.length === 0 && !showAdd && (
        <div className="small" style={{ textAlign: "center", padding: "24px 0" }}>할 일이 없어요</div>
      )}

      {useGroups
        ? groups.map((g) => {
            const gDone = g.items.filter(isTodoDone).length;
            const gr = groupRatio(g.items);
            const gOpen = openGroups.has(g.id);
            const allDone = gDone === g.items.length;

            return (
              <div key={g.id} className={"nt-card nt-group" + (allDone ? " done" : "")}>
                <div className="nt-phead" onClick={() => toggleGroup(g.id)}>
                  <span className={"nt-chev" + (gOpen ? " open" : "")} onClick={(e) => toggleGroup(g.id, e)}>
                    <Chevron />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nt-ptitle" style={{ fontSize: 14.5 }}>{g.label}</div>
                    {g.sublabel && <div className="small" style={{ fontSize: 11, marginTop: 2 }}>{g.sublabel}</div>}
                  </div>
                  <span className={"nt-count" + (allDone ? " full" : "")}>{gDone}/{g.items.length}</span>
                </div>
                <div className="nt-bar">
                  <i className={gr === 1 ? "full" : ""} style={{ width: `${gr * 100}%` }} />
                </div>
                {gOpen && (
                  <div className="nt-subs" style={{ paddingTop: 0 }}>
                    {g.items.map((t) => renderTodo(t, { nested: !(t.subs || []).length }))}
                  </div>
                )}
              </div>
            );
          })
        : todos.map((t) => renderTodo(t))}

      {showAdd && (
        <div className="nt-newtask">
          <input
            ref={addInputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTask())}
            placeholder="새 할 일 추가"
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
      )}
    </div>
  );
}
