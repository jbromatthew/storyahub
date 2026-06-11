import dotenv from "dotenv";
dotenv.config();

function need(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${key}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: need("JWT_SECRET", "dev-secret"),
  databaseUrl: need("DATABASE_URL", "postgresql://localhost:5432/storyahub"),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "storyahub-media",
    endpoint: process.env.R2_ENDPOINT ?? "",
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
};
