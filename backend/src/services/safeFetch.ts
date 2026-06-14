import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    if (n === "::1" || n.startsWith("fe80:") || n.startsWith("fc") || n.startsWith("fd")) return true;
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw Object.assign(new Error("허용되지 않은 호스트입니다"), { status: 400 });
  }

  const addrs = await lookup(host, { all: true });
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      throw Object.assign(new Error("허용되지 않은 호스트입니다"), { status: 400 });
    }
  }
}

/** SSRF 방지: 공개 HTTPS 이미지 URL만 허용 (KB 표지 등) */
export async function fetchPublicHttpsImage(url: string, maxBytes = MAX_IMAGE_BYTES): Promise<{ buffer: Buffer; contentType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error("URL 형식이 올바르지 않습니다"), { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    throw Object.assign(new Error("HTTPS URL만 허용됩니다"), { status: 400 });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error("URL 형식이 올바르지 않습니다"), { status: 400 });
  }

  await assertPublicHost(parsed.hostname);

  const res = await fetch(parsed.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "image/*" },
  });

  if (!res.ok) {
    throw Object.assign(new Error("이미지를 불러오지 못했습니다"), { status: 502 });
  }

  const finalUrl = res.url ? new URL(res.url) : parsed;
  if (finalUrl.protocol !== "https:") {
    throw Object.assign(new Error("리다이렉트 대상이 허용되지 않습니다"), { status: 400 });
  }
  await assertPublicHost(finalUrl.hostname);

  const ct = res.headers.get("content-type") ?? "";
  if (ct && !ct.startsWith("image/")) {
    throw Object.assign(new Error("이미지 파일이 아닙니다"), { status: 400 });
  }

  const len = res.headers.get("content-length");
  if (len && parseInt(len, 10) > maxBytes) {
    throw Object.assign(new Error("이미지가 너무 큽니다"), { status: 400 });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    throw Object.assign(new Error("이미지가 비어 있습니다"), { status: 400 });
  }
  if (buf.length > maxBytes) {
    throw Object.assign(new Error("이미지가 너무 큽니다"), { status: 400 });
  }

  return { buffer: buf, contentType: ct.startsWith("image/") ? ct.split(";")[0]!.trim() : "image/jpeg" };
}
