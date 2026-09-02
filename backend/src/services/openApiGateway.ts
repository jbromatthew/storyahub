/**
 * OPEN API 게이트웨이(BroJOpenAPI) 호출 래퍼.
 *
 * 마스터 API는 CRM 마스터 Bearer JWT(+선택 SessionToken)로 인증한다.
 * 접속 정보는 ErpOpenApiConfig 단일 행에 보관하고 ERP 설정 화면에서 넣는다.
 *
 * 주의: 문서상 발급/재발급/정지/폐기는 `/master/...`, 센터·요청 API는
 * `/BroJOpenAPI/v1/master/...`로 적혀 있다. 접두어 누락일 가능성이 높아
 * 접두어를 붙여 부르고 404면 접두어 없이 한 번 더 시도한다.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import { prisma } from "../db.js";

export type OpenApiConfig = {
  baseUrl: string;
  masterPrefix: string;
  masterToken: string;
  sessionToken: string;
  publicApiKey: string;
  updatedBy: string;
  updatedAt: Date | null;
};

const TIMEOUT_MS = 15_000;

export async function getOpenApiConfig(): Promise<OpenApiConfig> {
  const row = await prisma.erpOpenApiConfig.findUnique({ where: { id: "default" } });
  return {
    baseUrl: row?.baseUrl ?? "",
    masterPrefix: row?.masterPrefix ?? "/BroJOpenAPI/v1",
    masterToken: row?.masterToken ?? "",
    sessionToken: row?.sessionToken ?? "",
    publicApiKey: row?.publicApiKey ?? "",
    updatedBy: row?.updatedBy ?? "",
    updatedAt: row?.updatedAt ?? null,
  };
}

/** 토큰은 앞 6자만 남기고 가린다 — 화면·로그에 원문이 남지 않게 */
export function maskSecret(v: string): string {
  const s = String(v || "");
  if (!s) return "";
  if (s.length <= 10) return "•".repeat(s.length);
  return `${s.slice(0, 6)}${"•".repeat(8)}${s.slice(-4)}`;
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    if (n === "::1" || n.startsWith("fe80:") || n.startsWith("fc") || n.startsWith("fd")) return true;
  }
  return false;
}

/** SSRF 방지 — 설정에 사내망/로컬 주소를 넣어 서버를 대리 호출시키지 못하게 막는다 */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    fail("허용되지 않은 호스트입니다");
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    fail(`게이트웨이 주소를 찾을 수 없습니다 (${host})`, 502);
  }
  for (const { address } of addrs) if (isPrivateIp(address)) fail("허용되지 않은 호스트입니다");
}

export function normalizeBaseUrl(raw: string): string {
  const v = String(raw || "").trim().replace(/\/+$/, "");
  if (!v) fail("게이트웨이 주소가 설정되지 않았습니다. 설정 탭에서 먼저 입력하세요.");
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    fail("게이트웨이 주소 형식이 올바르지 않습니다 (예: https://openapi.broj.io)");
  }
  if (u.protocol !== "https:") fail("게이트웨이 주소는 https 여야 합니다");
  return v;
}

type CallOpts = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** 공개 API(/v1/groups 등) — 마스터 토큰 대신 API-KEY 헤더를 쓴다 */
  publicApi?: boolean;
};

