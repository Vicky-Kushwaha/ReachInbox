import { redisCounters } from "../queues/redisConnection";

/**
 * Hourly rate limiting, keyed by sender + hour window (e.g. "3:2026-08-29T14").
 *
 * Why this is safe across multiple worker processes/instances:
 * - The counter lives in Redis (not in-memory), so every worker sees the same count.
 * - We use INCR, which is atomic in Redis — two workers incrementing concurrently
 *   can never both "win" the same slot number.
 * - The key carries a TTL slightly longer than an hour so stale windows are
 *   garbage-collected automatically; we never need a cron/cleanup job for this.
 *
 * Trade-off: this is a fixed hour-of-day window (":00" to ":59"), not a rolling
 * 60-minute window. That's simpler and matches "N emails per hour" semantics
 * from the assignment, but it means a burst could send up to 2x the limit
 * split across a window boundary (e.g. 199 at 2:59 and 199 at 3:00). If a
 * strict rolling window were required, a Redis sorted-set timestamp log
 * (ZADD/ZREMRANGEBYSCORE) would be the next step — noted in the README.
 */

function hourWindowKey(senderId: number, date: Date = new Date()): string {
  const iso = date.toISOString(); // e.g. 2026-08-29T14:23:11.000Z
  const hourBucket = iso.slice(0, 13); // "2026-08-29T14"
  return `ratelimit:sender:${senderId}:${hourBucket}`;
}

export function currentHourWindowStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

export function nextHourWindowStart(date: Date = new Date()): Date {
  const start = currentHourWindowStart(date);
  return new Date(start.getTime() + 60 * 60 * 1000);
}

/**
 * Atomically attempts to reserve one "send slot" for this sender in the current
 * hour window. Returns true if under the limit (and reserved), false if the
 * sender is already at/over its cap for this hour.
 */
export async function tryReserveSendSlot(senderId: number, maxPerHour: number): Promise<boolean> {
  const key = hourWindowKey(senderId);
  const count = await redisCounters.incr(key);
  if (count === 1) {
    // First write in this window — set an expiry so old windows self-clean.
    await redisCounters.expire(key, 60 * 65); // 65 minutes
  }
  if (count > maxPerHour) {
    // Over the limit: release our reservation so we don't permanently
    // undercount capacity for this window once the job is rescheduled.
    await redisCounters.decr(key);
    return false;
  }
  return true;
}

export async function getCurrentCount(senderId: number): Promise<number> {
  const key = hourWindowKey(senderId);
  const v = await redisCounters.get(key);
  return v ? parseInt(v, 10) : 0;
}
