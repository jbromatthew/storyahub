import React, { useState } from "react";
import { api } from "../api/client.js";
import {
  CALENDAR_COLOR_POOL,
  DEFAULT_PREFERENCES,
  mergePreferencesRaw,
  prefsSummary,
  userPreferences,
} from "../preferences.js";
import { toastSuccess, notifyError } from "../toast.js";
import { confirmAction } from "../confirm.js";

const KB_SECTIONS = [
  { id: "knowledge", label: "지식" },
  { id: "lecture", label: "강연" },
  { id: "book", label: "책" },
];

const TABS = [
  { id: "overview", label: "한눈에" },
  { id: "contacts", label: "인맥" },
  { id: "calendar", label: "캘린더" },
  { id: "meetings", label: "미팅" },
  { id: "places", label: "맛집" },
  { id: "kb", label: "지식" },
];

function PresetEditor({ title, hint, categories = [], tags = [], onChange, tagsOnly = false, groupsOnly = false }) {
  const [catInput, setCatInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const addCat = () => {
    const v = catInput.trim();
    if (!v || categories.includes(v)) return;
    onChange({ categories: [...categories, v], tags });
    setCatInput("");
  };
  const addTag = () => {
    const v = tagInput.trim();
    if (!v || tags.includes(v)) return;
    onChange({ categories, tags: [...tags, v] });
    setTagInput("");
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{title}</div>
      {hint && <div className="small" style={{ lineHeight: 1.5, marginBottom: 12 }}>{hint}</div>}

      {!tagsOnly && (
        <>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
            {groupsOnly ? "그룹" : "카테고리"}
          </div>
          <div className="row" style={{ gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {categories.map((c) => (
              <span key={c} className="tag gray" style={{ padding: "6px 10px", fontSize: 12 }}>
                {c}
                <span
                  style={{ cursor: "pointer", marginLeft: 5 }}
                  onClick={() => onChange({ categories: categories.filter((x) => x !== c), tags })}
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginBottom: groupsOnly ? 0 : 14 }}>
            <input
              value={catInput}
              onChange={(e) => setCatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCat())}
              placeholder={groupsOnly ? "새 그룹 (예: 강남, VIP)" : "새 카테고리"}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 11,
                border: "1px solid var(--line)",
                fontFamily: "inherit",
                fontSize: 14,
              }}
            />
            <button type="button" className="chip" style={{ padding: "10px 14px" }} onClick={addCat}>
              추가
            </button>
          </div>
        </>
      )}

      {!groupsOnly && (
        <>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>태그</div>
          <div className="row" style={{ gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {tags.map((t) => (
              <span key={t} className="tag gray" style={{ padding: "6px 10px", fontSize: 12 }}>
                #{t}
                <span
                  style={{ cursor: "pointer", marginLeft: 5 }}
                  onClick={() => onChange({ categories, tags: tags.filter((x) => x !== t) })}
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="새 태그"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 11,
                border: "1px solid var(--line)",
                fontFamily: "inherit",
                fontSize: 14,
              }}
            />
            <button type="button" className="chip" style={{ padding: "10px 14px" }} onClick={addTag}>
              추가
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CalendarEditor({ calendars, onChange }) {
  const update = (idx, patch) => {
    onChange(calendars.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const remove = (idx) => {
    if (calendars.length <= 1) return;
    onChange(calendars.filter((_, i) => i !== idx));
  };
  const add = () => {
    const color = CALENDAR_COLOR_POOL[calendars.length % CALENDAR_COLOR_POOL.length];
    onChange([...calendars, { id: `cal-${Date.now()}`, name: "새 캘린더", color }]);
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>캘린더 목록</div>
      <div className="small" style={{ lineHeight: 1.5, marginBottom: 14 }}>
        사이드바와 일정 색상에 그대로 반영돼요. 이름은 일정 분류와 연결됩니다.
      </div>
      {calendars.map((cal, idx) => (
        <div key={cal.id} className="row" style={{ gap: 8, marginBottom: 10, alignItems: "center" }}>
          <input
            type="color"
            value={cal.color}
            onChange={(e) => update(idx, { color: e.target.value })}
            style={{ width: 40, height: 40, border: "none", padding: 0, cursor: "pointer", borderRadius: 10 }}
            title="색상"
          />
          <input
            value={cal.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          />
          <button type="button" className="chip" style={{ color: "#B85C4A" }} onClick={() => remove(idx)} disabled={calendars.length <= 1}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="chip" onClick={add}>
        + 캘린더 추가
      </button>
    </div>
  );
}

function OverviewPanel({ prefs, onGo }) {
  const s = prefsSummary(prefs);
  const cards = [
    { id: "contacts", title: "인맥", sub: `그룹 ${s.contacts.groups} · 태그 ${s.contacts.tags}`, where: "리스트 필터 · 명함 스캔 · 상세" },
    { id: "calendar", title: "캘린더", sub: `${s.calendar}개 캘린더`, where: "일정 색상 · 사이드바" },
    { id: "meetings", title: "미팅", sub: `분류 ${s.meeting.categories} · 태그 ${s.meeting.tags}`, where: "미팅 목록 · 상세" },
    { id: "places", title: "맛집", sub: `카테고리 ${s.places.categories} · 태그 ${s.places.tags}`, where: "저장 · 지도 · 일정 장소" },
    { id: "kb", title: "지식백과", sub: "책 · 강연 · 지식", where: "글 작성 · 필터" },
  ];
  return (
    <div>
      <div className="small" style={{ lineHeight: 1.6, marginBottom: 14 }}>
        한 번 설정하면 앱 전체에서 같은 카테고리·태그를 씁니다. 아래에서 영역별로 편집하세요.
      </div>
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          className="card list-item"
          style={{ width: "100%", textAlign: "left", padding: 16, marginBottom: 10, border: "1px solid var(--line)", cursor: "pointer" }}
          onClick={() => onGo(c.id)}
        >
          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
          <div className="small" style={{ marginTop: 4 }}>{c.sub}</div>
          <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>→ {c.where}</div>
        </button>
      ))}
    </div>
  );
}

export default function CategoryTagSettings({ user, back, onUserUpdated }) {
  const [prefs, setPrefs] = useState(() => userPreferences(user));
  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const normalized = mergePreferencesRaw(prefs);
      const { user: u } = await api.updatePreferences(normalized);
      onUserUpdated?.(u);
      toastSuccess("분류 설정을 저장했어요 · 앱 전체에 적용됩니다");
      back?.();
    } catch (e) {
      notifyError(e, "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!(await confirmAction("기본값으로 되돌릴까요?", "카테고리·태그 설정이 처음 상태로 바뀝니다."))) return;
    setPrefs(JSON.parse(JSON.stringify(DEFAULT_PREFERENCES)));
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button type="button" className="iconbtn" onClick={back}>
          ←
        </button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>
          분류 · 태그
        </div>
        <div style={{ width: 42 }} />
      </div>

      <div className="pad" style={{ paddingTop: 10, paddingBottom: 0 }}>
        <div className="row" style={{ gap: 6, overflowX: "auto", flexWrap: "nowrap", paddingBottom: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"chip" + (tab === t.id ? " on" : "")}
              style={{ flex: "0 0 auto" }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pad" style={{ marginTop: 10, marginBottom: 20 }}>
        {tab === "overview" && <OverviewPanel prefs={prefs} onGo={setTab} />}

        {tab === "contacts" && (
          <PresetEditor
            title="인맥 그룹"
            hint="지역·소속·등급 등으로 인맥을 묶을 때 씁니다. 리스트 상단 필터와 명함 저장 시 선택돼요."
            categories={prefs.contacts?.groups || []}
            tags={[]}
            groupsOnly
            onChange={({ categories }) => setPrefs((p) => ({ ...p, contacts: { ...p.contacts, groups: categories } }))}
          />
        )}
        {tab === "contacts" && (
          <PresetEditor
            title="인맥 태그"
            hint="상태·메모용 자유 태그예요. 영업 전용 태그 대신 본인에게 맞게 바꿔 쓰세요."
            categories={[]}
            tags={prefs.contacts?.tags || []}
            tagsOnly
            onChange={({ tags }) => setPrefs((p) => ({ ...p, contacts: { ...p.contacts, tags } }))}
          />
        )}

        {tab === "calendar" && (
          <CalendarEditor
            calendars={prefs.calendar?.calendars || []}
            onChange={(calendars) => setPrefs((p) => ({ ...p, calendar: { calendars } }))}
          />
        )}

        {tab === "meetings" && (
          <PresetEditor
            title="미팅"
            hint="미팅 상세·목록 필터에서 분류와 태그로 씁니다."
            categories={prefs.meeting?.categories || []}
            tags={prefs.meeting?.tags || []}
            onChange={(next) => setPrefs((p) => ({ ...p, meeting: { ...p.meeting, ...next } }))}
          />
        )}

        {tab === "places" && (
          <PresetEditor
            title="맛집 · 장소"
            hint="카카오맵 저장·지도·캘린더 장소 연결에 씁니다."
            categories={prefs.places?.categories || []}
            tags={prefs.places?.tags || []}
            onChange={(next) => setPrefs((p) => ({ ...p, places: { ...p.places, ...next } }))}
          />
        )}

        {tab === "kb" &&
          KB_SECTIONS.map((s) => (
            <PresetEditor
              key={s.id}
              title={`지식백과 · ${s.label}`}
              hint="글 작성 시 카테고리·태그 칩으로 표시돼요."
              categories={prefs.kb[s.id]?.categories || []}
              tags={prefs.kb[s.id]?.tags || []}
              onChange={(next) =>
                setPrefs((p) => ({ ...p, kb: { ...p.kb, [s.id]: { ...p.kb[s.id], ...next } } }))
              }
            />
          ))}

        {tab !== "overview" && (
          <>
            <button
              type="button"
              className="btn btn-accent"
              style={{ width: "100%", padding: 15, fontSize: 15, marginTop: 4 }}
              disabled={saving}
              onClick={save}
            >
              {saving ? "저장 중…" : "저장하고 적용"}
            </button>
            <button type="button" className="btn btn-ghost" style={{ width: "100%", padding: 13, marginTop: 10 }} onClick={reset}>
              기본값으로 되돌리기
            </button>
          </>
        )}

        {tab === "overview" && (
          <button type="button" className="btn btn-ghost" style={{ width: "100%", padding: 13, marginTop: 4 }} onClick={reset}>
            전체 기본값으로 되돌리기
          </button>
        )}
      </div>
    </div>
  );
}