async function once(url: string, headers: Record<string, string>, opts: CallOpts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      redirect: "manual",
    });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    fail(aborted ? "게이트웨이 응답이 없습니다 (15초 초과)" : "게이트웨이에 연결할 수 없습니다", 502);
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(base: string, path: string, query?: CallOpts["query"]): string {
  const u = new URL(base + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/**
 * 게이트웨이 호출. `path`는 마스터 접두어를 뺀 경로(예: "/master/api-keys").
 * 접두어를 붙여 호출하고 404가 나오면 접두어 없이 한 번 더 시도한다.
 */
export async function gatewayCall<T = unknown>(path: string, opts: CallOpts = {}): Promise<T> {
  const cfg = await getOpenApiConfig();
  const base = normalizeBaseUrl(cfg.baseUrl);
  await assertPublicHost(new URL(base).hostname);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (opts.publicApi) {
    if (!cfg.publicApiKey) fail("공개 API용 API-KEY가 설정되지 않았습니다");
    headers["API-KEY"] = cfg.publicApiKey;
  } else {
    if (!cfg.masterToken) fail("마스터 토큰이 설정되지 않았습니다. 설정 탭에서 먼저 입력하세요.");
    headers.Authorization = `Bearer ${cfg.masterToken}`;
    if (cfg.sessionToken) headers.SessionToken = cfg.sessionToken;
  }

  const prefix = opts.publicApi ? "" : (cfg.masterPrefix || "").replace(/\/+$/, "");
  const candidates = prefix ? [prefix + path, path] : [path];

  let res!: Response;
  for (let i = 0; i < candidates.length; i++) {
    res = await once(buildUrl(base, candidates[i], opts.query), headers, opts);
    // 접두어를 붙인 첫 시도가 404면 접두어 없는 경로로 한 번 더
    if (res.status !== 404 || i === candidates.length - 1) break;
  }

  const text = await res.text().catch(() => "");
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
      (typeof data === "string" && data.slice(0, 200)) ||
      `게이트웨이 오류 (${res.status})`;
    const hint =
      res.status === 401 ? " — 마스터 토큰이 만료되었을 수 있습니다. 설정에서 새로 넣어주세요."
      : res.status === 403 ? " — 이 토큰에 마스터 권한이 없습니다."
      : res.status === 404 ? " — 경로를 찾을 수 없습니다. 설정의 마스터 경로를 확인하세요."
      : "";
    fail(String(msg) + hint, res.status === 401 || res.status === 403 ? res.status : 502);
  }
  return data as T;
}

// ─── 마스터 API ────────────────────────────────────────────────────────────

export type IssuedKey = {
  api_key?: string;
  key_id?: string;
  key_prefix?: string;
  brand_id?: string;
  group_id?: string;
  expired_at?: string;
};

export type KeyStatus = { key_id?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" };

export type TenantSync = {
  key_id?: string;
  grade?: "BRAND" | "CENTER";
  group_scope_mode?: "EXPLICIT_GROUPS" | "ALL_BRAND_GROUPS";
  brand_ids?: string[];
  group_ids?: string[];
};

export function issueKey(body: {
  name: string;
  api_grade: string;
  brand_key?: number;
  group_key?: number;
  scopes?: string[];
  expired_at?: string;
}) {
  return gatewayCall<IssuedKey>("/master/api-keys", { method: "POST", body });
}

export function rotateKey(keyId: string) {
  return gatewayCall<IssuedKey>(`/master/api-keys/${encodeURIComponent(keyId)}/rotate`, { method: "POST" });
}

export function suspendKey(keyId: string) {
  return gatewayCall<KeyStatus>(`/master/api-keys/${encodeURIComponent(keyId)}/suspend`, { method: "PATCH" });
}

export function revokeKey(keyId: string) {
  return gatewayCall<KeyStatus>(`/master/api-keys/${encodeURIComponent(keyId)}/revoke`, { method: "PATCH" });
}

/** 센터 추가(병합) · 전체 교체 · 일부 삭제 — 셋 다 같은 경로에 메서드만 다르다 */
export function changeTenants(keyId: string, mode: "add" | "replace" | "remove", groupKeys: number[]) {
  const method = mode === "add" ? "PATCH" : mode === "replace" ? "PUT" : "DELETE";
  return gatewayCall<TenantSync>(`/master/api-keys/${encodeURIComponent(keyId)}/tenants`, {
    method,
    body: { group_keys: groupKeys },
  });
}

export type KeyRequestSummary = {
  key_request_no: string;
  status: string;
  center_name: string;
  service_name: string;
  applicant_name: string;
  applicant_email: string;
  created_at: string;
  updated_at: string;
};

export type KeyRequestPage = {
  content: KeyRequestSummary[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
};

export function listKeyRequests(q: { status?: string; search?: string; page?: number; size?: number }) {
  return gatewayCall<KeyRequestPage>("/master/api-key-requests", {
    query: { status: q.status, search: q.search, page: q.page ?? 0, size: q.size ?? 20 },
  });
}

export function getKeyRequest(keyRequestNo: string) {
  return gatewayCall<Record<string, unknown>>(`/master/api-key-requests/${encodeURIComponent(keyRequestNo)}`);
}

/** 공개 API — 센터 목록(공개 group_id 기준). group_key는 여기서 나오지 않는다. */
export function listGroups(q: { brand_id?: string; group_id?: string } = {}) {
  return gatewayCall<Record<string, string>[]>("/v1/groups", { publicApi: true, query: q });
}
