import { prisma } from "../db.js";
import { env } from "../env.js";
import {
  fetchSheetColumnNames,
  fetchSheetRows,
  findInquiryRawSheetName,
  isGoogleSheetsConfigured,
  isHistoricalInquiryMonth,
  isInquiryRawSheetName,
  listInquiryMonthlySyncSheets,
  listMonthSheets,
  normalizeMonthSheetName,
  parseInquiryRowMonth,
  type SheetRow,
} from "./googleSheets.js";

export type SalesKind = "inquiry" | "order";

export type SyncResult = {
  kind: SalesKind;
  sheetName: string;
  spreadsheetId: string;
  added: number;
  updated: number;
  deleted: number;
  rowCount: number;
  /** Raw 시트 분리 동기화 시 반영된 월 수 */
  monthsSynced?: number;
};

function spreadsheetIdFor(kind: SalesKind): string {
  return kind === "inquiry"
    ? env.googleSheets.inquirySpreadsheetId
    : env.googleSheets.orderSpreadsheetId;
}

/**
 * 해당 월 데이터를 전부 지운 뒤 시트 내용으로 다시 넣는다.
 * (시트에서 수정/삭제/행 이동되어도 DB가 시트를 정확히 반영)
 */
async function replaceMonthRows(
  kind: SalesKind,
  spreadsheetId: string,
  sheetName: string,
  rows: SheetRow[]
): Promise<{ added: number; deleted: number }> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    let deleted = 0;
    const chunkSize = 500;

    if (kind === "inquiry") {
      const removed = await tx.erpSalesInquiry.deleteMany({
        where: { spreadsheetId, sheetName },
      });
      deleted = removed.count;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        if (!chunk.length) continue;
        await tx.erpSalesInquiry.createMany({
          data: chunk.map((row) => ({
            externalKey: row.externalKey,
            sheetName,
            spreadsheetId,
            sheetRow: row.sheetRow,
            data: row.data,
            syncedAt: now,
          })),
        });
      }
    } else {
      const removed = await tx.erpSalesOrder.deleteMany({
        where: { spreadsheetId, sheetName },
      });
      deleted = removed.count;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        if (!chunk.length) continue;
        await tx.erpSalesOrder.createMany({
          data: chunk.map((row) => ({
            externalKey: row.externalKey,
            sheetName,
            spreadsheetId,
            sheetRow: row.sheetRow,
            data: row.data,
            syncedAt: now,
          })),
        });
      }
    }

    return { added: rows.length, deleted };
  }, { timeout: 120_000, maxWait: 30_000 });
}

/**
 * 2023.03 ~ Raw: 문의 시간 기준 YYYY.MM.으로 분리해 각 월 DB를 덮어쓴다.
 * 2025.09.까지(2025.10. 이전)만 Raw에서 처리, 이후는 월별 탭 사용.
 */
async function syncInquiryRawSheet(
  rawSheetName: string,
  syncedById?: string
): Promise<SyncResult> {
  const spreadsheetId = spreadsheetIdFor("inquiry");
  const allRows = await fetchSheetRows(spreadsheetId, rawSheetName, "inquiry");
  const byMonth = new Map<string, SheetRow[]>();

  for (const row of allRows) {
    const month = parseInquiryRowMonth(row.data);
    if (!month || !isHistoricalInquiryMonth(month)) continue;
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }

  const now = new Date();
  let added = 0;
  let deleted = 0;

  await prisma.$transaction(async (tx) => {
    const existingMonths = await tx.erpSalesInquiry.findMany({
      where: { spreadsheetId },
      select: { sheetName: true },
      distinct: ["sheetName"],
    });
    const newMonths = new Set(byMonth.keys());

    for (const { sheetName } of existingMonths) {
      if (isHistoricalInquiryMonth(sheetName) && !newMonths.has(sheetName)) {
        const removed = await tx.erpSalesInquiry.deleteMany({
          where: { spreadsheetId, sheetName },
        });
        deleted += removed.count;
      }
    }

    for (const [sheetName, rows] of byMonth) {
      const removed = await tx.erpSalesInquiry.deleteMany({
        where: { spreadsheetId, sheetName },
      });
      deleted += removed.count;
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        if (!chunk.length) continue;
        await tx.erpSalesInquiry.createMany({
          data: chunk.map((row) => ({
            externalKey: row.externalKey,
            sheetName,
            spreadsheetId,
            sheetRow: row.sheetRow,
            data: row.data,
            syncedAt: now,
          })),
        });
        added += chunk.length;
      }
    }
  }, { timeout: 120_000, maxWait: 30_000 });

  const result: SyncResult = {
    kind: "inquiry",
    sheetName: rawSheetName,
    spreadsheetId,
    added,
    updated: 0,
    deleted,
    rowCount: allRows.length,
    monthsSynced: byMonth.size,
  };

  await prisma.erpSalesSyncLog.create({
    data: {
      kind: "inquiry",
      sheetName: rawSheetName,
      spreadsheetId,
      status: "success",
      added,
      updated: 0,
      deleted,
      rowCount: allRows.length,
      syncedById: syncedById ?? null,
    },
  });

  return result;
}

