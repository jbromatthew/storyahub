import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { optionalUserMediaKey } from "../services/mediaValidation.js";

export const organizationsRouter = Router();
organizationsRouter.use(auth, requireAccess);

organizationsRouter.get("/", async (req: AuthedRequest, res) => {
  const orgs = await prisma.organization.findMany({
    where: { userId: req.userId! },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(orgs);
});

organizationsRouter.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const {
    id,
    name,
    bizNo,
    ceoName,
    address,
    phone,
    email,
    businessType,
    bankName,
    bankAccount,
    logoKey,
    sealKey,
    isDefault,
    sortOrder,
  } = req.body ?? {};

  let validatedLogoKey: string | null | undefined;
  if (logoKey !== undefined) {
    try {
      validatedLogoKey = optionalUserMediaKey(logoKey, userId, "logoKey");
    } catch {
      return res.status(400).json({ error: "로고 키가 올바르지 않습니다" });
    }
  }

  let validatedSealKey: string | null | undefined;
  if (sealKey !== undefined) {
    try {
      validatedSealKey = optionalUserMediaKey(sealKey, userId, "sealKey");
    } catch {
      return res.status(400).json({ error: "직인 키가 올바르지 않습니다" });
    }
  }

  if (id) {
    const existing = await prisma.organization.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: "not found" });

    if (isDefault === true) {
      await prisma.organization.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim() || existing.name;
    if (bizNo !== undefined) data.bizNo = bizNo || null;
    if (ceoName !== undefined) data.ceoName = ceoName || null;
    if (address !== undefined) data.address = address || null;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (businessType !== undefined) data.businessType = businessType || null;
    if (bankName !== undefined) data.bankName = bankName || null;
    if (bankAccount !== undefined) data.bankAccount = bankAccount || null;
    if (logoKey !== undefined) data.logoKey = validatedLogoKey;
    if (sealKey !== undefined) data.sealKey = validatedSealKey;
    if (isDefault !== undefined) data.isDefault = !!isDefault;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;

    const org = await prisma.organization.update({ where: { id }, data });
    return res.json(org);
  }

  const trimmed = String(name ?? "").trim();
  if (!trimmed) return res.status(400).json({ error: "회사명을 입력하세요" });

  if (isDefault) {
    await prisma.organization.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  const count = await prisma.organization.count({ where: { userId } });
  const org = await prisma.organization.create({
    data: {
      userId,
      name: trimmed,
      bizNo: bizNo || null,
      ceoName: ceoName || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      businessType: businessType || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      logoKey: validatedLogoKey ?? null,
      sealKey: validatedSealKey ?? null,
      isDefault: isDefault ?? count === 0,
      sortOrder: sortOrder ?? count,
    },
  });
  res.json(org);
});

organizationsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const org = await prisma.organization.findFirst({ where: { id: req.params.id, userId } });
  if (!org) return res.status(404).json({ error: "not found" });
  await prisma.organization.delete({ where: { id: org.id } });
  res.status(204).send();
});
