import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { auth } from "./middleware/auth.js";
import { requireAccess } from "./middleware/requireAccess.js";
import {
  authLimiter,
  globalLimiter,
  ocrLimiter,
  shareLimiter,
  uploadLimiter,
} from "./middleware/rateLimit.js";
import { applySecurityMiddleware } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { couponsRouter } from "./routes/coupons.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { contactsRouter } from "./routes/contacts.js";
import { meetingsRouter } from "./routes/meetings.js";
import { todosRouter } from "./routes/todos.js";
import { dealsRouter } from "./routes/deals.js";
import { calendarRouter, calendarShareRouter } from "./routes/calendar.js";
import { calendarSyncRouter } from "./routes/calendarSync.js";
import { kbRouter } from "./routes/kb.js";
import { uploadsRouter, directUploadHandler } from "./routes/uploads.js";
import { placesRouter } from "./routes/places.js";
import { ocrRouter } from "./routes/ocr.js";
import { friendsRouter } from "./routes/friends.js";
import { sharesRouter } from "./routes/shares.js";
import { startPurgeScheduler } from "./services/purge.js";

const app = express();
applySecurityMiddleware(app);
app.use(cookieParser());
app.use(globalLimiter);

// R2 직접 PUT 대신 서버 경유 (브라우저 CORS 이슈 방지) — JSON 파서보다 먼저
app.post(
  "/uploads/direct",
  uploadLimiter,
  auth,
  requireAccess,
  express.raw({ type: () => true, limit: "150mb" }),
  directUploadHandler
);

app.use(express.json({ limit: "15mb" })); // OCR base64 fallback 등

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRouter);
app.use("/auth/coupons", couponsRouter);
app.use("/bootstrap", bootstrapRouter);
app.use("/contacts", contactsRouter);
app.use("/meetings", meetingsRouter);
app.use("/todos", todosRouter);
app.use("/deals", dealsRouter);
app.use("/calendar", calendarRouter);
app.use("/calendar/sync", calendarSyncRouter);
app.use("/calendar/share", shareLimiter, calendarShareRouter);
app.use("/kb", kbRouter);
app.use("/uploads", uploadLimiter, uploadsRouter);
app.use("/places", placesRouter);
app.use("/ocr", ocrLimiter, ocrRouter);
app.use("/friends", friendsRouter);
app.use("/shares", sharesRouter);

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err.message === "CORS blocked") {
    return res.status(403).json({ error: "허용되지 않은 출처입니다" });
  }
  next(err);
});

app.use((err: Error & { type?: string; status?: number; statusCode?: number }, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const tooLarge = err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413;
  if (tooLarge) {
    return res.status(413).json({ error: "파일이 너무 큽니다 (최대 150MB)" });
  }
  console.error("unhandled", err);
  res.status(500).json({ error: env.isProduction ? "서버 오류가 발생했습니다" : err.message || "서버 오류" });
});

app.listen(env.port, () => {
  console.log(`Storyahub API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  if (env.isProduction && !env.couponAdminSecret) {
    console.warn("COUPON_ADMIN_SECRET 미설정 — 쿠폰 관리 API 비활성");
  }
  prisma
    .$connect()
    .then(() => {
      console.log("PostgreSQL (RDS) connected");
      startPurgeScheduler();
    })
    .catch((e) => console.warn("PostgreSQL unreachable — check DATABASE_URL / RDS security group:", (e as Error).message));
});
