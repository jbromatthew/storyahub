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
  monthGridRange,
  formatCellDayLabel,
  formatEventWhen,
  eventOnDay,
  toDateInput,
  eventColor,
} from "../calendarUtils.js";
import { calendarList } from "../preferences.js";
import { toastError, toastSuccess, notifyError } from "../toast.js";
import { syncAllCalendars, formatSyncToast } from "../calendarSync.js";
import KakaoPlacePicker from "./KakaoPlacePicker.jsx";

const REM_OPTS = ["없음", "10분 전", "30분 전", "1시간 전", "1일 전"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function parseTimeToMins(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToTime(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function shiftEndWithDuration(newStart, prevStart, prevEnd) {
  const dur = Math.max(15, parseTimeToMins(prevEnd) - parseTimeToMins(prevStart)) || 60;
  return minsToTime(parseTimeToMins(newStart) + dur);
}

function emptyDraft(day, year, month, prefs) {
  const cals = calendarList(prefs);
  const first = cals[0];
  const startDate = toDateInput(year, month, day);
  return {
    id: null,
    title: "",
    startDate,
    endDate: startDate,
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
    repeatYearly: false,
  };
}

function EventPopover({ draft, setDraft, contacts, places, calendars, onSave, onDelete, onClose, saving, anchorDay, onStartRec }) {
  const [remOpen, setRemOpen] = useState(false);
  const [pickContact, setPickContact] = useState(false);
  const [pickPlace, setPickPlace] = useState(false);
  const [pickKakao, setPickKakao] = useState(false);
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
    setPickKakao(false);
  };

  const selectKakaoHit = (hit) => {
    const label = hit.address ? `${hit.name} · ${hit.address}` : hit.name;
    setDraft((prev) => ({
      ...prev,
      place: label,
      savedPlaceId: null,
      placeLat: hit.lat,
      placeLng: hit.lng,
    }));
    setPickKakao(false);
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
      const text = `${draft.title}\n${formatEventWhen({
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        time: draft.startTime,
        endTime: draft.endTime,
      })}${draft.place ? `\n${draft.place}` : ""}`;
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
        <button type="button" className="cal-pop-link" onClick={() => { setPickKakao((v) => !v); setPickPlace(false); }}>
          카카오맵에서 검색
          <span>{draft.placeLat != null && !draft.savedPlaceId ? "선택됨" : "검색"}</span>
        </button>
        {pickKakao && (
          <div className="cal-kakao-pick">
            <KakaoPlacePicker compact onSelect={selectKakaoHit} />
          </div>
        )}
        <button type="button" className="cal-pop-link" onClick={() => { setPickPlace((v) => !v); setPickKakao(false); }}>
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
        {draft.placeLat != null && (
          <button
            type="button"
            className="cal-pop-link"
            style={{ marginTop: -4 }}
            onClick={() => {
              const name = draft.place.split(" · ")[0] || draft.place;
              const url = kakaoDirectionsUrl({
                address: draft.place,
                lat: draft.placeLat,
                lng: draft.placeLng,
                label: name,
              });
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            카카오맵 길찾기 미리보기
            <span>→</span>
          </button>
        )}
        <div className="cal-pop-field">
          <div className="cal-pop-label">시작</div>
          <div className="cal-pop-field time-row" style={{ marginBottom: 0 }}>
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((p) => ({
                  ...p,
                  startDate: v,
                  endDate: p.endDate < v ? v : p.endDate,
                }));
              }}
            />
            <input
              type="time"
              value={draft.startTime}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((p) => ({
                  ...p,
                  startTime: v,
                  endTime:
                    p.startDate === p.endDate ? shiftEndWithDuration(v, p.startTime, p.endTime) : p.endTime,
                }));
              }}
            />
          </div>
        </div>
        <div className="cal-pop-field">
          <div className="cal-pop-label">종료</div>
          <div className="cal-pop-field time-row" style={{ marginBottom: 0 }}>
            <input
              type="date"
              value={draft.endDate}
              min={draft.startDate}
              onChange={(e) => setDraft((p) => ({ ...p, endDate: e.target.value }))}
            />
            <input
              type="time"
              value={draft.endTime}
              onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))}
            />
          </div>
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
        <label className="cal-repeat-row">
          <input
            type="checkbox"
            checked={!!draft.repeatYearly}
            onChange={(e) => setDraft((p) => ({ ...p, repeatYearly: e.target.checked }))}
          />
          <span>매년 반복</span>
          <span className="cal-repeat-hint">시작일 기준으로 같은 날짜·시간에 반복</span>
        </label>
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
        {anchorDay && <div className="small cal-pop-sub">{anchorDay}</div>}
        <div className="cal-pop-foot">
          {draft.id && onStartRec && (
            <button
              type="button"
              className="btn btn-ghost cal-pop-rec"
              onClick={() => {
                onStartRec({
                  id: draft.id,
                  title: draft.title,
                  contactIds: draft.contactIds || [],
                  contactId: draft.contactIds?.[0] || null,
                });
                onClose();
              }}
            >
              🎙 이 일정 미팅 녹음
            </button>
          )}
          <div className="cal-pop-primary-row">
            <button type="button" className="btn btn-ghost cal-pop-cancel" onClick={onClose}>
              취소
            </button>
            <button type="button" className="btn btn-accent cal-pop-save" onClick={onSave} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
          <div className="cal-pop-links">
            {draft.id && (
              <button type="button" className="cal-pop-link-btn" onClick={share} disabled={shareBusy}>
                공유
              </button>
            )}
            {draft.id && (
              <button type="button" className="cal-pop-link-btn danger" onClick={onDelete}>
                삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CalendarView({ openDetail, organizePrefs, onStartRecFromEvent, onRefresh }) {
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()));
  const [selDate, setSelDate] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth(), day: n.getDate() };
  });
  const [events, setEvents] = useState([]);
  const [hiddenCals, setHiddenCals] = useState(() => new Set());
  const [popover, setPopover] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = `${year}년 ${month + 1}월`;
  const today = new Date();
  const { cells, from: gridFrom, to: gridTo } = useMemo(() => monthGridRange(year, month), [year, month]);
  const contacts = getClients();
  const places = getPlaces();
  const calendars = calendarList(organizePrefs);

  const reload = useCallback(() => {
    return api
      .listEvents(gridFrom.toISOString(), gridTo.toISOString())
      .then((list) => setEvents((list || []).map(eventToUi)))
      .catch(() => setEvents([]));
  }, [gridFrom, gridTo]);

  useEffect(() => {
    reload();
  }, [reload]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAllCalendars();
      if (result.events?.length) {
        setEvents(result.events.map(eventToUi));
      } else {
        await reload();
      }
      toastSuccess(formatSyncToast(result));
    } catch (e) {
      notifyError(e, "캘린더 동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenCals.has(e.category || calendars[0]?.name || "일정")),
    [events, hiddenCals, calendars]
  );

  const eventsOnCell = useCallback(
    (cell) => {
      if (!cell?.n) return [];
      return visibleEvents.filter((e) => eventOnDay(e, cell));
    },
    [visibleEvents]
  );

  const selectedEvents = useMemo(() => {
    const cell = { year: selDate.year, month: selDate.month, n: selDate.day };
    return visibleEvents.filter((e) => eventOnDay(e, cell));
  }, [visibleEvents, selDate]);

  const openNew = (cell) => {
    const target = cell?.n
      ? { year: cell.year, month: cell.month, day: cell.n }
      : selDate;
    setSelDate(target);
    setDraft(emptyDraft(target.day, target.year, target.month, organizePrefs));
    setPopover({ mode: "new", day: target.day });
  };

  const openEdit = (ev, e) => {
    e?.stopPropagation();
    const master = ev._series || ev._raw?._series || ev._raw || ev;
    const raw = master._raw || master;
    const start = new Date(raw.startsAt || master.startsAt || ev.startsAt);
    const end = raw.endsAt || master.endsAt || ev.endsAt ? new Date(raw.endsAt || master.endsAt || ev.endsAt) : null;
    const startDate = toDateInput(start.getFullYear(), start.getMonth(), start.getDate());
    const endDate = end
      ? toDateInput(end.getFullYear(), end.getMonth(), end.getDate())
      : startDate;
    setDraft({
      id: ev.id,
      title: ev.title,
      startDate,
      endDate,
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
      repeatYearly: !!(raw.repeatYearly ?? master.repeatYearly ?? ev.repeatYearly),
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
      const [sy, smo, sd] = draft.startDate.split("-").map(Number);
      const [ey, emo, ed] = draft.endDate.split("-").map(Number);
      const [sh, sm] = draft.startTime.split(":").map(Number);
      const [eh, em] = draft.endTime.split(":").map(Number);
      const startsAt = new Date(sy, smo - 1, sd, sh || 9, sm || 0);
      const endsAt = new Date(ey, emo - 1, ed, eh ?? 10, em || 0);
      if (endsAt <= startsAt) {
        toastError("종료 일시는 시작 이후여야 합니다");
        setSaving(false);
        return;
      }
      const body = {
        title: draft.title.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        place: draft.place.trim() || undefined,
        savedPlaceId: draft.savedPlaceId || undefined,
        placeLat: draft.placeLat ?? undefined,
        placeLng: draft.placeLng ?? undefined,
        notes: draft.notes.trim() || undefined,
        category: draft.category,
        color: draft.color,
        contactIds: draft.contactIds,
        reminders: draft.reminders,
        repeatYearly: !!draft.repeatYearly,
      };
      if (draft.id) await api.updateEvent(draft.id, body);
      else await api.createEvent(body);
      toastSuccess(draft.id ? "일정을 수정했어요" : "일정을 추가했어요");
      closePop();
      await reload();
      onRefresh?.();
    } catch (e) {
      notifyError(e, "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!draft?.id || !(await confirmDelete(draft.title || "일정"))) return;
    try {
      await api.deleteEvent(draft.id);
      closePop();
      await reload();
      onRefresh?.();
    } catch (e) {
      notifyError(e, "삭제 실패");
    }
  };

  const goToday = () => {
    const n = new Date();
    setViewMonth(monthStart(n));
    setSelDate({ year: n.getFullYear(), month: n.getMonth(), day: n.getDate() });
  };

  const shiftMonth = (delta) => {
    setViewMonth((p) => {
      const n = new Date(p);
      n.setMonth(n.getMonth() + delta);
      const daysInNew = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      setSelDate((prev) => ({
        year: n.getFullYear(),
        month: n.getMonth(),
        day: Math.min(prev.day, daysInNew),
      }));
      return monthStart(n);
    });
  };

  const cellDow = (cell) => (cell?.n != null ? new Date(cell.year, cell.month, cell.n).getDay() : -1);
  const isCellToday = (cell) =>
    cell?.n &&
    today.getFullYear() === cell.year &&
    today.getMonth() === cell.month &&
    today.getDate() === cell.n;
  const isCellSelected = (cell) =>
    cell?.n &&
    selDate.year === cell.year &&
    selDate.month === cell.month &&
    selDate.day === cell.n;

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
              const on = isCellSelected(c);
              const isT = isCellToday(c);
              return (
                <button
                  key={idx}
                  type="button"
                  className={
                    "cal-mini-cell" +
                    (c.adjacent ? " adjacent" : "") +
                    (on ? " sel" : "") +
                    (isT ? " today" : "")
                  }
                  onClick={() => c.n && setSelDate({ year: c.year, month: c.month, day: c.n })}
                >
                  {c.n || ""}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="chip"
            style={{ width: "100%", marginTop: 12, padding: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--accent-deep)" }}
            onClick={runSync}
            disabled={syncing}
          >
            {syncing ? "동기화 중…" : "↻ 캘린더 동기화"}
          </button>
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
            <div className="row cal-toolbar-left" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="h-title" style={{ margin: 0 }}>
                {monthLabel}
              </div>
              <button type="button" className="chip" onClick={goToday}>
                오늘
              </button>
            </div>
            <div className="row cal-toolbar-nav" style={{ gap: 8 }}>
              <button type="button" className="iconbtn" onClick={() => shiftMonth(-1)}>
                ‹
              </button>
              <button type="button" className="iconbtn" onClick={() => shiftMonth(1)}>
                ›
              </button>
              <button type="button" className="btn btn-accent cal-toolbar-add" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => openNew()}>
                + 이벤트
              </button>
            </div>
          </div>

          <div className="pad cal-month">
            <div className="cal-mgrid head">
              {DOW.map((d, i) => (
                <div key={d} className={"cal-dow" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
                  {d}
                </div>
              ))}
            </div>
            <div className="cal-mgrid body">
              {cells.map((c, idx) => {
                const dayEv = eventsOnCell(c);
                const isT = isCellToday(c);
                const isSel = isCellSelected(c);
                const dow = cellDow(c);
                const badgeCls =
                  "cal-daybadge" +
                  (c.adjacent ? " adjacent" : "") +
                  (isT ? (c.n === 1 ? " is-today-wide" : " is-today") : "") +
                  (dow === 0 ? " sun" : dow === 6 ? " sat" : "");
                return (
                  <div
                    key={`${c.year}-${c.month}-${c.n}-${idx}`}
                    className={"cal-cell" + (c.adjacent ? " adjacent" : "") + (isT ? " today" : "") + (isSel ? " sel" : "")}
                    onClick={() => {
                      if (c.n) openNew(c);
                    }}
                  >
                    <div className="cal-daynum">
                      {c.n ? <span className={badgeCls}>{formatCellDayLabel(c)}</span> : null}
                    </div>
                    <div className="cal-evlist">
                      {dayEv.slice(0, 4).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          className="cal-evitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelDate({ year: c.year, month: c.month, day: c.n });
                            openDetail?.("event", ev);
                          }}
                        >
                          <span className="cal-evbar" style={{ background: eventColor(ev, organizePrefs) }} />
                          <span className="cal-evtext">{ev.repeatYearly ? "↻ " : ""}{ev.title}</span>
                        </button>
                      ))}
                      {dayEv.length > 4 && <span className="cal-evmore">+{dayEv.length - 4}개 더</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pad cal-daylist">
            <div className="section-h" style={{ marginTop: 0 }}>
              {selDate.month + 1}월 {selDate.day}일
            </div>
            {selectedEvents.length === 0 && (
              <div className="small" style={{ padding: "20px 0", textAlign: "center" }}>
                일정이 없어요 · 날짜를 눌러 추가하세요
              </div>
            )}
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="cal-dayrow" onClick={() => openDetail?.("event", ev)}>
                <span className="cal-daybar" style={{ background: eventColor(ev, organizePrefs) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
                  <div className="small">{formatEventWhen(ev)}{ev.place ? ` · ${ev.place}` : ""}</div>
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
          anchorDay={
            draft.startDate
              ? `${draft.startDate.replace(/-/g, ".")}${draft.endDate !== draft.startDate ? ` – ${draft.endDate.replace(/-/g, ".")}` : ""}`
              : ""
          }
          onStartRec={onStartRecFromEvent}
        />
      )}

      {!popover && (
      <button type="button" className="cal-fab btn btn-accent" onClick={() => openNew()} aria-label="일정 추가">
        + 이벤트
      </button>
      )}
    </div>
  );
}
