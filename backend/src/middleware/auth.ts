import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { readSessionToken } from "../services/sessionCookie.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

function extractToken(req: Request): string | undefined {
  const cookie = readSessionToken(req);
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

/** httpOnly 쿠키 우선, Bearer 헤더는 API 클라이언트·마이그레이션용 */
export function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const raw = extractToken(req);
  if (!raw) return res.status(401).json({ error: "no token" });
  try {
    const payload = jwt.verify(raw, env.jwtSecret, { algorithms: ["HS256"] }) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

export function signToken(userId: string, remember = true): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: remember ? "90d" : "12h", algorithm: "HS256" });
}
