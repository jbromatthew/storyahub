import { env } from "../env.js";

export interface KakaoPlaceHit {
  kakaoPlaceId: string;
  name: string;
  category: string;
  categoryGroup: string;
  phone: string;
  address: string;
  roadAddress: string;
  lat: number;
  lng: number;
  placeUrl: string;
  distanceM: number | null;
}

export interface KakaoPlaceSearchResult {
  items: KakaoPlaceHit[];
  total: number;
  isEnd: boolean;
  page: number;
}

function mapDoc(doc: Record<string, unknown>): KakaoPlaceHit | null {
  const lat = parseFloat(String(doc.y ?? ""));
  const lng = parseFloat(String(doc.x ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const dist = doc.distance != null ? parseInt(String(doc.distance), 10) : null;
  return {
    kakaoPlaceId: String(doc.id ?? ""),
    name: String(doc.place_name ?? ""),
    category: String(doc.category_name ?? ""),
    categoryGroup: String(doc.category_group_code ?? ""),
    phone: String(doc.phone ?? ""),
    address: String(doc.address_name ?? ""),
    roadAddress: String(doc.road_address_name ?? ""),
    lat,
    lng,
    placeUrl: String(doc.place_url ?? ""),
    distanceM: Number.isFinite(dist) ? dist : null,
  };
}

function requireKey() {
  const key = env.kakao.restApiKey;
  if (!key) {
    throw Object.assign(new Error("카카오 REST API 키가 설정되지 않았습니다 (KAKAO_REST_API_KEY)"), { status: 503 });
  }
  return key;
}

async function fetchLocal(url: URL): Promise<KakaoPlaceSearchResult> {
  const key = requireKey();
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text || `카카오 장소 검색 실패 (${res.status})`), {
      status: res.status >= 500 ? 502 : res.status,
    });
  }

  const data = (await res.json()) as { meta?: Record<string, unknown>; documents?: Record<string, unknown>[] };
  const meta = data.meta ?? {};
  const page = Number(meta.pageable_count ? url.searchParams.get("page") ?? 1 : 1);
  const items = (data.documents ?? []).map(mapDoc).filter((x): x is KakaoPlaceHit => !!x && !!x.name);

  return {
    items,
    total: Number(meta.total_count ?? items.length),
    isEnd: Boolean(meta.is_end ?? true),
    page: Math.max(1, page),
  };
}

/** 키워드 검색 — https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword */
export async function searchKakaoPlacesKeyword(
  query: string,
  opts: { lat?: number; lng?: number; radius?: number; page?: number; size?: number } = {}
): Promise<KakaoPlaceSearchResult> {
  const q = query.trim();
  if (!q) return { items: [], total: 0, isEnd: true, page: 1 };

  const page = Math.min(45, Math.max(1, opts.page ?? 1));
  const size = Math.min(15, Math.max(1, opts.size ?? 10));
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  if (opts.lat != null && opts.lng != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    url.searchParams.set("x", String(opts.lng));
    url.searchParams.set("y", String(opts.lat));
    url.searchParams.set("radius", String(Math.min(20000, Math.max(100, opts.radius ?? 5000))));
    url.searchParams.set("sort", "distance");
  }

  return fetchLocal(url);
}

/** 카테고리 검색 — FD6 음식점, CE7 카페 */
export async function searchKakaoPlacesNearby(
  opts: { lat: number; lng: number; categoryGroup?: string; radius?: number; page?: number; size?: number }
): Promise<KakaoPlaceSearchResult> {
  const { lat, lng } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { items: [], total: 0, isEnd: true, page: 1 };
  }

  const page = Math.min(45, Math.max(1, opts.page ?? 1));
  const size = Math.min(15, Math.max(1, opts.size ?? 15));
  const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
  url.searchParams.set("category_group_code", opts.categoryGroup ?? "FD6");
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set("radius", String(Math.min(20000, Math.max(100, opts.radius ?? 3000))));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  url.searchParams.set("sort", "distance");

  return fetchLocal(url);
}
