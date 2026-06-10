import { randomUUID } from "node:crypto";

// 무거운 AI 변환은 웹 요청에서 분리한다.
// 개발용 인메모리 큐 스텁 — 운영에서는 Redis/SQS + 별도 워커 프로세스로 교체.
type JobStatus = "queued" | "processing" | "done" | "error";
interface Job { id: string; status: JobStatus; result?: unknown; error?: string; }

const jobs = new Map<string, Job>();

export function enqueue(work: () => Promise<unknown>): string {
  const id = randomUUID();
  jobs.set(id, { id, status: "queued" });
  // 다음 틱에 처리 (실제로는 워커가 큐를 소비)
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

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}
