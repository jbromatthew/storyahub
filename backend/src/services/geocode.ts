import { env } from "../env.js";

export interface GeoPoint {
  lat: number;
  lng: number;
}

function addressQueries(address: string): string[] {
  const raw = address.trim();
  if (!raw) return [];

  const queries: string[] = [];
  const noZip = raw.replace(/^\d{5}\s*/, "").trim();
  queries.push(noZip);

  const parenBlocks = raw.match(/\(([^)]+)\)/g) || [];
  for (const block of parenBlocks) {
    const inner = block.replace(/[()]/g, "");
    for (const part of inner.split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
      if (part.length >= 2 && !/^\d/.test(part)) {
        queries.push(`${part} 서울`);
        queries.push(part);
      }
    }
  }

  const gu = noZip.match(/(\S+구)/)?.[1];
  const dong = noZip.match(/(\S+동)/)?.[1];
  if (gu && dong) queries.push(`${dong} ${gu} 서울`);

  return [...new Set(queries.filter(Boolean))];
}

async function geocodeKakao(query: string): Promise<GeoPoint | null> {
  const key = env.kakao.restApiKey;
  if (!key) return null;

  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) return null;

  const data: any = await res.json();
  const doc = data?.documents?.[0];
  if (!doc) return null;

  const lat = parseFloat(doc.y ?? doc.road_address?.y ?? doc.address?.y);
  const lng = parseFloat(doc.x ?? doc.road_address?.x ?? doc.address?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeNominatim(query: string): Promise<GeoPoint | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=kr`;
  const res = await fetch(url, { headers: { "User-Agent": "Storyahub/1.0 (contact-map)" } });
  if (!res.ok) return null;

  const data: any[] = await res.json();
  const hit = data?.[0];
  if (!hit) return null;

  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const queries = addressQueries(address);
  if (!queries.length) return null;

  for (const q of queries) {
    const kakao = await geocodeKakao(q);
    if (kakao) return kakao;
    const nom = await geocodeNominatim(q);
    if (nom) return nom;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}
