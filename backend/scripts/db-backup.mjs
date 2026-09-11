#!/usr/bin/env node
/**
 * RDS 논리 백업 — 매일 한 번 통째로 떠서 R2 에 둔다.
 *
 * RDS 자동 백업(스냅샷·PITR)은 인스턴스가 살아 있을 때 쓰는 것이다.
 * 인스턴스가 통째로 사라지거나 계정에 문제가 생기면 같이 사라진다.
 * 그래서 다른 곳(R2)에 한 벌 더 둔다.
 *
 *   node scripts/db-backup.mjs            매일 크론이 부르는 자리
 *   node scripts/db-backup.mjs --list     지금 R2 에 뭐가 있는지
 *
 * 되돌리는 법은 scripts/RESTORE.md 에 적어 두었다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DIR = join(ROOT, "backups");
const KEEP_DAYS_R2 = 30;   // R2 에 남길 날 수
const KEEP_LOCAL = 5;      // EC2 에 남길 개수 — 급할 때 바로 집는 용도

/** .env.production 에서 한 줄만 읽는다. dotenv 를 끌어올 만한 일이 아니다. */
function envOf(name) {
  if (process.env[name]) return process.env[name];
  const file = readFileSync(join(ROOT, ".env.production"), "utf-8");
  const line = file.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).replace(/^["']|["']$/g, "").trim() : "";
}

function kst() {
  const d = new Date(Date.now() + 9 * 3600_000).toISOString();
  return { stamp: d.slice(0, 16).replace(/[-:T]/g, ""), day: d.slice(0, 10) };
}

function s3() {
  const c = new S3Client({
    region: "auto",
    endpoint: envOf("R2_ENDPOINT"),
    credentials: {
      accessKeyId: envOf("R2_ACCESS_KEY_ID"),
      secretAccessKey: envOf("R2_SECRET_ACCESS_KEY"),
    },
  });
  return { c, bucket: envOf("R2_BUCKET") || "storyahub-media" };
}

const PREFIX = "backups/db/";

async function list() {
  const { c, bucket } = s3();
  const out = [];
  let token;
  do {
    const r = await c.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of r.Contents ?? []) out.push(o);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => String(a.Key).localeCompare(String(b.Key)));
}

async function main() {
  if (process.argv.includes("--list")) {
    const rows = await list();
    if (!rows.length) return console.log("R2 에 백업이 없습니다");
    for (const o of rows) {
      console.log(`${o.Key}  ${(o.Size / 1048576).toFixed(1)}MB  ${o.LastModified.toISOString().slice(0, 16)}`);
    }
    console.log(`\n총 ${rows.length}개`);
    return;
  }

  const dbUrl = envOf("DATABASE_URL");
  if (!dbUrl) throw new Error("DATABASE_URL 을 찾지 못했습니다");

  const { stamp } = kst();
  mkdirSync(LOCAL_DIR, { recursive: true });
  const name = `storyahub-${stamp}.dump`;
  const path = join(LOCAL_DIR, name);

  // -Fc 는 압축된 커스텀 포맷이다. pg_restore 로 표 하나만 골라 되돌릴 수도 있다.
  console.log(`[db-backup] 뜨는 중 → ${name}`);
  execFileSync("pg_dump", ["-Fc", "--no-owner", "--no-acl", "-f", path, dbUrl], { stdio: "inherit" });
  const size = statSync(path).size;
  if (size < 100_000) throw new Error(`백업이 너무 작습니다 (${size}B) — 떠지지 않은 것으로 봅니다`);
  console.log(`[db-backup] ${(size / 1048576).toFixed(1)}MB`);

  const { c, bucket } = s3();
  if (!envOf("R2_ENDPOINT")) throw new Error("R2 설정이 없어 올리지 못했습니다");
  await c.send(new PutObjectCommand({
    Bucket: bucket, Key: PREFIX + name,
    Body: readFileSync(path), ContentType: "application/octet-stream",
  }));
  console.log(`[db-backup] R2 올림 ${PREFIX}${name}`);

  // 오래된 것 치우기 — R2
  const cut = Date.now() - KEEP_DAYS_R2 * 86400_000;
  const old = (await list()).filter((o) => o.LastModified.getTime() < cut);
  if (old.length) {
    await c.send(new DeleteObjectsCommand({
      Bucket: bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
    }));
    console.log(`[db-backup] 오래된 것 ${old.length}개 치움`);
  }

  // 오래된 것 치우기 — EC2 (최근 몇 개만 둔다)
  const local = readdirSync(LOCAL_DIR).filter((f) => f.endsWith(".dump")).sort();
  for (const f of local.slice(0, Math.max(0, local.length - KEEP_LOCAL))) {
    unlinkSync(join(LOCAL_DIR, f));
  }
  console.log("[db-backup] 끝");
}

/** 백업이 멈춘 줄 모르는 것이 제일 나쁘다 — 실패하면 채널톡에 알린다 */
async function yell(msg) {
  const key = envOf("CHANNELTALK_ACCESS_KEY");
  const secret = envOf("CHANNELTALK_ACCESS_SECRET");
  const gid = envOf("CHANNELTALK_GROUP_ID");
  if (!key || !secret || !gid) return;
  await fetch(`https://api.channel.io/open/v5/groups/${gid}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-key": key, "x-access-secret": secret },
    body: JSON.stringify({ blocks: [{ type: "text", value: `[DB 백업] 실패했습니다\n${msg}\n\nEC2 에서 확인해 주세요 — backend/backups/backup.log` }] }),
  }).catch(() => {});
}

main().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[db-backup] 실패:", msg);
  await yell(msg);
  process.exit(1);
});
