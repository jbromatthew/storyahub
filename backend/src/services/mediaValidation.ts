import { isUserMediaKey } from "./r2.js";

export function assertUserMediaKey(key: unknown, userId: string, field = "mediaKey"): string {
  if (key == null || key === "") return "";
  const s = String(key);
  if (!isUserMediaKey(s, userId)) {
    throw Object.assign(new Error(`invalid ${field}`), { status: 400 });
  }
  return s;
}

export function assertUserMediaKeys(keys: unknown, userId: string, max = 20): string[] {
  if (!Array.isArray(keys)) return [];
  return keys
    .map(String)
    .filter(Boolean)
    .slice(0, max)
    .map((k) => assertUserMediaKey(k, userId, "mediaKey"));
}

export function optionalUserMediaKey(key: unknown, userId: string, field = "mediaKey"): string | null {
  if (key == null || key === "") return null;
  return assertUserMediaKey(key, userId, field) || null;
}
