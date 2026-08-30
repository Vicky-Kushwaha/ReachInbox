import { Queue } from "bullmq";
import { redisConnection } from "./redisConnection";
import { EmailJobData } from "../types";

export const EMAIL_QUEUE_NAME = "email-send-queue";

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 5000 }, // keep 7 days / 5k jobs
    removeOnFail: { age: 60 * 60 * 24 * 30 }, // keep failures 30 days for debugging
  },
});

/**
 * jobId is deterministic (`email-<row id>`), which is what gives us
 * idempotency: BullMQ will not create a second job with the same id, so
 * calling this twice for the same email row (e.g. during a restart
 * reconciliation sweep) is always safe and never double-sends.
 */
export function emailJobId(emailId: number): string {
  return `email-${emailId}`;
}

export async function scheduleEmailJob(data: EmailJobData, sendAt: Date): Promise<void> {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  await emailQueue.add("send-email", data, {
    jobId: emailJobId(data.emailId),
    delay,
  });
}
