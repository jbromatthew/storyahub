/** 당월 결제율 담당자 — Notion 선택지 순서·색상 고정 */
export const SALES_ASSIGNEES = [
  "Jay",
  "Owen",
  "Tae",
  "Sofia",
  "Hailey",
  "Dorosi",
  "Heum",
  "David",
  "Matthew",
  "Luke",
  "Jeff",
  "Jo",
  "미반영",
  "대기",
] as const;

export type AssigneeColor = { bg: string; fg: string };

export const ASSIGNEE_COLORS: Record<string, AssigneeColor> = {
  Jay: { bg: "#E8DEFF", fg: "#5B3E96" },
  Owen: { bg: "#D3F8DF", fg: "#1F6B3A" },
  Tae: { bg: "#2383E2", fg: "#FFFFFF" },
  Sofia: { bg: "#FFE2DD", fg: "#B85C3A" },
  Hailey: { bg: "#6B38C0", fg: "#FFFFFF" },
  Dorosi: { bg: "#D7BDE2", fg: "#512E5F" },
  Heum: { bg: "#5D4037", fg: "#FFFFFF" },
  David: { bg: "#9B2C2C", fg: "#FFFFFF" },
  Matthew: { bg: "#D6EAF8", fg: "#1A5276" },
  Luke: { bg: "#D5F5E3", fg: "#196F3D" },
  Jeff: { bg: "#2E4A4F", fg: "#FFFFFF" },
  Jo: { bg: "#FDEBD0", fg: "#935116" },
  미반영: { bg: "#F1F1EF", fg: "#55534E" },
  대기: { bg: "#FAEBDD", fg: "#C45500" },
  Dinah: { bg: "#E8DAEF", fg: "#6C3483" },
  Foy: { bg: "#B2DFDB", fg: "#004D40" },
  미지정: { bg: "#F1F1EF", fg: "#55534E" },
};

export function mergeAssigneeList(dynamic: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of SALES_ASSIGNEES) {
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  for (const name of dynamic) {
    const t = name.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
