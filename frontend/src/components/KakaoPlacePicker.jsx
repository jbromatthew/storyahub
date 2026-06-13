import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api/client.js";
import { formatDistanceKm } from "../mappers.js";
import { notifyError } from "../toast.js";

/** 캘린더·일정 등에서 카카오 로컬 API로 장소 검색 */
export default function KakaoPlacePicker({ onSelect, compact }) {
  const [q, setQ] = useState("");
  const [nearby, setNearby] = useState(false);
  const [myPos, setMyPos] = useState(null);
  const [geoErr, setGeoErr] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nearby) return;
    if (!navigator.geolocation) {
      setGeoErr("위치를 사용할 수 없어요");
      setNearby(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        setGeoErr("내 주변 검색은 위치 권한이 필요해요");
        setNearby(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, [nearby]);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.searchPlaces({
        q: q.trim() || (nearby ? "맛집" : ""),
        lat: nearby && myPos ? myPos.lat : undefined,
        lng: nearby && myPos ? myPos.lng : undefined,
        nearby: nearby && !!myPos,
      });
      setResults(res.items || []);
    } catch (e) {
      notifyError(e, "카카오맵 검색 실패");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [q, nearby, myPos]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (nearby && myPos) search();
      else if (q.trim().length >= 2) search();
      else setResults([]);
    }, 350);
    return () => clearTimeout(t);
  }, [q, nearby, myPos, search]);

  const pick = (hit) => {
    onSelect?.({
      name: hit.name,
      address: hit.roadAddress || hit.address || "",
      lat: hit.lat,
      lng: hit.lng,
      placeUrl: hit.placeUrl,
    });
  };

  return (
    <div className={"kakao-place-pick" + (compact ? " compact" : "")}>
      <input
        className="kakao-place-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="장소, 주소, 맛집 검색…"
        autoFocus
      />
      <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <button type="button" className={"chip" + (nearby ? " on" : "")} onClick={() => setNearby((v) => !v)}>
          내 주변
        </button>
        <button type="button" className="chip" onClick={search} disabled={loading}>
          {loading ? "검색 중…" : "검색"}
        </button>
      </div>
      {geoErr && <div className="small" style={{ marginBottom: 8, color: "var(--accent-deep)" }}>{geoErr}</div>}
      <div className="kakao-place-results">
        {results.length === 0 && !loading && (
          <div className="small" style={{ padding: "8px 2px", color: "var(--muted)" }}>
            {nearby && myPos ? "주변 장소를 불러오는 중이거나 결과가 없어요" : "2글자 이상 입력하거나 「내 주변」을 켜세요"}
          </div>
        )}
        {results.map((hit) => (
          <button
            key={hit.kakaoPlaceId || `${hit.name}-${hit.lat}`}
            type="button"
            className="kakao-place-hit"
            onClick={() => pick(hit)}
          >
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{hit.name}</div>
            <div className="small" style={{ marginTop: 3, lineHeight: 1.4 }}>
              {hit.roadAddress || hit.address}
              {hit.distanceM != null && ` · ${formatDistanceKm(hit.distanceM / 1000)}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
