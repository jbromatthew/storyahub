import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { auth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { contactsRouter } from "./routes/contacts.js";
import { meetingsRouter } from "./routes/meetings.js";
import { todosRouter } from "./routes/todos.js";
import { dealsRouter } from "./routes/deals.js";
import { calendarRouter } from "./routes/calendar.js";
import { kbRouter } from "./routes/kb.js";
import { uploadsRouter, directUploadHandler } from "./routes/uploads.js";
import { ocrRouter } from "./routes/ocr.js";

const app = express();
app.use(cors());

// R2 직접 PUT 대신 서버 경유 (브라우저 CORS 이슈 방지) — JSON 파서보다 먼저
app.post(
  "/uploads/direct",
  auth,
  express.raw({ type: () => true, limit: "25mb" }),
  directUploadHandler
);

app.use(express.json({ limit: "15mb" })); // OCR base64 fallback 등

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/bootstrap", bootstrapRouter);
app.use("/contacts", contactsRouter);
app.use("/meetings", meetingsRouter);
app.use("/todos", todosRouter);
app.use("/deals", dealsRouter);
app.use("/calendar", calendarRouter);
app.use("/kb", kbRouter);
app.use("/uploads", uploadsRouter);
app.use("/ocr", ocrRouter);

app.listen(env.port, () => {
  console.log(`Storyahub API listening on http://localhost:${env.port}`);
  prisma
    .$connect()
    .then(() => console.log("PostgreSQL (RDS) connected"))
    .catch((e) => console.warn("PostgreSQL unreachable — check DATABASE_URL / RDS security group:", (e as Error).message));
});
