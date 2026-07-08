#!/usr/bin/env node
/**
 * 2023.03 ~ Raw 아카이브 1회 적재 (문의 시간 기준 월별 분리).
 * Usage: NODE_ENV=production node scripts/import-inquiry-raw.mjs [--force]
 */
import "./load-env.mjs";
import { PrismaClient } from "@prisma/client";
import {
  hasInquiryHistoricalData,
  importInquiryRawArchive,
} from "../dist/services/salesSync.js";

const force = process.argv.includes("--force");
const prisma = new PrismaClient();

async function main() {
  if (!force && (await hasInquiryHistoricalData())) {
    console.log("이미 과거 문의 데이터가 DB에 있습니다. 건너뜁니다. (--force 로 강제 재적재)");
    return;
  }
  console.log("2023.03 ~ Raw 아카이브 적재 시작...");
  const result = await importInquiryRawArchive();
  console.log("완료:", JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
