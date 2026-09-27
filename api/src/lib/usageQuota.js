/**
 * usageQuota.js — Count and enforce the daily limits of config/usageLimits.js
 *
 * One KV counter per user, feature and day (`quota:<feature>:<userId>:<YYYY-MM-DD>`, kept two
 * days). The day is Tehran's, so the count resets at local midnight. KV counters are not atomic:
 * two requests at the same moment may both pass the last free slot, which is acceptable for a
 * daily limit.
 */

import { AppError } from "./AppError.js";
import { logger } from "./logger.js";
import { getKv } from "../repositories/kvCache.repository.js";
import { USAGE_LIMITS, dailyLimitFor } from "../config/usageLimits.js";

const COUNTER_TTL_SEC = 2 * 24 * 3600;
const faNum = (n) => Number(n).toLocaleString("fa-IR");

/** Today's date in Tehran, YYYY-MM-DD */
export function tehranDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(now);
}

const userIdOf = (user) => user?.userId || user?.id || user?.email || "";
const counterKey = (key, user, now) => `quota:${key}:${userIdOf(user)}:${tehranDay(now)}`;

async function readCount(kv, name) {
  try {
    return Math.max(0, parseInt((await kv.get(name)) || "0", 10) || 0);
  } catch (err) {
    logger.warn("[Quota] KV read failed:", { error: err.message });
    return 0;
  }
}

/**
 * Today's use of `key` by `user`
 * @returns {Promise<{ key: string, limit: number|null, used: number, remaining: number|null }>}
 *   limit and remaining are null for no limit
 */
export async function getQuota(env, user, key, { now = new Date() } = {}) {
  const limit = dailyLimitFor(user, key);
  const kv = getKv(env);
  const used = kv ? await readCount(kv, counterKey(key, user, now)) : 0;
  return { key, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
}

/**
 * Use one of today's `key` for `user`, or refuse with 429 QUOTA_EXCEEDED
 * @returns the quota after this use
 */
export async function consumeQuota(env, user, key, { now = new Date() } = {}) {
  const quota = await getQuota(env, user, key, { now });
  if (quota.limit !== null && quota.used >= quota.limit) {
    const { label, unit } = USAGE_LIMITS[key] || { label: key, unit: "بار" };
    const message = quota.limit === 0
      ? `«${label}» برای حساب شما فعال نیست.`
      : `سقف روزانه «${label}» (${faNum(quota.limit)} ${unit}) تمام شده است. فردا دوباره امتحان کنید.`;
    throw new AppError(message, 429, "QUOTA_EXCEEDED");
  }
  const used = quota.used + 1;
  const kv = getKv(env);
  if (kv) {
    try {
      await kv.put(counterKey(key, user, now), String(used), { expirationTtl: COUNTER_TTL_SEC });
    } catch (err) {
      logger.warn("[Quota] KV write failed:", { error: err.message });
    }
  }
  return { ...quota, used, remaining: quota.limit === null ? null : Math.max(0, quota.limit - used) };
}

/** Give back one use (the costly work failed before it cost anything) */
export async function refundQuota(env, user, key, { now = new Date() } = {}) {
  const kv = getKv(env);
  if (!kv) return;
  const name = counterKey(key, user, now);
  const used = await readCount(kv, name);
  if (used <= 0) return;
  try {
    await kv.put(name, String(used - 1), { expirationTtl: COUNTER_TTL_SEC });
  } catch (err) {
    logger.warn("[Quota] KV refund failed:", { error: err.message });
  }
}
