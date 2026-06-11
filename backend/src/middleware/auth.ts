import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

// 무상태 인증: 세션을 서버 메모리에 두지 않고 JWT로. (수평 확장 핵심)
export function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "no token" });
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

export function signToken(userId: string, remember = true): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: remember ? "90d" : "12h" });
}
