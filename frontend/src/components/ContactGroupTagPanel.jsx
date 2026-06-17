import React, { useMemo, useState } from "react";
import {
  clearContactGroup,
  removeContactTag,
  renameContactGroup,
  renameContactTag,
  saveContactPresets,
} from "../contactPresets.js";
import { contactGroupOptions } from "../preferences.js";
import { confirmAction } from "../confirm.js";
import { notifyError, toastSuccess } from "../toast.js";

const inputStyle = {
  flex: 1,
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  fontFamily: "inherit",
  fontSize: 14,
  background: "#fff",
};

function RenameField({ value, onChange, onConfirm, onCancel, placeholder }) {
  return (
    <div className="row" style={{ gap: 8, padding: "8px 0" }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={inputStyle}
      />
      <button type="button" className="btn btn-ghost" style={{ padding: "10px 14px", fontSize: 13 }} onClick={onConfirm}>
        저장
      </button>
    </div>
  );
}

function EditRow({ label, onRename, onDelete, disabled }) {
  return (
    <div className="row between" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <div className="row" style={{ gap: 6 }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 10px", fontSize: 12, minWidth: 0 }}
          disabled={disabled}
          onClick={onRename}
        >
          이름
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "6px 10px", fontSize: 12, color: "#B85C4A", minWidth: 0 }}
          disabled={disabled}
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

export default function ContactGroupTagPanel({
  user,
  onUserUpdated,
  contactPresets = { groups: [], tags: [] },
  contacts = [],
  group,
  tags = [],
  onGroupChange,
  onTagsChange,
  onContactsRefresh,
  showAssignment = true,
  compact = false,
  presetOnly = false,
}) {
  const [editing, setEditing] = useState(presetOnly);
  const [busy, setBusy] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  const presetGroups = contactPresets.groups || [];
  const presetTags = contactPresets.tags || [];
  const groupOptions = useMemo(
    () => contactGroupOptions({ contacts: contactPresets }, contacts),
    [contactPresets, contacts]
  );

  const tagOptions = useMemo(() => {
    const ordered = [...presetTags];
    for (const t of tags || []) {
      if (!ordered.includes(t)) ordered.push(t);
    }
    return ordered;
  }, [presetTags, tags]);

  const editableGroups = useMemo(
    () => groupOptions.filter((g) => g !== "미분류"),
    [groupOptions]
  );

  const persistPresets = async (groups, tagList) => {
    if (!user) throw new Error("로그인이 필요합니다");
    setBusy(true);
    try {
      await saveContactPresets(user, { groups, tags: tagList }, onUserUpdated);
      onContactsRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const addGroup = async () => {
    const v = groupInput.trim();
    if (!v || v === "미분류" || v === "전체" || presetGroups.includes(v) || groupOptions.includes(v)) {
      setGroupInput("");
      return;
    }
    try {
      await persistPresets([...presetGroups, v], presetTags);
      setGroupInput("");
      toastSuccess(`그룹 「${v}」을(를) 추가했어요`);
    } catch (e) {
      notifyError(e, "그룹 추가 실패");
    }
  };

  const addTag = async () => {
    const v = tagInput.trim();
    if (!v || presetTags.includes(v)) {
      setTagInput("");
      return;
    }
    try {
      await persistPresets(presetGroups, [...presetTags, v]);
      setTagInput("");
      toastSuccess(`태그 「${v}」을(를) 추가했어요`);
    } catch (e) {
      notifyError(e, "태그 추가 실패");
    }
  };

  const startRename = (kind, value) => {
    setRenaming({ kind, value });
    setRenameVal(value);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameVal("");
  };

  const confirmRename = async () => {
    if (!renaming) return;
    const next = renameVal.trim();
    const { kind, value } = renaming;
    if (!next || next === value) {
      cancelRename();
      return;
    }
    if (kind === "group" && (next === "미분류" || next === "전체")) {
      notifyError(new Error("사용할 수 없는 그룹 이름입니다"));
      return;
    }
    if (kind === "group" && (presetGroups.includes(next) || groupOptions.includes(next))) {
      notifyError(new Error("이미 있는 그룹 이름입니다"));
      return;
    }
    if (kind === "tag" && presetTags.includes(next)) {
      notifyError(new Error("이미 있는 태그입니다"));
      return;
    }

    setBusy(true);
    try {
      if (kind === "group") {
        await renameContactGroup(contacts, value, next);
        if (presetGroups.includes(value)) {
          await persistPresets(
            presetGroups.map((g) => (g === value ? next : g)),
            presetTags
          );
        }
        if (group === value) onGroupChange?.(next);
      } else {
        await renameContactTag(contacts, value, next);
        await persistPresets(
          presetGroups,
          presetTags.map((t) => (t === value ? next : t))
        );
        if ((tags || []).includes(value)) {
          onTagsChange?.((tags || []).map((t) => (t === value ? next : t)));
        }
      }
      toastSuccess("이름을 바꿨어요");
      cancelRename();
    } catch (e) {
      notifyError(e, "이름 변경 실패");
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (name) => {
    const count = contacts.filter((c) => c.group === name).length;
    const ok = await confirmAction(
      `「${name}」 그룹을 삭제할까요?`,
      count ? `해당 그룹 ${count}명은 미분류로 바뀝니다.` : "목록에서만 제거됩니다."
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (count) await clearContactGroup(contacts, name);
      if (presetGroups.includes(name)) {
        await persistPresets(
          presetGroups.filter((g) => g !== name),
          presetTags
        );
      } else {
        onContactsRefresh?.();
      }
      if (group === name) onGroupChange?.("미분류");
      toastSuccess("그룹을 삭제했어요");
    } catch (e) {
      notifyError(e, "그룹 삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  const deleteTag = async (name) => {
    const count = contacts.filter((c) => (c.tags || []).includes(name)).length;
    const ok = await confirmAction(
      `「${name}」 태그를 삭제할까요?`,
      count ? `인맥 ${count}명에서 이 태그가 제거됩니다.` : "목록에서만 제거됩니다."
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (count) await removeContactTag(contacts, name);
      await persistPresets(
        presetGroups,
        presetTags.filter((t) => t !== name)
      );
      if ((tags || []).includes(name)) onTagsChange?.((tags || []).filter((t) => t !== name));
      toastSuccess("태그를 삭제했어요");
    } catch (e) {
      notifyError(e, "태그 삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = (t) => {
    const has = (tags || []).includes(t);
    onTagsChange?.(has ? (tags || []).filter((x) => x !== t) : [...(tags || []), t]);
  };

  const closeEdit = () => {
    cancelRename();
    setEditing(false);
  };

  const wrapStyle = compact
    ? { padding: "0 16px 12px" }
    : { padding: "0 16px 16px" };

  return (
    <div style={wrapStyle}>
      <div className="card" style={{ padding: "16px 18px" }}>
        <div className="row between" style={{ marginBottom: editing ? 16 : 14 }}>
          {showAssignment && !compact && (
            <div className="section-h" style={{ margin: 0 }}>
              그룹 · 태그
            </div>
          )}
          {compact && !showAssignment && (
            <div className="small" style={{ fontWeight: 700, color: "var(--muted)" }}>
              그룹 · 태그 목록
            </div>
          )}
          {!presetOnly && (
            <button
              type="button"
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 13,
                fontWeight: 700,
                color: editing ? "var(--ink)" : "var(--accent-deep)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              disabled={busy}
              onClick={() => (editing ? closeEdit() : setEditing(true))}
            >
              {editing ? "완료" : "편집"}
            </button>
          )}
        </div>

        {!editing && showAssignment && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 8, color: "var(--muted)" }}>
                그룹
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {groupOptions.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={"chip" + (group === g ? " on" : "")}
                    disabled={busy}
                    onClick={() => onGroupChange?.(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 8, color: "var(--muted)" }}>
                태그
              </div>
              {tagOptions.length === 0 ? (
                <div className="small" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
                  태그가 없어요.{" "}
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "var(--accent-deep)",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                    }}
                    onClick={() => setEditing(true)}
                  >
                    편집
                  </button>
                  에서 추가할 수 있어요.
                </div>
              ) : (
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {tagOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={"chip" + ((tags || []).includes(t) ? " on" : "")}
                      disabled={busy}
                      onClick={() => toggleTag(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {editing && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>
                그룹 목록
              </div>
              <div className="small" style={{ color: "var(--muted)", marginBottom: 8, lineHeight: 1.45 }}>
                미분류는 기본값이라 삭제할 수 없어요.
              </div>
              {renaming?.kind === "group" ? (
                <RenameField
                  value={renameVal}
                  onChange={setRenameVal}
                  onConfirm={confirmRename}
                  onCancel={cancelRename}
                  placeholder="그룹 이름"
                />
              ) : (
                editableGroups.map((g) => (
                  <EditRow
                    key={g}
                    label={g}
                    disabled={busy}
                    onRename={() => startRename("group", g)}
                    onDelete={() => deleteGroup(g)}
                  />
                ))
              )}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <input
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGroup())}
                  placeholder="새 그룹"
                  disabled={busy}
                  style={inputStyle}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "11px 14px", fontSize: 13, whiteSpace: "nowrap" }}
                  disabled={busy}
                  onClick={addGroup}
                >
                  추가
                </button>
              </div>
            </div>

            <div>
              <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
                태그 목록
              </div>
              {renaming?.kind === "tag" ? (
                <RenameField
                  value={renameVal}
                  onChange={setRenameVal}
                  onConfirm={confirmRename}
                  onCancel={cancelRename}
                  placeholder="태그 이름"
                />
              ) : (
                presetTags.map((t) => (
                  <EditRow
                    key={t}
                    label={t}
                    disabled={busy}
                    onRename={() => startRename("tag", t)}
                    onDelete={() => deleteTag(t)}
                  />
                ))
              )}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="새 태그"
                  disabled={busy}
                  style={inputStyle}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "11px 14px", fontSize: 13, whiteSpace: "nowrap" }}
                  disabled={busy}
                  onClick={addTag}
                >
                  추가
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
