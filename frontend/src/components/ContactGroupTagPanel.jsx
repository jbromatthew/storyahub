import React, { useMemo, useState } from "react";
import {
  clearContactGroup,
  removeContactTag,
  renameContactGroup,
  renameContactTag,
  saveContactPresets,
} from "../contactPresets.js";
import { contactGroupOptions, tagColor } from "../preferences.js";
import { confirmAction } from "../confirm.js";
import { notifyError, toastSuccess } from "../toast.js";

function RenameInput({ value, onChange, onConfirm, onCancel, placeholder }) {
  return (
    <span className="row" style={{ gap: 4, alignItems: "center" }}>
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
        style={{
          width: 88,
          padding: "6px 8px",
          borderRadius: 9,
          border: "1px solid var(--line)",
          fontFamily: "inherit",
          fontSize: 12,
        }}
      />
      <button type="button" className="chip" style={{ padding: "5px 8px", fontSize: 11 }} onClick={onConfirm}>
        ✓
      </button>
    </span>
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
    if (name === "미분류") return;
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

  const sectionStyle = compact ? { paddingTop: 0, marginBottom: 4 } : { paddingTop: 0, marginBottom: 4 };

  return (
    <div className="pad" style={sectionStyle}>
      <div className="row between" style={{ marginBottom: 8 }}>
        {showAssignment && !compact && <div className="section-h" style={{ margin: 0 }}>그룹 · 태그</div>}
        {!presetOnly && (
          <button
            type="button"
            className="chip"
            style={{ marginLeft: "auto", fontSize: 12, color: editing ? "var(--accent-deep)" : "var(--muted)" }}
            disabled={busy}
            onClick={() => {
              cancelRename();
              setEditing((v) => !v);
            }}
          >
            {editing ? "완료" : "목록 편집"}
          </button>
        )}
      </div>

      {(showAssignment || editing) && (
        <>
      <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>그룹</div>
      <div className="row" style={{ gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        {groupOptions.map((g) => {
          if (editing && renaming?.kind === "group" && renaming.value === g) {
            return (
              <RenameInput
                key={g}
                value={renameVal}
                onChange={setRenameVal}
                onConfirm={confirmRename}
                onCancel={cancelRename}
                placeholder="그룹 이름"
              />
            );
          }
          const canManage = editing && g !== "미분류";
          return (
            <span key={g} className="row" style={{ gap: 2, alignItems: "center" }}>
              <button
                type="button"
                className={"chip" + (showAssignment && group === g ? " on" : "")}
                disabled={busy || (editing && !showAssignment)}
                onClick={() => {
                  if (editing) return;
                  onGroupChange?.(g);
                }}
              >
                {g}
              </button>
              {canManage && (
                <>
                  <button
                    type="button"
                    className="iconbtn"
                    style={{ width: 26, height: 26, fontSize: 11 }}
                    disabled={busy}
                    onClick={() => startRename("group", g)}
                    aria-label={`${g} 이름 변경`}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="iconbtn"
                    style={{ width: 26, height: 26, fontSize: 11, color: "#B85C4A" }}
                    disabled={busy}
                    onClick={() => deleteGroup(g)}
                    aria-label={`${g} 삭제`}
                  >
                    ✕
                  </button>
                </>
              )}
            </span>
          );
        })}
      </div>

      {editing && (
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input
            value={groupInput}
            onChange={(e) => setGroupInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGroup())}
            placeholder="새 그룹 (예: 강남, VIP)"
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          />
          <button type="button" className="chip" style={{ padding: "10px 14px" }} disabled={busy} onClick={addGroup}>
            추가
          </button>
        </div>
      )}

      <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>태그</div>
      <div className="row" style={{ gap: 7, flexWrap: "wrap", marginBottom: editing ? 10 : 8 }}>
        {(tags || []).map((t) => {
          const col = tagColor(t);
          return (
            <span
              key={`on-${t}`}
              className={"tag" + (col && col !== "accent" ? " " + col : "")}
              style={{ padding: "7px 11px", gap: 6, cursor: editing ? "default" : "pointer" }}
              onClick={() => !editing && toggleTag(t)}
            >
              {t}
              {!editing && " ✕"}
            </span>
          );
        })}
        {presetTags
          .filter((t) => !(tags || []).includes(t))
          .map((t) => {
            if (editing && renaming?.kind === "tag" && renaming.value === t) {
              return (
                <RenameInput
                  key={t}
                  value={renameVal}
                  onChange={setRenameVal}
                  onConfirm={confirmRename}
                  onCancel={cancelRename}
                  placeholder="태그 이름"
                />
              );
            }
            return (
              <span key={t} className="row" style={{ gap: 2, alignItems: "center" }}>
                {!editing ? (
                  <button
                    type="button"
                    className="chip"
                    style={{ padding: "7px 12px", fontSize: 12 }}
                    disabled={busy}
                    onClick={() => toggleTag(t)}
                  >
                    + {t}
                  </button>
                ) : (
                  <span className="tag gray" style={{ padding: "6px 10px", fontSize: 12 }}>
                    #{t}
                  </span>
                )}
                {editing && (
                  <>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 26, height: 26, fontSize: 11 }}
                      disabled={busy}
                      onClick={() => startRename("tag", t)}
                      aria-label={`${t} 이름 변경`}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 26, height: 26, fontSize: 11, color: "#B85C4A" }}
                      disabled={busy}
                      onClick={() => deleteTag(t)}
                      aria-label={`${t} 삭제`}
                    >
                      ✕
                    </button>
                  </>
                )}
              </span>
            );
          })}
      </div>

      {editing && (
        <div className="row" style={{ gap: 8 }}>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="새 태그"
            disabled={busy}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          />
          <button type="button" className="chip" style={{ padding: "10px 14px" }} disabled={busy} onClick={addTag}>
            추가
          </button>
        </div>
      )}

      {editing && (
        <div className="small" style={{ marginTop: 10, lineHeight: 1.5, color: "var(--muted)" }}>
          ✎ 이름 변경 · ✕ 삭제 · 추가한 항목은 모든 인맥 화면에 바로 반영돼요.
        </div>
      )}
        </>
      )}
    </div>
  );
}
