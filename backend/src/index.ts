import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { auth } from "./middleware/auth.js";
import { requireAccess } from "./middleware/requireAccess.js";
import { authRouter } from "./routes/auth.js";
import { couponsRouter } from "./routes/coupons.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { contactsRouter } from "./routes/contacts.js";
import { meetingsRouter } from "./routes/meetings.js";
import { todosRouter } from "./routes/todos.js";
import { dealsRouter } from "./routes/deals.js";
import { calendarRouter, calendarShareRouter } from "./routes/calendar.js";
import { kbRouter } from "./routes/kb.js";
import { uploadsRouter, directUploadHandler } from "./routes/uploads.js";
import { placesRouter } from "./routes/places.js";
import { ocrRouter } from "./routes/ocr.js";
import { startPurgeScheduler } from "./services/purge.js";

const app = express();
app.use(cors());

// R2 직접 PUT 대신 서버 경유 (브라우저 CORS 이슈 방지) — JSON 파서보다 먼저
app.post(
  "/uploads/direct",
  auth,
  requireAccess,
  express.raw({ type: () => true, limit: "150mb" }),
  directUploadHandler
);

app.use(express.json({ limit: "15mb" })); // OCR base64 fallback 등

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/auth/coupons", couponsRouter);
app.use("/bootstrap", bootstrapRouter);
app.use("/contacts", contactsRouter);
app.use("/meetings", meetingsRouter);
app.use("/todos", todosRouter);
app.use("/deals", dealsRouter);
app.use("/calendar", calendarRouter);
app.use("/calendar/share", calendarShareRouter);
app.use("/kb", kbRouter);
app.use("/uploads", uploadsRouter);
app.use("/places", placesRouter);
app.use("/ocr", ocrRouter);

app.use((err: Error & { type?: string; status?: number; statusCode?: number }, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const tooLarge = err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413;
  if (tooLarge) {
    return res.status(413).json({ error: "파일이 너무 큽니다 (최대 150MB)" });
  }
  console.error("unhandled", err);
  res.status(500).json({ error: err.message || "서버 오류" });
});

app.listen(env.port, () => {
  console.log(`Storyahub API listening on http://localhost:${env.port}`);
  prisma
    .$connect()
    .then(() => {
      console.log("PostgreSQL (RDS) connected");
      startPurgeScheduler();
    })
    .catch((e) => console.warn("PostgreSQL unreachable — check DATABASE_URL / RDS security group:", (e as Error).message));
});
