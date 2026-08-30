import IORedis from "ioredis";
import { env } from "../config/env";

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// A second lightweight client for our own rate-limit counters / locks,
// kept separate from the BullMQ-managed connection by convention.
export const redisCounters = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