/** Raw 아카이브 1회 적재 (2025.09.까지 월별 분리). 동기화 UI에서는 사용하지 않음. */
export async function importInquiryRawArchive(syncedById?: string): Promise<SyncResult> {
  const spreadsheetId = spreadsheetIdFor("inquiry");
  const rawName = await findInquiryRawSheetName(spreadsheetId);
  if (!rawName) throw new Error("2023.03 ~ Raw 시트를 찾을 수 없습니다");
  return syncInquiryRawSheet(rawName, syncedById);
}

export async function hasInquiryHistoricalData(): Promise<boolean> {
  const spreadsheetId = spreadsheetIdFor("inquiry");
  const groups = await prisma.erpSalesInquiry.groupBy({
    by: ["sheetName"],
    where: { spreadsheetId },
  });
  return groups.some((g) => isHistoricalInquiryMonth(g.sheetName));
}

export async function syncSalesSheet(
  kind: SalesKind,
  sheetNameInput: string,
  syncedById?: string
): Promise<SyncResult> {
  if (!isGoogleSheetsConfigured()) {
    throw new Error(
      "Google Sheets 서비스 계정이 설정되지 않았습니다. GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE을 확인하세요."
    );
  }

  const trimmed = sheetNameInput.trim();
  if (kind === "inquiry" && isInquiryRawSheetName(trimmed)) {
    throw new Error("과거 Raw 데이터는 동기화 대상이 아닙니다. 데이터 보기에서 확인하세요.");
  }

  const sheetName = normalizeMonthSheetName(sheetNameInput);
  const spreadsheetId = spreadsheetIdFor(kind);

  let rows: SheetRow[] = [];
  let added = 0;
  let updated = 0;
  let deleted = 0;

  try {
    rows = await fetchSheetRows(spreadsheetId, sheetName, kind);
    const replaced = await replaceMonthRows(kind, spreadsheetId, sheetName, rows);
    added = replaced.added;
    deleted = replaced.deleted;
    // 덮어쓰기 방식이므로 updated는 사용하지 않음 (UI 호환을 위해 0 유지)

    await prisma.erpSalesSyncLog.create({
      data: {
        kind,
        sheetName,
        spreadsheetId,
        status: "success",
        added,
        updated,
        deleted,
        rowCount: rows.length,
        syncedById: syncedById ?? null,
      },
    });

    return { kind, sheetName, spreadsheetId, added, updated, deleted, rowCount: rows.length };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await prisma.erpSalesSyncLog.create({
      data: {
        kind,
        sheetName,
        spreadsheetId,
        status: "error",
        added,
        updated,
        deleted,
        rowCount: rows.length,
        errorMessage,
        syncedById: syncedById ?? null,
      },
    });
    throw e;
  }
}

export async function listAvailableMonthSheets(kind: SalesKind): Promise<string[]> {
  if (!isGoogleSheetsConfigured()) return [];
  const spreadsheetId = spreadsheetIdFor(kind);
  if (kind === "inquiry") return listInquiryMonthlySyncSheets(spreadsheetId);
  return listMonthSheets(spreadsheetId);
}

