/** 매년 반복 일정 — 보이는 기간에 맞춰 occurrence 전개 */

export interface EventLike {
  id: string;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  repeatYearly?: boolean;
  [key: string]: unknown;
}

export type ExpandedEvent<T extends EventLike> = T & {
  _occurrenceYear?: number;
  _series?: T;
};

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function overlapsRange(start: Date, end: Date, from: Date, to: Date): boolean {
  return start.getTime() <= to.getTime() && end.getTime() >= from.getTime();
}

export function expandYearlyInRange<T extends EventLike>(
  events: T[],
  from: Date,
  to: Date
): ExpandedEvent<T>[] {
  const out: ExpandedEvent<T>[] = [];

  for (const e of events) {
    const start = toDate(e.startsAt);
    const end = e.endsAt ? toDate(e.endsAt) : null;
    const durationMs = end ? end.getTime() - start.getTime() : 60 * 60 * 1000;

    if (!e.repeatYearly) {
      const effectiveEnd = end ?? start;
      if (overlapsRange(start, effectiveEnd, from, to)) out.push(e);
      continue;
    }

    const mo = start.getMonth();
    const day = start.getDate();
    const sh = start.getHours();
    const sm = start.getMinutes();
    const ss = start.getSeconds();

    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      const occStart = new Date(y, mo, day, sh, sm, ss);
      if (occStart.getMonth() !== mo || occStart.getDate() !== day) continue;
      const occEnd = end ? new Date(occStart.getTime() + durationMs) : null;
      const effectiveEnd = occEnd ?? occStart;
      if (!overlapsRange(occStart, effectiveEnd, from, to)) continue;

      const isAnchor =
        y === start.getFullYear() && Math.abs(occStart.getTime() - start.getTime()) < 1000;

      if (isAnchor) {
        out.push({ ...e, _occurrenceYear: y });
      } else {
        out.push({
          ...e,
          startsAt: occStart,
          endsAt: occEnd,
          _occurrenceYear: y,
          _series: e,
        });
      }
    }
  }

  return out.sort((a, b) => toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime());
}
