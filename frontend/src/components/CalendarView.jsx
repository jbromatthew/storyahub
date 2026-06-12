import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { getClients, getPlaces } from "../store.js";
import { eventToUi, haversineKm, formatDistanceKm, kakaoDirectionsUrl } from "../mappers.js";
import { confirmDelete } from "../confirmDelete.js";
import {
  buildIcs,
  downloadIcs,
  shareEventNative,
  monthStart,
  monthCells,
  eventColor,
} from "../calendarUtils.js";
import { calendarList } from "../preferences.js";
import { toastError, toastSuccess, notifyError } from "../toast.js";

const REM_OPTS = ["없음", "10분 전", "30분 전", "1시간 전", "1일 전"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function emptyDraft(day, year, month, prefs) {
  const cals = calendarList(prefs);
  const first = cals[0];
  return {
    id: null,
    title: "",
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    startTime: "09:00",
    endTime: "10:00",
    place: "",
    savedPlaceId: null,
    placeLat: null,
    placeLng: null,
    notes: "",
    category: first?.name || "일정",
    color: first?.color || "#007AFF",
    contactIds: [],
    reminders: ["1시간 전"],
  };
}

function EventPopover({ draft, setDraft, contacts, places, calendars, onSave, onDelete, onClose, saving, anchorDay }) {
  const [remOpen, setRemOpen] = useState(false);
  const [pickContact, setPickContact] = useState(false);
  const [pickPlace, setPickPlace] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [myPos, setMyPos] = useState(null);

  useEffect(() => {
    if (!pickPlace || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
    );
  }, [pickPlace]);

  const toggleContact = (id) => {
    setDraft((p) => ({
      ...p,
      contactIds: p.contactIds.includes(id) ? p.contactIds.filter((x) => x !== id) : [...p.contactIds, id],
    }));
  };

  const selectPlace = (p) => {
    const label = p.area ? `${p.name} · ${p.area}` : p.name;
    setDraft((prev) => ({
      ...prev,
      place: label,
      savedPlaceId: p.id,
      placeLat: p.lat,
      placeLng: p.lng,
    }));
    setPickPlace(false);
  };

  const clearPlaceLink = () => {
    setDraft((p) => ({ ...p, savedPlaceId: null, placeLat: null, placeLng: null }));
  };

  const sortedPlaces = useMemo(() => {
    if (!myPos) return places;
    return [...places]
      .map((p) => ({ ...p, km: p.lat != null && p.lng != null ? haversineKm(myPos.lat, myPos.lng, p.lat, p.lng) : null }))
      .sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));
  }, [places, myPos]);

  const pickCal = (cal) => {
    setDraft((p) => ({ ...p, category: cal.name, color: cal.color }));
  };

  const toggleRem = (opt) => {
    setDraft((p) => {
      if (opt === "없음") return { ...p, reminders: ["없음"] };
      let a = (p.reminders || []).filter((x) => x !== "없음");
      a = a.includes(opt) ? a.filter((x) => x !== opt) : [...a, opt];
      return { ...p, reminders: a.length ? a : ["없음"] };
    });
  };

  const share = async () => {
    if (!draft.id) {
      toastError("저장한 뒤 공유할 수 있어요");
      return;
    }
    setShareBusy(true);
    try {
      const { shareUrl } = await api.shareEvent(draft.id);
      const picked = contacts.filter((c) => draft.contactIds.includes(c.id));
      const ics = buildIcs(
        {
          id: draft.id,
          title: draft.title,
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          place: draft.place,
          notes: draft.notes,
          _raw: draft,
        },
        { contacts: picked }
      );
      const text = `${draft.title}\n${draft.date} ${draft.startTime}–${draft.endTime}${draft.place ? `\n${draft.place}` : ""}`;
      const shared = await shareEventNative({ title: draft.title, text, url: shareUrl });
      if (!shared) {
        if (shareUrl && navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl);
          toastSuccess("공유 링크를 복사했어요");
        }
        downloadIcs(`${draft.title || "일정"}.ics`, ics);
        toastSuccess(".ics 파일도 내려받았어요");
      }
    } catch (e) {
      notifyError(e, "공유 실패");
    } finally {
      setShareBusy(false);
    }
  };

  const selectedContacts = contacts.filter((c) => draft.contactIds.includes(c.id));

  return createPortal(
    <div className="cal-pop-bg" onClick={onClose}>
      <div className="cal-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cal-pop-tabs">
          <span className="on">이벤트</span>
        </div>
        <div className="cal-pop-row title-row">
          <input
            className="cal-pop-title"
            value={draft.title}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            placeholder="새로운 이벤트"
            autoFocus
          />
          <div className="cal-color-pick">
            {calendars.map((cal) => (
              <button
                key={cal.id}
                type="button"
                className={draft.category === cal.name ? "on" : ""}
                style={{ background: cal.color }}
                title={cal.name}
                onClick={() => pickCal(cal)}
              />
            ))}
          </div>
        </div>
        <div className="cal-pop-field">
          <input
            value={draft.place}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                place: e.target.value,
                savedPlaceId: null,
                placeLat: null,
                placeLng: null,
              }))
            }
            placeholder="위치 또는 영상 통화 추가"
          />
        </div>
        <button type="button" className="cal-pop-link" onClick={() => setPickPlace((v) => !v)}>
          저장된 맛집 · 장소
          <span>{draft.savedPlaceId ? draft.place : sortedPlaces.length ? "선택" : "없음"}</span>
        </button>
        {pickPlace && (
          <div className="cal-contact-pick">
            {places.length === 0 && <div className="small">맛집 탭에서 먼저 저장해 주세요</div>}
            {sortedPlaces.slice(0, 20).map((p) => (
              <button
                key={p.id}
                type="button"
                className={"chip" + (draft.savedPlaceId === p.id ? " on" : "")}
                onClick={() => selectPlace(p)}
              >
                {p.name}
                {p.km != null ? ` · ${formatDistanceKm(p.km)}` : ""}
              </button>
            ))}
            {draft.savedPlaceId && (
              <button type="button" className="chip" onClick={clearPlaceLink}>
                연결 해제
              </button>
            )}
          </div>
        )}
        {draft.savedPlaceId && draft.placeLat != null && (
          <button
            type="button"
            className="cal-pop-link"
            style={{ marginTop: -4 }}
            onClick={() => {
              const url = kakaoDirectionsUrl({
                address: draft.place,
                lat: draft.placeLat,
                lng: draft.placeLng,
                label: draft.place.split(" · ")[0] || "목적지",
              });
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            카카오맵 길찾기 미리보기
            <span>→</span>
          </button>
        )}
        <div className="cal-pop-field time-row">
          <input type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
          <input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} />
          <span>–</span>
          <input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} />
        </div>
        <button type="button" className="cal-pop-link" onClick={() => setRemOpen((v) => !v)}>
          알림 추가
          <span>{(draft.reminders || []).filter((x) => x !== "없음").join(", ") || "없음"}</span>
        </button>
        {remOpen && (
          <div className="cal-rem-chips">
            {REM_OPTS.map((o) => (
              <button
                key={o}
                type="button"
                className={"chip" + ((draft.reminders || []).includes(o) ? " on" : "")}
                onClick={() => toggleRem(o)}
              >
                {o}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="cal-pop-link" onClick={() => setPickContact((v) => !v)}>
          초대할 사람 추가 (인맥)
          <span>{selectedContacts.length ? selectedContacts.map((c) => c.person).join(", ") : ""}</span>
        </button>
        {pickContact && (
          <div className="cal-contact-pick">
            {contacts.length === 0 && <div className="small">등록된 인맥이 없어요</div>}
            {contacts.slice(0, 30).map((c) => (
              <button
                key={c.id}
                type="button"
                className={"chip" + (draft.contactIds.includes(c.id) ? " on" : "")}
                onClick={() => toggleContact(c.id)}
              >
                {c.person}
                {c.co ? ` · ${c.co}` : ""}
              </button>
            ))}
          </div>
        )}
        <div className="cal-pop-field">
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
            placeholder="메모 또는 URL 추가"
            rows={2}
          />
        </div>
        <div className="cal-pop-actions">
          {draft.id && (
            <button type="button" className="btn btn-ghost" style={{ color: "#B85C4A" }} onClick={onDelete}>
              삭제
            </button>
          )}
          <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
            <button type="button" className="btn btn-ghost" onClick={share} disabled={shareBusy}>
              공유
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button type="button" className="btn btn-accent" onClick={onSave} disabled={saving}>
              {saving ? "저장…" : "저장"}
            </button>
          </div>
        </div>
        {anchorDay && <div className="small cal-pop-sub">{anchorDay}</div>}
      </div>
    </div>,
    document.body
  );
}

export default function CalendarView({ openDetail, organizePrefs }) {
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()));
  const [selDay, setSelDay] = useState(() => new Date().getDate());
  const [events, setEvents] = useState([]);
  const [hiddenCals, setHiddenCals] = useState(() => new Set());
  const [popover, setPopover] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = `${year}년 ${month + 1}월`;
  const today = new Date();
  const contacts = getClients();
  const places = getPlaces();
  const calendars = calendarList(organizePrefs);

  const reload = useCallback(() => {
    const from = monthStart(viewMonth);
    const to = new Date(year, month + 1, 0, 23, 59, 59);
    return api
      .listEvents(from.toISOString(), to.toISOString())
      .then((list) => setEvents((list || []).map(eventToUi)))
      .catch(() => setEvents([]));
  }, [viewMonth, year, month]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenCals.has(e.category || calendars[0]?.name || "일정")),
    [events, hiddenCals, calendars]
  );

  const eventsOnDay = (day) => visibleEvents.filter((e) => e.year === year && e.month === month + 1 && e.day === day);

  const openNew = (day) => {
    const d = day || selDay;
    setSelDay(d);
    setDraft(emptyDraft(d, year, month, organizePrefs));
    setPopover({ mode: "new", day: d });
  };

  const openEdit = (ev, e) => {
    e?.stopPropagation();
    const raw = ev._raw || ev;
    const start = new Date(raw.startsAt || ev.startsAt);
    const end = raw.endsAt || ev.endsAt ? new Date(raw.endsAt || ev.endsAt) : null;
    setDraft({
      id: ev.id,
      title: ev.title,
      date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
      startTime: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      endTime: end
        ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
        : `${String(Math.min(23, start.getHours() + 1)).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      place: ev.place || "",
      savedPlaceId: ev.savedPlaceId || raw.savedPlaceId || null,
      placeLat: ev.placeLat ?? raw.placeLat ?? null,
      placeLng: ev.placeLng ?? raw.placeLng ?? null,
      notes: ev.notes || "",
      category: ev.category || calendars[0]?.name || "일정",
      color: ev.color || eventColor(ev, organizePrefs),
      contactIds: ev.contactIds?.length ? ev.contactIds : ev.contactId ? [ev.contactId] : [],
      reminders: ev.reminders?.length ? ev.reminders : ["1시간 전"],
      startsAt: raw.startsAt,
      endsAt: raw.endsAt,
    });
    setPopover({ mode: "edit", day: ev.day });
  };

  const closePop = () => {
    setPopover(null);
    setDraft(null);
  };

  const saveDraft = async () => {
    if (!draft?.title?.trim()) {
      toastError("제목을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const [y, mo, d] = draft.date.split("-").map(Number);
      const [sh, sm] = draft.startTime.split(":").map(Number);
      const [eh, em] = draft.endTime.split(":").map(Number);
      const startsAt = new Date(y, mo - 1, d, sh || 9, sm || 0);
      const endsAt = new Date(y, mo - 1, d, eh || 10, em || 0);
      const body = {
        title: draft.title.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt > startsAt ? endsAt.toISOString() : null,
        place: draft.place.trim() || undefined,
        savedPlaceId: draft.savedPlaceId || undefined,
        placeLat: draft.placeLat ?? undefined,
        placeLng: draft.placeLng ?? undefined,
        notes: draft.notes.trim() || undefined,
        category: draft.category,
        color: draft.color,
        contactIds: draft.contactIds,
        reminders: draft.reminders,
      };
      if (draft.id) await api.updateEvent(draft.id, body);
      else await api.createEvent(body);
      toastSuccess(draft.id ? "일정을 수정했어요" : "일정을 추가했어요");
      closePop();
      reload();
    } catch (e) {
      notifyError(e, "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!draft?.id || !confirmDelete(draft.title || "일정")) return;
    try {
      await api.deleteEvent(draft.id);
      closePop();
      reload();
    } catch (e) {
      notifyError(e, "삭제 실패");
    }
  };

  const goToday = () => {
    const n = new Date();
    setViewMonth(monthStart(n));
    setSelDay(n.getDate());
  };

  const shiftMonth = (delta) => {
    setViewMonth((p) => {
      const n = new Date(p);
      n.setMonth(n.getMonth() + delta);
      return monthStart(n);
    });
  };

  const cells = monthCells(year, month);

  return (
    <div className="fade cal-wrap">
      <div className="cal-layout">
        <aside className="cal-sidebar">
          <div className="cal-mini-head">
            <button type="button" className="iconbtn" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{monthLabel}</span>
            <button type="button" className="iconbtn" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <div className="cal-mini-grid">
            {DOW.map((d) => (
              <span key={d} className="cal-mini-dow">
                {d}
              </span>
            ))}
            {cells.map((c, idx) => {
              const on = !c.muted && c.n === selDay;
              const isT = !c.muted && today.getFullYear() === year && today.getMonth() === month && today.getDate() === c.n;
              return (
                <button
                  key={idx}
                  type="button"
                  className={"cal-mini-cell" + (c.muted ? " muted" : "") + (on ? " sel" : "") + (isT ? " today" : "")}
                  disabled={c.muted}
                  onClick={() => c.n && setSelDay(c.n)}
                >
                  {c.n || ""}
                </button>
              );
            })}
          </div>
          <div className="cal-cal-list">
            <div className="small" style={{ fontWeight: 800, marginBottom: 8 }}>
              내 캘린더
            </div>
            {calendars.map((cal) => {
              const hidden = hiddenCals.has(cal.name);
              return (
                <label key={cal.id} className="cal-cal-item">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={() =>
                      setHiddenCals((p) => {
                        const n = new Set(p);
                        if (n.has(cal.name)) n.delete(cal.name);
                        else n.add(cal.name);
                        return n;
                      })
                    }
                  />
                  <span className="cal-dot" style={{ background: cal.color }} />
                  {cal.name}
                </label>
              );
            })}
          </div>
        </aside>

        <div className="cal-main">
          <div className="cal-toolbar pad row between">
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <div className="h-title" style={{ margin: 0 }}>
                {monthLabel}
              </div>
              <button type="button" className="chip" onClick={goToday}>
                오늘
              </button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="iconbtn" onClick={() => shiftMonth(-1)}>
                ‹
              </button>
              <button type="button" className="iconbtn" onClick={() => shiftMonth(1)}>
                ›
              </button>
              <button type="button" className="btn btn-accent" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => openNew(selDay)}>
                + 이벤트
              </button>
            </div>
          </div>

          <div className="pad cal-month">
            <div className="cal-mgrid head">
              {DOW.map((d, i) => (
                <div key={d} className={"cal-dow" + (i === 0 ? " sun" : "")}>
                  {d}
                </div>
              ))}
            </div>
            <div className="cal-mgrid body">
              {cells.map((c, idx) => {
                const dayEv = c.n ? eventsOnDay(c.n) : [];
                const isT = !c.muted && today.getFullYear() === year && today.getMonth() === month && today.getDate() === c.n;
                const isSel = !c.muted && c.n === selDay;
                return (
                  <div
                    key={idx}
                    className={"cal-cell" + (c.muted ? " muted" : "") + (isT ? " today" : "") + (isSel ? " sel" : "")}
                    onClick={() => {
                      if (c.n) {
                        setSelDay(c.n);
                        openNew(c.n);
                      }
                    }}
                  >
                    <div className="cal-daynum">{c.n || ""}</div>
                    <div className="cal-evlist">
                      {dayEv.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          className="cal-evpill"
                          style={{ background: eventColor(ev, organizePrefs) }}
                          onClick={(e) => openEdit(ev, e)}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {dayEv.length > 3 && <span className="cal-evmore">+{dayEv.length - 3}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pad cal-daylist">
            <div className="section-h" style={{ marginTop: 0 }}>
              {month + 1}월 {selDay}일
            </div>
            {eventsOnDay(selDay).length === 0 && (
              <div className="small" style={{ padding: "20px 0", textAlign: "center" }}>
                일정이 없어요 · 날짜를 눌러 추가하세요
              </div>
            )}
            {eventsOnDay(selDay).map((ev) => (
              <div key={ev.id} className="cal-dayrow" onClick={() => openDetail?.("event", ev)}>
                <span className="cal-daybar" style={{ background: eventColor(ev, organizePrefs) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
                  <div className="small">
                    {ev.time}
                    {ev.endTime ? `–${ev.endTime}` : ""}
                    {ev.place ? ` · ${ev.place}` : ""}
                  </div>
                </div>
                <button type="button" className="chip" style={{ fontSize: 12 }} onClick={(e) => openEdit(ev, e)}>
                  편집
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {popover && draft && (
        <EventPopover
          draft={draft}
          setDraft={setDraft}
          contacts={contacts}
          places={places}
          calendars={calendars}
          onSave={saveDraft}
          onDelete={deleteDraft}
          onClose={closePop}
          saving={saving}
          anchorDay={`${month + 1}월 ${popover.day}일`}
        />
      )}
    </div>
  );
}
