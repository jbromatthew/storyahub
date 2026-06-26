import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { syncAllCalendars, formatSyncToast, isDeviceCalendarAvailable } from "../calendarSync.js";
import { isNativeShell } from "../api/upload.js";
import { toastError, toastSuccess, notifyError } from "../toast.js";

export default function CalendarSyncSettings({ back }) {
  const [status, setStatus] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.getCalendarSyncStatus();
      setStatus(s);
      if (s?.google?.connected) {
        const list = await api.listGoogleCalendars();
        setCalendars(list || []);
      } else {
        setCalendars([]);
      }
    } catch (e) {
      notifyError(e, "연동 상태를 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const syncResult = params.get("calendarSync");
    if (!syncResult) return;
    params.delete("calendarSync");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
    if (syncResult === "google_ok") {
      toastSuccess("Google 캘린더 연결 완료");
      reload();
    } else if (syncResult === "error") {
      toastError("Google 캘린더 연결에 실패했어요");
    }
  }, [reload]);

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const { url } = await api.getGoogleCalendarConnectUrl();
      if (!url) throw new Error("연결 URL 없음");
      window.location.assign(url);
    } catch (e) {
      notifyError(e, "Google 연결을 시작할 수 없어요");
      setConnecting(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      await api.disconnectGoogleCalendar();
      toastSuccess("Google 캘린더 연결 해제");
      reload();
    } catch (e) {
      notifyError(e, "연결 해제 실패");
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAllCalendars();
      if (result.google?.error && result.apple?.error) {
        throw new Error(result.google.error);
      }
      toastSuccess(formatSyncToast(result));
      reload();
    } catch (e) {
      notifyError(e, "동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  const pickGoogleCalendar = async (cal) => {
    try {
      await api.setGoogleCalendar(cal.id, cal.name);
      toastSuccess(`동기화 캘린더: ${cal.name}`);
      reload();
    } catch (e) {
      notifyError(e, "캘린더 변경 실패");
    }
  };

  const google = status?.google || {};
  const googleReady = google.configured !== false;

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button type="button" className="iconbtn" onClick={back}>
          ←
        </button>
        <div className="h-eyebrow" style={{ marginTop: 0 }}>
          캘린더 연동
        </div>
        <div style={{ width: 42 }} />
      </div>

      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>양방향 동기화</div>
          <div className="small" style={{ marginTop: 8, lineHeight: 1.6, color: "var(--muted)" }}>
            Storyahub 일정 ↔ Google · Apple 캘린더를 맞춥니다. 변경 사항은 「지금 동기화」로 반영해요.
          </div>
          <button
            type="button"
            className="btn btn-accent"
            style={{ width: "100%", marginTop: 14, padding: 14 }}
            onClick={runSync}
            disabled={syncing || loading}
          >
            {syncing ? "동기화 중…" : "지금 동기화"}
          </button>
        </div>

        <div className="section-h">Google Calendar</div>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          {loading ? (
            <div className="small">불러오는 중…</div>
          ) : !googleReady ? (
            <div className="small" style={{ lineHeight: 1.6, color: "var(--muted)" }}>
              서버에 Google OAuth 설정이 필요해요. (GOOGLE_CLIENT_ID 등)
            </div>
          ) : google.connected ? (
            <>
              <div style={{ fontWeight: 600 }}>{google.calendarName || "연결됨"}</div>
              <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>
                {google.lastSyncedAt
                  ? `마지막 동기화 ${new Date(google.lastSyncedAt).toLocaleString("ko-KR")}`
                  : "아직 동기화 전"}
              </div>
              {calendars.length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <div className="small" style={{ marginBottom: 8, color: "var(--muted)" }}>
                    동기화할 Google 캘린더
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {calendars.map((cal) => (
                      <button
                        key={cal.id}
                        type="button"
                        className={`chip${google.calendarId === cal.id ? " on" : ""}`}
                        onClick={() => pickGoogleCalendar(cal)}
                      >
                        {cal.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: "100%", marginTop: 14, color: "var(--muted)" }}
                onClick={disconnectGoogle}
              >
                연결 해제
              </button>
            </>
          ) : (
            <>
              <div className="small" style={{ lineHeight: 1.6, color: "var(--muted)" }}>
                Google 계정을 연결하면 Storyahub 일정이 Google 캘린더와 맞춰져요.
              </div>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", marginTop: 14, background: "var(--ink)", color: "#fff" }}
                onClick={connectGoogle}
                disabled={connecting}
              >
                {connecting ? "연결 중…" : "Google 계정 연결"}
              </button>
            </>
          )}
        </div>

        <div className="section-h">Apple Calendar</div>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          {isDeviceCalendarAvailable() ? (
            <>
              <div style={{ fontWeight: 600 }}>iPhone · iPad</div>
              <div className="small" style={{ marginTop: 8, lineHeight: 1.6, color: "var(--muted)" }}>
                기기 캘린더에서 일정을 가져오고, Storyahub 일정은 「Storyahub」 캘린더에 저장해요.
                {isNativeShell() ? " 위 「지금 동기화」를 누르세요." : ""}
              </div>
            </>
          ) : (
            <div className="small" style={{ lineHeight: 1.6, color: "var(--muted)" }}>
              Apple 캘린더 양방향 동기화는 iOS 앱에서 사용할 수 있어요. 웹에서는 Google 연동만 가능합니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
