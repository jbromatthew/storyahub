/** 연락처 동일인 판별용 — 이름+전화 정규화 */

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone?.trim()) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 10) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.startsWith("10") && digits.length === 10) {
    digits = `0${digits}`;
  }
  return digits;
}

export function normalizePersonName(name: string | null | undefined): string {
  return (name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** 이름+전화가 둘 다 있을 때만 키 생성 */
export function computeIdentityKey(
  person: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  const name = normalizePersonName(person);
  const tel = normalizePhone(phone);
  if (!name || !tel || tel.length < 9) return null;
  return `${name}|${tel}`;
}

export function identityMatches(
  a: { person?: string | null; phone?: string | null },
  b: { person?: string | null; phone?: string | null },
): boolean {
  const keyA = computeIdentityKey(a.person, a.phone);
  const keyB = computeIdentityKey(b.person, b.phone);
  return !!keyA && keyA === keyB;
}
