import rateLimit from "express-rate-limit";
import { env } from "../env.js";

const skipInDev = env.isDevelopment;

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 600 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipInDev,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipInDev,
  message: { error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요." },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.isProduction ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipInDev,
  message: { error: "업로드 한도를 초과했습니다. 잠시 후 다시 시도하세요." },
});

export const ocrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.isProduction ? 60 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipInDev,
  message: { error: "OCR 요청 한도를 초과했습니다." },
});

export const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 공개 페이지(정산·발주 포털 등)는 목록 조회 + 건별 OK 클릭이 많아 넉넉하게.
  // trust proxy 설정으로 IP별 버킷이므로 개인당 한도.
  max: env.isProduction ? 1000 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipInDev,
  message: { error: "요청이 너무 많습니다. 15분 후 다시 시도하세요." },
});
