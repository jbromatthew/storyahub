import cors from "cors";
import helmet from "helmet";
import type { Express } from "express";
import { env } from "../env.js";

export function applySecurityMiddleware(app: Express): void {
  app.set("trust proxy", env.trustProxy ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);

        // 1) 운영에서 명시한 allowlist 우선
        if (env.corsOrigins.includes(origin)) return cb(null, true);

        // 2) allowlist 설정이 누락/변경돼도 storyahub.com 서브도메인(record/app/api 등) 자체는 허용
        //    (Origin 헤더는 항상 scheme+host만 포함)
        if (/^https:\/\/([a-z0-9-]+\.)*storyahub\.com$/i.test(origin)) return cb(null, true);

        // 3) 개발 중 localhost 허용
        if (env.isDevelopment && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }

        cb(new Error("CORS blocked"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Secret", "X-Filename"],
      maxAge: 86400,
    })
  );

  app.disable("x-powered-by");
}
