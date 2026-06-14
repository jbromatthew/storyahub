import { randomUUID } from "node:crypto";

// 무거운 AI 변환은 웹 요청에서 분리한다.
// 개발용 인메모리 큐 스텁 — 운영에서는 Redis/SQS + 별도 워커 프로세스로 교체.
type JobStatus = "queued" | "processing" | "done" | "error";
interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
}

const jobs = new Map<string, Job>();

export function enqueue(userId: string, work: () => Promise<unknown>): string {
  const id = randomUUID();
  jobs.set(id, { id, userId, status: "queued" });
  setImmediate(async () => {
    const job = jobs.get(id)!;
    job.status = "processing";
    try {
      job.result = await work();
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = (e as Error).message;
    }
  });
  return id;
}

export function getJob(id: string, userId: string): Job | undefined {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return undefined;
  return job;
}

/** 클라이언트 응답용 — 내부 오류 메시지는 숨긴다 */
export function publicJobView(job: Job) {
  return {
    id: job.id,
    status: job.status,
    ...(job.status === "done" ? { result: job.result } : {}),
    ...(job.status === "error" ? { error: "처리 중 오류가 발생했습니다" } : {}),
  };
}
