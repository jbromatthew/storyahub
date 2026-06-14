import type { Request, Response } from "express";
import { env } from "../env.js";

export const SESSION_COOKIE = "storyahub_session";

const MAX_AGE_REMEMBER_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_AGE_SESSION_MS = 12 * 60 * 60 * 1000;

function cookieBase() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  };
}

export function setSessionCookie(res: Response, token: string, remember: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieBase(),
    maxAge: remember ? MAX_AGE_REMEMBER_MS : MAX_AGE_SESSION_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieBase());
}

export function readSessionToken(req: Request): string | undefined {
  const raw = req.cookies?.[SESSION_COOKIE];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}
