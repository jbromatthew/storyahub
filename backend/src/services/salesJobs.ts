import {
  listAvailableMonthSheets,
  syncSalesSheet,
  type SalesKind,
  type SyncResult,
} from "./salesSync.js";

export type SalesJobStatus = "queued" | "running" | "success" | "error";

export type SalesJobProgress = {
  currentSheet: string | null;
  completedSheets: number;
  totalSheets: number;
  results: SyncResult[];
  errors: { sheetName: string; error: string }[];
};

export type SalesJob = {
  id: string;
  kind: SalesKind;
  mode: "one" | "all";
  sheetName: string | null;
  status: SalesJobStatus;
  progress: SalesJobProgress;
  errorMessage: string | null;
  createdById: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

const JOB_TTL_MS = 1000 * 60 * 60 * 6;
const jobs = new Map<string, SalesJob>();
const runningByKey = new Map<string, string>();

function nowIso() {
  return new Date().toISOString();
}

function cleanupOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (new Date(job.createdAt).getTime() < cutoff) jobs.delete(id);
  }
}

function makeId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function runKey(kind: SalesKind) {
  return kind;
}

function toPublic(job: SalesJob) {
  return {
    id: job.id,
    kind: job.kind,
    mode: job.mode,
    sheetName: job.sheetName,
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

async function runJob(job: SalesJob, sheets: string[]) {
  job.status = "running";
  job.startedAt = nowIso();
  job.progress.totalSheets = sheets.length;
  job.progress.completedSheets = 0;

  for (const sheetName of sheets) {
    job.progress.currentSheet = sheetName;
    try {
      const result = await syncSalesSheet(job.kind, sheetName, job.createdById ?? undefined);
      job.progress.results.push(result);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      job.progress.errors.push({ sheetName, error });
    }
    job.progress.completedSheets += 1;
  }

  job.progress.currentSheet = null;
  job.finishedAt = nowIso();
  if (job.progress.errors.length === 0) {
    job.status = "success";
  } else if (job.progress.results.length === 0) {
    job.status = "error";
    job.errorMessage = job.progress.errors.map((x) => `${x.sheetName}: ${x.error}`).join("\n");
  } else {
    job.status = "error";
    job.errorMessage = `${job.progress.errors.length}개 월 동기화 실패`;
  }
}

export function getSalesJob(id: string) {
  cleanupOldJobs();
  const job = jobs.get(id);
  return job ? toPublic(job) : null;
}

export function listActiveSalesJobs(kind?: SalesKind) {
  cleanupOldJobs();
  return [...jobs.values()]
    .filter((j) => (kind ? j.kind === kind : true))
    .filter((j) => j.status === "queued" || j.status === "running")
    .map(toPublic);
}

export async function enqueueSalesSyncJob(opts: {
  kind: SalesKind;
  mode: "one" | "all";
  sheetName?: string;
  createdById?: string;
}) {
  cleanupOldJobs();
  const key = runKey(opts.kind);
  const existingId = runningByKey.get(key);
  if (existingId) {
    const existing = jobs.get(existingId);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      const err = new Error(`${opts.kind === "inquiry" ? "상품 문의" : "결제 주문"} 동기화가 이미 진행 중입니다`);
      (err as Error & { status?: number; job?: ReturnType<typeof toPublic> }).status = 409;
      (err as Error & { job?: ReturnType<typeof toPublic> }).job = toPublic(existing);
      throw err;
    }
  }

  let sheets: string[] = [];
  if (opts.mode === "one") {
    if (!opts.sheetName) throw new Error("sheetName이 필요합니다");
    sheets = [opts.sheetName];
  } else {
    sheets = await listAvailableMonthSheets(opts.kind);
    if (sheets.length === 0) throw new Error("동기화할 월별 시트가 없습니다");
  }

  const job: SalesJob = {
    id: makeId(),
    kind: opts.kind,
    mode: opts.mode,
    sheetName: opts.mode === "one" ? opts.sheetName! : null,
    status: "queued",
    progress: {
      currentSheet: null,
      completedSheets: 0,
      totalSheets: sheets.length,
      results: [],
      errors: [],
    },
    errorMessage: null,
    createdById: opts.createdById ?? null,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
  };

  jobs.set(job.id, job);
  runningByKey.set(key, job.id);

  setImmediate(() => {
    runJob(job, sheets)
      .catch((e) => {
        job.status = "error";
        job.errorMessage = e instanceof Error ? e.message : String(e);
        job.finishedAt = nowIso();
      })
      .finally(() => {
        if (runningByKey.get(key) === job.id) runningByKey.delete(key);
      });
  });

  return toPublic(job);
}
