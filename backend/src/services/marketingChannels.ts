export type ChannelNode = {
  id: string;
  label: string;
  /** 시트 마케팅채널·유입처 컬럼에 나올 수 있는 값 */
  match?: string[];
  children?: ChannelNode[];
};

export const MARKETING_CHANNEL_TREE: ChannelNode[] = [
  {
    id: "organic",
    label: "오가닉",
    children: [
      {
        id: "search_naver",
        label: "검색_네이버",
        match: ["검색_네이버"],
        children: [
          { id: "naver_powerlink", label: "파워링크", match: ["파워링크"] },
          { id: "naver_smartstore", label: "스마트스토어", match: ["스마트스토어"] },
          { id: "naver_place", label: "플레이스", match: ["플레이스"] },
          { id: "naver_tv", label: "네이버TV", match: ["네이버TV"] },
          { id: "naver_paid", label: "유료기사", match: ["유료기사"] },
          { id: "naver_experience", label: "체험단", match: ["체험단"] },
        ],
      },
      { id: "search_google", label: "검색_구글", match: ["검색_구글"] },
      {
        id: "posting_blog",
        label: "포스팅_블로그",
        match: ["포스팅_블로그"],
        children: [
          { id: "blog_naver", label: "네이버_공식", match: ["네이버_공식"] },
          { id: "blog_tistory", label: "티스토리_공식", match: ["티스토리_공식"] },
        ],
      },
      {
        id: "posting_sns",
        label: "포스팅_SNS",
        match: ["포스팅_SNS"],
        children: [
          { id: "sns_fb", label: "FB", match: ["FB", "Facebook"] },
          { id: "sns_ig", label: "Instagram", match: ["Instagram", "인스타그램"] },
          { id: "sns_thread", label: "Thread", match: ["Thread", "스레드"] },
        ],
      },
      { id: "posting_youtube", label: "포스팅_유튜브", match: ["포스팅_유튜브"] },
      { id: "comm_helgwanmo", label: "커뮤_헬관모", match: ["커뮤_헬관모"] },
      { id: "comm_spodream", label: "커뮤_스포드림", match: ["커뮤_스포드림"] },
      { id: "comm_hohoyoga", label: "커뮤_호호요가", match: ["커뮤_호호요가"] },
      { id: "comm_pilamoa", label: "커뮤_필라모아", match: ["커뮤_필라모아"] },
      { id: "comm_abcboxing", label: "커뮤_ABC복싱카페", match: ["커뮤_ABC복싱카페"] },
      { id: "referral", label: "지인소개", match: ["지인소개"] },
      { id: "branch_add", label: "지점추가", match: ["지점추가"] },
      { id: "transfer", label: "양도/양수", match: ["양도/양수", "양도양수"] },
      { id: "offline_expo", label: "오프_전시회", match: ["오프_전시회"] },
      { id: "partner", label: "협력업체", match: ["협력업체"] },
    ],
  },
  {
    id: "non_organic",
    label: "비오가닉",
    children: [
      { id: "display_naver", label: "디스플레이_네이버", match: ["디스플레이_네이버"] },
      { id: "display_google", label: "디스플레이_구글", match: ["디스플레이_구글"] },
      { id: "meta_ads", label: "Meta 광고", match: ["Meta 광고", "Meta광고", "메타 광고"] },
      { id: "daangn", label: "당근마켓", match: ["당근마켓"] },
      { id: "non_organic_other", label: "기타", match: ["기타"] },
    ],
  },
  {
    id: "outbound",
    label: "아웃바운드",
    children: [
      { id: "cold_mail", label: "콜드메일", match: ["콜드메일"] },
      { id: "up_crm", label: "업_CRM 광고", match: ["업_CRM 광고", "업_CRM광고"] },
      { id: "up_sms", label: "업_문자", match: ["업_문자"] },
      { id: "up_mail", label: "업_우편", match: ["업_우편"] },
    ],
  },
];

const CHANNEL_FIELD_KEYS = ["마케팅채널", "유입처", "유입처 상세", "채널상세", "채널"];

type FlatNode = ChannelNode & { parentId?: string };

function walkTree(nodes: ChannelNode[], parentId?: string, out: FlatNode[] = []): FlatNode[] {
  for (const n of nodes) {
    out.push({ ...n, parentId });
    if (n.children?.length) walkTree(n.children, n.id, out);
  }
  return out;
}

const FLAT = walkTree(MARKETING_CHANNEL_TREE);
const NODE_MAP = new Map(FLAT.map((n) => [n.id, n]));

function matchValuesForNode(node: ChannelNode): string[] {
  const vals = new Set<string>([node.label, ...(node.match ?? [])]);
  for (const c of node.children ?? []) {
    for (const v of matchValuesForNode(c)) vals.add(v);
  }
  return [...vals];
}

export function channelTreeForApi() {
  return MARKETING_CHANNEL_TREE;
}

export function expandChannelSelection(selectedIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of selectedIds) {
    const node = NODE_MAP.get(id);
    if (!node) continue;
    for (const v of matchValuesForNode(node)) out.add(v);
  }
  return out;
}

export function channelValuesFromRow(data: Record<string, string>): string[] {
  const vals: string[] = [];
  for (const key of CHANNEL_FIELD_KEYS) {
    const v = String(data[key] ?? "").trim();
    if (v) vals.push(v);
  }
  return vals;
}

export function matchesChannelSelection(selectedIds: string[] | undefined, data: Record<string, string>): boolean {
  if (!selectedIds?.length) return true;
  const patterns = expandChannelSelection(selectedIds);
  const rowVals = channelValuesFromRow(data);
  if (!rowVals.length) return false;
  return rowVals.some((rv) => {
    for (const p of patterns) {
      if (rv === p || rv.includes(p) || p.includes(rv)) return true;
    }
    return false;
  });
}

/** @deprecated legacy organic/non-organic filter */
export function matchesLegacyChannel(
  channel: "all" | "organic" | "non-organic",
  data: Record<string, string>
): boolean {
  if (channel === "all") return true;
  const organicIds = ["organic"];
  const nonOrganicIds = ["non_organic"];
  const ids = channel === "organic" ? organicIds : nonOrganicIds;
  return matchesChannelSelection(ids, data);
}
