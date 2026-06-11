import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeEnv = process.env.NODE_ENV ?? "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env.development";
const envPath = join(root, envFile);

if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  config({ path: join(root, ".env") });
}

// 로컬 오버라이드 (선택)
const localPath = join(root, ".env.local");
if (existsSync(localPath)) config({ path: localPath, override: true });
