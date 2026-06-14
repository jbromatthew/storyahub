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
        if (env.corsOrigins.includes(origin)) return cb(null, true);
        if (env.isDevelopment && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }
        cb(new Error("CORS blocked"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Secret"],
      maxAge: 86400,
    })
  );

  app.disable("x-powered-by");
}
