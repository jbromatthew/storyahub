import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client.js";
import { getPlaces, setPlaces } from "../store.js";
import { placeToUi, placeGroups, haversineKm, formatDistanceKm, kakaoDirectionsUrl } from "../mappers.js";
import { tagColor } from "../preferences.js";
import { toastError, toastSuccess, notifyError } from "../toast.js";

function TagChip({ t }) {
  const c = tagColor(t);
  return <span className={"tag" + (c && c !== "accent" ? " " + c : "")}>{t}</span>;
}

function PlaceSearchSheet({ categories, onClose, onSaved }) {
  const [q, setQ] = useState("");
  const [nearby, setNearby] = useState(true);
  const [myPos, setMyPos] = useState(null);
  const [geoErr, setGeoErr] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null);
  const [category, setCategory] = useState(categories[0] || "미분류");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
  }, []);

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

  const save = async () => {
    if (!pick) return;
    setSaving(true);
    try {
      const place = await api.createPlace({
        name: pick.name,
        category,
        address: pick.address,
        roadAddress: pick.roadAddress,
        phone: pick.phone,
        lat: pick.lat,
        lng: pick.lng,
        kakaoPlaceId: pick.kakaoPlaceId,
        placeUrl: pick.placeUrl,
      });
      toastSuccess("맛집을 저장했어요");
      onSaved?.(placeToUi(place));
      onClose();
    } catch (e) {
      notifyError(e, "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="sheetbg" onClick={onClose}>
      <div className="sheet sheet-form" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflow: "auto" }}>
        <div className="sheetbar" />
        <div className="sheet-head">
          <h3>카카오맵에서 찾기</h3>
          <button type="button" className="sheet-x" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="sheet-field">
          <label htmlFor="place-q">검색</label>
          <input
            id="place-q"
            className="sheet-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="맛집, 카페, 강남역 …"
            autoFocus
          />
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <button type="button" className={"chip" + (nearby ? " on" : "")} onClick={() => setNearby((v) => !v)} disabled={!myPos}>
            내 주변
          </button>
          <button type="button" className="chip" onClick={search} disabled={loading}>
            {loading ? "검색 중…" : "다시 검색"}
          </button>
        </div>
        {geoErr && <div className="small" style={{ marginBottom: 10, color: "var(--accent-deep)" }}>{geoErr}</div>}

        {pick && (
          <div className="card" style={{ padding: 14, marginBottom: 14, border: "2px solid var(--accent)" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{pick.name}</div>
            <div className="small" style={{ marginTop: 4, lineHeight: 1.45 }}>
              {pick.roadAddress || pick.address}
              {pick.distanceM != null && ` · ${formatDistanceKm(pick.distanceM / 1000)}`}
            </div>
            <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>{pick.category}</div>
            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>저장 카테고리</div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {categories.map((c) => (
                  <button key={c} type="button" className={"chip" + (category === c ? " on" : "")} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn btn-accent" style={{ width: "100%", padding: 14, marginTop: 14 }} onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "저장하기"}
            </button>
          </div>
        )}

        <div style={{ marginTop: 4 }}>
          {results.length === 0 && !loading && (
            <div className="small" style={{ textAlign: "center", padding: "20px 0" }}>
              {nearby && myPos ? "주변 음식점을 불러오는 중이거나 결과가 없어요" : "2글자 이상 입력하거나 ‘내 주변’을 켜세요"}
            </div>
          )}
          {results.map((hit) => (
            <button
              key={hit.kakaoPlaceId || `${hit.name}-${hit.lat}`}
              type="button"
              className="list-item"
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                background: pick?.kakaoPlaceId === hit.kakaoPlaceId ? "var(--accent-soft)" : "transparent",
                cursor: "pointer",
                padding: "12px 4px",
                borderBottom: "1px solid var(--line)",
              }}
              onClick={() => setPick(hit)}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{hit.name}</div>
              <div className="small" style={{ marginTop: 3, lineHeight: 1.45 }}>
                {hit.roadAddress || hit.address}
                {hit.distanceM != null && ` · ${formatDistanceKm(hit.distanceM / 1000)}`}
              </div>
              <div className="small" style={{ marginTop: 2, color: "var(--muted)" }}>{hit.category}</div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function PlaceMap({ open, places }) {
  const [myPos, setMyPos] = useState(null);
  const [geoErr, setGeoErr] = useState("");
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoErr("이 기기에서는 위치를 사용할 수 없어요");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeoErr("내 위치를 쓰려면 위치 권한을 허용해주세요"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  const located = places.filter((p) => p.lat != null && p.lng != null);
  const withDist = located
    .map((p) => {
      const km = myPos ? haversineKm(myPos.lat, myPos.lng, p.lat, p.lng) : null;
      return { ...p, km };
    })
    .sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));

  const near = myPos ? withDist.filter((p) => p.km <= 10) : withDist;
  const mapCenter = myPos || (located[0] ? { lat: located[0].lat, lng: located[0].lng } : null);
  const spanKm = 2.5;

  useEffect(() => {
    if (!sel && near[0]) setSel(near[0]);
    else if (sel && !near.find((p) => p.id === sel.id) && near[0]) setSel(near[0]);
  }, [near.length, sel?.id]);

  const pinPos = (p) => {
    if (!mapCenter) return { left: "50%", top: "50%" };
    const dx = (p.lng - mapCenter.lng) * 111320 * Math.cos((mapCenter.lat * Math.PI) / 180);
    const dy = -(p.lat - mapCenter.lat) * 110540;
    const pxPerM = 140 / spanKm / 1000;
    const left = 50 + (dx * pxPerM) / 1.7;
    const top = 50 + (dy * pxPerM) / 1.7;
    return { left: `${Math.max(6, Math.min(94, left))}%`, top: `${Math.max(6, Math.min(94, top))}%` };
  };

  if (!places.length) {
    return <div className="pad small" style={{ textAlign: "center", padding: "40px 0" }}>맛집을 저장하면 지도에 표시돼요</div>;
  }

  return (
    <div className="fade">
      <div className="pad row between" style={{ gap: 8, marginTop: 14, color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>
        <span>저장한 장소 {located.length}곳</span>
        {myPos && near[0]?.km != null && <span className="tag green" style={{ fontSize: 11 }}>반경 10km</span>}
      </div>
      {geoErr && <div className="pad small" style={{ paddingTop: 0, color: "var(--accent-deep)" }}>{geoErr}</div>}
      <div className="mapwrap">
        {[1, 2].map((i) => (
          <div key={i} className="ring" style={{ width: `${i * 38}%`, height: `${i * 38}%` }}>
            <span className="ringlbl" style={{ top: -8 }}>
              {i === 1 ? "1km" : "2km"}
            </span>
          </div>
        ))}
        {myPos && (
          <>
            <div className="mypulse" />
            <div className="mydot" />
          </>
        )}
        {located.map((p) => {
          const pos = pinPos(p);
          const active = sel?.id === p.id;
          return (
            <div key={p.id} className="cpin" style={{ left: pos.left, top: pos.top }} onClick={() => setSel(p)}>
              <div
                className="cpinhead"
                style={{ background: active ? "var(--accent)" : "#E07A5F", width: active ? 38 : 34, height: active ? 38 : 34 }}
              >
                <span>{p.init}</span>
              </div>
            </div>
          );
        })}
      </div>
      {sel ? (
        <div className="pad" style={{ marginTop: 12, marginBottom: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="row between">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{sel.name}</div>
                <div className="small">{sel.category}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {sel.km != null && <span className="tag green">{formatDistanceKm(sel.km)}</span>}
                <span className="tag gray">{sel.category}</span>
              </div>
            </div>
            {sel.area && (
              <div className="small" style={{ marginTop: 10, lineHeight: 1.45 }}>
                📍 {sel.area}
              </div>
            )}
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1, padding: 12 }} onClick={() => open(sel)}>
                상세 보기
              </button>
              <button
                className="btn btn-accent"
                style={{ flex: 1, padding: 12 }}
                onClick={() => {
                  const url = kakaoDirectionsUrl({ address: sel.area, lat: sel.lat, lng: sel.lng, label: sel.name });
                  if (url) window.open(url, "_blank", "noopener");
                }}
              >
                길찾기
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pad small" style={{ textAlign: "center", padding: "20px 0 28px" }}>
          지도에서 핀을 선택하세요
        </div>
      )}
    </div>
  );
}

function PlaceDetail({ p, back, placeTags = [], onUpdated, onDeleted }) {
  const [tags, setTags] = useState(p.tags || []);
  const [notes, setNotes] = useState(p.notes || "");
  const [fav, setFav] = useState(!!p.fav);
  const [saving, setSaving] = useState(false);

  const save = async (patch) => {
    setSaving(true);
    try {
      const updated = await api.updatePlace(p.id, patch);
      const ui = placeToUi(updated);
      setPlaces(getPlaces().map((x) => (x.id === ui.id ? ui : x)));
      onUpdated?.(ui);
    } catch (e) {
      notifyError(e, "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (t) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setTags(next);
    save({ tags: next });
  };

  const toggleFav = () => {
    const next = !fav;
    setFav(next);
    save({ favorite: next });
  };

  const remove = async () => {
    if (!window.confirm(`"${p.name}"을(를) 삭제할까요?`)) return;
    try {
      await api.deletePlace(p.id);
      setPlaces(getPlaces().filter((x) => x.id !== p.id));
      toastSuccess("삭제했어요");
      onDeleted?.();
      back?.();
    } catch (e) {
      notifyError(e, "삭제 실패");
    }
  };

  return (
    <div className="fade">
      <div className="pad row between" style={{ marginTop: 8 }}>
        <button type="button" className="iconbtn" onClick={back}>
          ←
        </button>
        <button type="button" className="iconbtn" style={{ color: fav ? "var(--accent)" : "#CFC8BB" }} onClick={toggleFav}>
          ★
        </button>
      </div>
      <div className="pad" style={{ marginTop: 4 }}>
        <div className="h-eyebrow">맛집 · 장소</div>
        <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{p.name}</div>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="tag gray">{p.category}</span>
          {tags.map((t) => (
            <TagChip key={t} t={t} />
          ))}
        </div>
        {p.area && (
          <div className="small" style={{ marginTop: 14, lineHeight: 1.5 }}>
            📍 {p.area}
          </div>
        )}
        {p.phone && <div className="small" style={{ marginTop: 6 }}>📞 {p.phone}</div>}
        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button
            className="btn btn-accent"
            style={{ flex: 1, padding: 14 }}
            onClick={() => {
              const url = kakaoDirectionsUrl({ address: p.area, lat: p.lat, lng: p.lng, label: p.name });
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            카카오맵 길찾기
          </button>
          {p.placeUrl && (
            <button className="btn btn-ghost" style={{ flex: 1, padding: 14 }} onClick={() => window.open(p.placeUrl, "_blank", "noopener")}>
              장소 보기
            </button>
          )}
        </div>
        <div style={{ marginTop: 20 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
            태그
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {placeTags.map((t) => (
              <button key={t} type="button" className={"chip" + (tags.includes(t) ? " on" : "")} onClick={() => toggleTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
            메모
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => save({ notes })}
            placeholder="미팅 후기, 추천 메뉴…"
            rows={3}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--line)", fontFamily: "inherit", fontSize: 14 }}
          />
        </div>
        <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 20, color: "#B85C4A" }} onClick={remove} disabled={saving}>
          삭제
        </button>
      </div>
    </div>
  );
}

export default function PlacesView({ placePresets = {}, onRefresh }) {
  const PLACES = getPlaces();
  const categories = placePresets.categories || ["한식", "카페", "미팅용"];
  const placeTags = placePresets.tags || [];
  const GROUPS = placeGroups(PLACES);

  const [view, setView] = useState("list");
  const [group, setGroup] = useState("전체");
  const [tag, setTag] = useState("전체");
  const [onlyFav, setOnlyFav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [favs, setFavs] = useState(() => new Set(PLACES.filter((p) => p.fav).map((p) => p.id)));

  const allTags = ["전체", ...Array.from(new Set(PLACES.flatMap((p) => p.tags || [])))];
  let list = group === "전체" ? PLACES : PLACES.filter((p) => p.category === group);
  if (tag !== "전체") list = list.filter((p) => (p.tags || []).includes(tag));
  if (onlyFav) list = list.filter((p) => favs.has(p.id));

  const handleSaved = (ui) => {
    const exists = getPlaces().some((x) => x.id === ui.id);
    const next = exists ? getPlaces().map((x) => (x.id === ui.id ? ui : x)) : [ui, ...getPlaces()];
    setPlaces(next);
    setFavs((prev) => (ui.fav ? new Set(prev).add(ui.id) : prev));
    onRefresh?.();
  };

  if (detail) {
    return (
      <PlaceDetail
        p={detail}
        back={() => setDetail(null)}
        placeTags={placeTags}
        onUpdated={(ui) => {
          setDetail(ui);
          handleSaved(ui);
        }}
        onDeleted={() => setDetail(null)}
      />
    );
  }

  return (
    <div className="fade">
      <div className="pad" style={{ marginTop: 8 }}>
        <div className="h-eyebrow">카카오맵</div>
        <div className="row between">
          <div className="h-title">맛집 · 장소</div>
          <button className="iconbtn" style={{ color: "var(--accent-deep)" }} onClick={() => setSearchOpen(true)}>
            +
          </button>
        </div>
        <div className="small" style={{ marginTop: 6, lineHeight: 1.5 }}>
          주변 음식점을 저장하고, 미팅 전에 카카오맵으로 안내할 수 있어요.
        </div>
      </div>

      <div className="pad" style={{ marginTop: 14 }}>
        <div className="seg">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            리스트
          </button>
          <button className={view === "map" ? "on" : ""} onClick={() => setView("map")}>
            지도
          </button>
        </div>
      </div>

      {view === "map" ? (
        <PlaceMap open={setDetail} places={PLACES} />
      ) : (
        <>
          <div className="pad row" style={{ gap: 8, marginTop: 14, overflowX: "auto" }}>
            {GROUPS.map((g) => (
              <button key={g} className={"chip" + (group === g ? " on" : "")} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          <div className="pad row" style={{ gap: 7, marginTop: 9, overflowX: "auto", alignItems: "center" }}>
            <span className="small" style={{ flex: "0 0 auto", fontWeight: 700 }}>
              태그
            </span>
            {allTags.map((t) => (
              <button key={t} onClick={() => setTag(t)} style={{ flex: "0 0 auto", border: "none", background: "none", cursor: "pointer", padding: 0, opacity: tag === t ? 1 : 0.5 }}>
                {t === "전체" ? <span className={"chip" + (tag === "전체" ? " on" : "")}>전체</span> : <TagChip t={t} />}
              </button>
            ))}
          </div>
          <div className="pad row" style={{ gap: 8, marginTop: 9 }}>
            <button className={"chip" + (onlyFav ? " on" : "")} onClick={() => setOnlyFav((v) => !v)}>
              ★ 즐겨찾기
            </button>
            <button className="chip" onClick={() => setSearchOpen(true)}>
              카카오맵 검색
            </button>
          </div>
          <div className="pad" style={{ marginTop: 14 }}>
            <div className="card" style={{ padding: "4px 16px" }}>
              {list.map((p) => (
                <div key={p.id} className="list-item row between" onClick={() => setDetail(p)} style={{ cursor: "pointer" }}>
                  <div className="row" style={{ gap: 11, minWidth: 0 }}>
                    <div className="avatar" style={{ background: "#FFF0EB", color: "#C45C3E" }}>
                      {p.init}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                      <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.area || "주소 없음"}
                      </div>
                      <div className="row" style={{ gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                        <span className="tag gray" style={{ fontSize: 10.5 }}>
                          {p.category}
                        </span>
                        {(p.tags || []).map((t) => (
                          <TagChip key={t} t={t} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)" }}>›</span>
                </div>
              ))}
              {list.length === 0 && (
                <div className="small" style={{ textAlign: "center", padding: "24px 0" }}>
                  {onlyFav ? "즐겨찾기한 장소가 없어요" : "저장한 맛집이 없어요 · + 로 검색해 보세요"}
                </div>
              )}
            </div>
            <div className="small" style={{ textAlign: "center", marginTop: 16 }}>
              {list.length}곳
            </div>
          </div>
        </>
      )}

      {searchOpen && (
        <PlaceSearchSheet categories={categories} onClose={() => setSearchOpen(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
