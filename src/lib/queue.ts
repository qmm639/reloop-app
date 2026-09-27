import { db } from "./db";

export type JobType = "poll" | "render" | "publish";

/** ใส่งานเข้าคิว (เก็บในตาราง Job ไม่ต้องใช้ Redis) */
export async function enqueue(type: JobType, payload: Record<string, unknown>, opts?: { runAt?: Date; maxAttempts?: number }) {
  return db.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      runAt: opts?.runAt ?? new Date(),
      maxAttempts: opts?.maxAttempts ?? 3,
    },
  });
}

/**
 * จองงานถัดไปแบบกันชนกันระหว่าง worker หลายตัว
 * ใช้ updateMany + เงื่อนไข status ทำให้มีเพียง worker เดียวที่จองสำเร็จ
 */
export async function claimNext(workerId: string) {
  const candidate = await db.job.findFirst({
    where: { status: "queued", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
  });
  if (!candidate) return null;

  const claimed = await db.job.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: { status: "running", lockedBy: workerId, lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null; // worker อื่นชิงไปก่อน

  return db.job.findUnique({ where: { id: candidate.id } });
}

export async function finishJob(id: string) {
  await db.job.update({ where: { id }, data: { status: "done", error: null, lockedBy: null } });
}

/** ล้มเหลว: ลองใหม่แบบถอยเวลาเพิ่มขึ้น 1, 5, 25 นาที จนครบ maxAttempts */
export async function failJob(id: string, err: unknown) {
  const job = await db.job.findUnique({ where: { id } });
  if (!job) return;
  const message = err instanceof Error ? err.message : String(err);
  const done = job.attempts >= job.maxAttempts;
  await db.job.update({
    where: { id },
    data: done
      ? { status: "failed", error: message, lockedBy: null }
      : { status: "queued", error: message, lockedBy: null, runAt: new Date(Date.now() + 60_000 * 5 ** (job.attempts - 1)) },
  });
}

/** ปลดล็อกงานที่ค้างเพราะ worker ดับกลางทาง */
export async function reclaimStale(minutes = 30) {
  await db.job.updateMany({
    where: { status: "running", lockedAt: { lt: new Date(Date.now() - minutes * 60_000) } },
    data: { status: "queued", lockedBy: null },
  });
}

export const parsePayload = <T = Record<string, unknown>>(raw: string): T => JSON.parse(raw || "{}") as T;
