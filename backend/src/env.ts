import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const isDevelopment = !isProduction;
const envFile = nodeEnv === "production" ? ".env.production" : ".env.development";
const envPath = join(root, envFile);

if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  config({ path: join(root, ".env") });
}

const localPath = join(root, ".env.local");
if (existsSync(localPath)) config({ path: localPath, override: true });

function need(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${key}`);
  return v;
}

function parseBool(key: string, defaultValue: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "";
  if (raw.trim()) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (isProduction) {
    return [
      "https://storyahub.com",
      "https://www.storyahub.com",
      "https://app.storyahub.com",
      "https://record.storyahub.com",
    ];
  }
  return [];
}

function resolveJwtSecret(): string {
  const v = process.env.JWT_SECRET;
  const weak = new Set(["dev-secret", "dev-secret-change-me", "change-me", "secret"]);
  if (isProduction) {
    if (!v || v.length < 32 || weak.has(v)) {
      throw new Error("JWT_SECRET must be a random string of at least 32 characters in production");
    }
    return v;
  }
  return v ?? "dev-secret";
}

export const env = {
  nodeEnv,
  isProduction,
  isDevelopment,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: resolveJwtSecret(),
  corsOrigins: parseCorsOrigins(),
  trustProxy: parseBool("TRUST_PROXY", isProduction),
  allowDemoAuth: parseBool("ALLOW_DEMO_AUTH", isDevelopment),
  allowTestSubscribe: parseBool("ALLOW_TEST_SUBSCRIBE", isDevelopment),
  cookieDomain: process.env.COOKIE_DOMAIN || (isProduction ? ".storyahub.com" : undefined),
  bcryptRounds: isProduction ? 12 : 10,
  databaseUrl: need("DATABASE_URL", "postgresql://localhost:5432/storyahub"),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "storyahub-media",
    endpoint: process.env.R2_ENDPOINT ?? "",
    // development 기본 "dev/" → 버킷 내 dev/ 폴더. production 은 빈 문자열(루트)
    keyPrefix:
      process.env.R2_KEY_PREFIX ??
      (nodeEnv === "production" ? "" : "dev"),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  kakao: {
    restApiKey: process.env.KAKAO_REST_API_KEY ?? "",
  },
  trialDays: Number(process.env.TRIAL_DAYS ?? 3),
  graceDays: Number(process.env.GRACE_DAYS ?? 7),
  couponAdminSecret: process.env.COUPON_ADMIN_SECRET ?? "",
};
