import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

// 무상태 API 서버 — 커넥션 풀러(PgBouncer/RDS Proxy/Supavisor) 뒤에 두는 것을 권장.
export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
});
