#!/usr/bin/env node
/**
 * stdin JSON: [{ name, sellPrice, cost, unit?, description? }]
 * Usage: node scripts/import-products.mjs user@email.com < products.json
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/import-products.mjs <email> [products.json]");
  process.exit(1);
}

const raw =
  process.argv[3] != null
    ? readFileSync(process.argv[3], "utf8")
    : readFileSync(0, "utf8");
const products = JSON.parse(raw);
if (!Array.isArray(products) || products.length === 0) {
  console.error("No products in input");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const existing = await prisma.product.findMany({
    where: { userId: user.id, active: true },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((p) => p.name.trim()));

  let created = 0;
  let skipped = 0;
  let sortOrder = existing.length;

  for (const p of products) {
    const name = String(p.name || "").trim();
    if (!name) continue;
    if (existingNames.has(name)) {
      skipped++;
      continue;
    }
    await prisma.product.create({
      data: {
        userId: user.id,
        name,
        unit: String(p.unit || "식").trim() || "식",
        sellPrice: Math.max(0, Math.round(Number(p.sellPrice) || 0)),
        cost: Math.max(0, Math.round(Number(p.cost) || 0)),
        description: p.description || null,
        active: true,
        sortOrder: sortOrder++,
      },
    });
    existingNames.add(name);
    created++;
  }

  console.log(JSON.stringify({ email, created, skipped, total: products.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
