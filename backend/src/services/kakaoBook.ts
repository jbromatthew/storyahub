import { env } from "../env.js";

export interface KakaoBookHit {
  title: string;
  authors: string[];
  publisher: string;
  isbn: string;
  thumbnail: string;
  contents: string;
  datetime: string;
  url: string;
}

export interface KakaoBookSearchResult {
  items: KakaoBookHit[];
  total: number;
  isEnd: boolean;
  page: number;
}

function mapDoc(doc: Record<string, unknown>): KakaoBookHit {
  const authors = Array.isArray(doc.authors) ? doc.authors.map(String) : [];
  return {
    title: String(doc.title ?? ""),
    authors,
    publisher: String(doc.publisher ?? ""),
    isbn: String(doc.isbn ?? "").split(/\s+/)[0] ?? "",
    thumbnail: String(doc.thumbnail ?? ""),
    contents: String(doc.contents ?? ""),
    datetime: String(doc.datetime ?? ""),
    url: String(doc.url ?? ""),
  };
}

/** 카카오 다음 검색 — 도서 https://developers.kakao.com/docs/latest/ko/daum-search/dev-guide#search-book */
export async function searchKakaoBooks(
  query: string,
  opts: { page?: number; size?: number } = {}
): Promise<KakaoBookSearchResult> {
  const q = query.trim();
  if (!q) return { items: [], total: 0, isEnd: true, page: 1 };

  const key = env.kakao.restApiKey;
  if (!key) {
    throw Object.assign(new Error("카카오 REST API 키가 설정되지 않았습니다 (KAKAO_REST_API_KEY)"), { status: 503 });
  }

  const page = Math.min(50, Math.max(1, opts.page ?? 1));
  const size = Math.min(20, Math.max(1, opts.size ?? 10));
  const url = new URL("https://dapi.kakao.com/v3/search/book");
  url.searchParams.set("query", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  url.searchParams.set("sort", "accuracy");

  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text || `카카오 책 검색 실패 (${res.status})`), { status: res.status >= 500 ? 502 : res.status });
  }

  const data = (await res.json()) as { meta?: Record<string, unknown>; documents?: Record<string, unknown>[] };
  const meta = data.meta ?? {};
  const items = (data.documents ?? []).map(mapDoc).filter((b) => b.title);

  return {
    items,
    total: Number(meta.total_count ?? items.length),
    isEnd: Boolean(meta.is_end ?? true),
    page,
  };
}