export async function getSalesSyncStatus() {
  const inquirySpreadsheetId = spreadsheetIdFor("inquiry");
  const orderSpreadsheetId = spreadsheetIdFor("order");

  const [inquirySheets, orderSheets, inquiryCounts, orderCounts, logs] = await Promise.all([
    listAvailableMonthSheets("inquiry").catch(() => [] as string[]),
    listAvailableMonthSheets("order").catch(() => [] as string[]),
    prisma.erpSalesInquiry.groupBy({
      by: ["sheetName"],
      _count: { _all: true },
      where: { spreadsheetId: inquirySpreadsheetId },
    }),
    prisma.erpSalesOrder.groupBy({
      by: ["sheetName"],
      _count: { _all: true },
      where: { spreadsheetId: orderSpreadsheetId },
    }),
    prisma.erpSalesSyncLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const inquiryCountMap = Object.fromEntries(
    inquiryCounts.map((c) => [c.sheetName, c._count._all])
  );
  const orderCountMap = Object.fromEntries(
    orderCounts.map((c) => [c.sheetName, c._count._all])
  );

  const lastLog = (kind: SalesKind, sheetName: string) =>
    logs.find((l) => l.kind === kind && l.sheetName === sheetName);

  const formatLog = (log: (typeof logs)[number] | undefined) =>
    log
      ? {
          status: log.status,
          at: log.createdAt,
          added: log.added,
          updated: log.updated,
          deleted: log.deleted,
          rowCount: log.rowCount,
          errorMessage: log.errorMessage,
        }
      : null;

  const buildMonths = (
    kind: SalesKind,
    sheets: string[],
    countMap: Record<string, number>
  ) => {
    const entries = new Map<
      string,
      {
        sheetName: string;
        dbCount: number;
        inSheet: boolean;
        syncable: boolean;
        isRawArchive: boolean;
        isHistorical: boolean;
        lastSync: ReturnType<typeof formatLog>;
      }
    >();

    for (const sheetName of sheets) {
      if (kind === "inquiry" && isInquiryRawSheetName(sheetName)) continue;
      entries.set(sheetName, {
        sheetName,
        dbCount: countMap[sheetName] ?? 0,
        inSheet: true,
        syncable: true,
        isRawArchive: false,
        isHistorical: false,
        lastSync: formatLog(lastLog(kind, sheetName)),
      });
    }

    if (kind === "inquiry") {
      for (const [sheetName, count] of Object.entries(countMap)) {
        if (entries.has(sheetName)) continue;
        if (!isHistoricalInquiryMonth(sheetName)) continue;
        entries.set(sheetName, {
          sheetName,
          dbCount: count,
          inSheet: false,
          syncable: false,
          isRawArchive: false,
          isHistorical: true,
          lastSync: formatLog(lastLog(kind, sheetName)),
        });
      }
    }

    return [...entries.values()].sort((a, b) => b.sheetName.localeCompare(a.sheetName));
  };

  return {
    configured: isGoogleSheetsConfigured(),
    inquiry: {
      spreadsheetId: inquirySpreadsheetId,
      months: buildMonths("inquiry", inquirySheets, inquiryCountMap),
    },
    order: {
      spreadsheetId: orderSpreadsheetId,
      months: buildMonths("order", orderSheets, orderCountMap),
    },
  };
}

export async function listSalesRows(
  kind: SalesKind,
  opts: { sheetName?: string; q?: string; page?: number; pageSize?: number }
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const skip = (page - 1) * pageSize;
  const spreadsheetId = spreadsheetIdFor(kind);
  const where: {
    spreadsheetId: string;
    sheetName?: string;
  } = { spreadsheetId };
  if (opts.sheetName) where.sheetName = normalizeMonthSheetName(opts.sheetName);

  if (kind === "inquiry") {
    let rows = await prisma.erpSalesInquiry.findMany({
      where,
      orderBy: [{ sheetName: "desc" }, { sheetRow: "asc" }],
    });
    if (opts.q?.trim()) {
      const q = opts.q.trim().toLowerCase();
      rows = rows.filter((r) => JSON.stringify(r.data).toLowerCase().includes(q));
    }
    const total = rows.length;
    const pageRows = rows.slice(skip, skip + pageSize);
    const columnOrder = await resolveColumnOrder(
      kind,
      spreadsheetId,
      opts.sheetName,
      pageRows.map((r) => r.data as Record<string, string>)
    );
    return {
      kind,
      page,
      pageSize,
      total,
      columns: collectColumns(
        pageRows.map((r) => r.data as Record<string, string>),
        columnOrder
      ),
      rows: pageRows.map((r) => ({
        id: r.id,
        sheetName: r.sheetName,
        sheetRow: r.sheetRow,
        externalKey: r.externalKey,
        syncedAt: r.syncedAt,
        data: r.data,
      })),
    };
  }

  let rows = await prisma.erpSalesOrder.findMany({
    where,
    orderBy: [{ sheetName: "desc" }, { sheetRow: "asc" }],
  });
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    rows = rows.filter((r) => JSON.stringify(r.data).toLowerCase().includes(q));
  }
  const total = rows.length;
  const pageRows = rows.slice(skip, skip + pageSize);
  const columnOrder = await resolveColumnOrder(
    kind,
    spreadsheetId,
    opts.sheetName,
    pageRows.map((r) => r.data as Record<string, string>)
  );
  return {
    kind,
    page,
    pageSize,
    total,
    columns: collectColumns(
      pageRows.map((r) => r.data as Record<string, string>),
      columnOrder
    ),
    rows: pageRows.map((r) => ({
      id: r.id,
      sheetName: r.sheetName,
      sheetRow: r.sheetRow,
      externalKey: r.externalKey,
      syncedAt: r.syncedAt,
      data: r.data,
    })),
  };
}

function isLegacyColumnKey(key: string): boolean {
  return /^_col_\d+$/.test(key);
}

async function resolveColumnOrder(
  kind: SalesKind,
  spreadsheetId: string,
  sheetName?: string,
  rows: Record<string, string>[] = []
): Promise<string[] | undefined> {
  if (!isGoogleSheetsConfigured() || !sheetName) return undefined;
  try {
    return await fetchSheetColumnNames(spreadsheetId, normalizeMonthSheetName(sheetName));
  } catch {
    return undefined;
  }
}

function collectColumns(
  rows: Record<string, string>[],
  preferredOrder?: string[]
): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  const add = (key: string) => {
    if (!key || isLegacyColumnKey(key) || seen.has(key)) return;
    seen.add(key);
    columns.push(key);
  };

  for (const key of preferredOrder ?? []) add(key);
  for (const row of rows) {
    for (const key of Object.keys(row || {})) add(key);
  }
  return columns;
}
