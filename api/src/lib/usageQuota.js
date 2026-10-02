/**
 * usageQuota.js — Count and enforce the daily limits of config/usageLimits.js
 *
 * One counter per user, feature and day in the state store (Postgres, stateStore.repository.js):
 * `quota:<feature>:<userId>:<YYYY-MM-DD>`, kept two days. The day is Tehran's, so the count resets
 * at local midnight. A use is one atomic increment (given back when it went over the limit), so
 * two requests at the same moment cannot both take the last free slot.
 */

import { AppError } from "./AppError.js";
import { logger } from "./logger.js";
import { getStateStore } from "../repositories/stateStore.repository.js";
import { USAGE_LIMITS, dailyLimitFor } from "../config/usageLimits.js";

const COUNTER_TTL_SEC = 2 * 24 * 3600;
const faNum = (n) => Number(n).toLocaleString("fa-IR");

/** Today's date in Tehran, YYYY-MM-DD */
export function tehranDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(now);
}

const userIdOf = (user) => user?.userId || user?.id || user?.email || "";
const counterKey = (key, user, now) => `quota:${key}:${userIdOf(user)}:${tehranDay(now)}`;

async function readCount(store, name) {
  try {
    return Math.max(0, parseInt((await store.get(name)) || "0", 10) || 0);
  } catch (err) {
    logger.warn("[Quota] read failed:", { error: err.message });
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
  const store = getStateStore(env);
  const used = store ? await readCount(store, counterKey(key, user, now)) : 0;
  return { key, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
}

/**
 * Use one of today's `key` for `user`, or refuse with 429 QUOTA_EXCEEDED
 * @returns the quota after this use
 */
export async function consumeQuota(env, user, key, { now = new Date() } = {}) {
  const limit = dailyLimitFor(user, key);
  const refuse = () => {
    const { label, unit } = USAGE_LIMITS[key] || { label: key, unit: "بار" };
    const message = limit === 0
      ? `«${label}» برای حساب شما فعال نیست.`
      : `سقف روزانه «${label}» (${faNum(limit)} ${unit}) تمام شده است. فردا دوباره امتحان کنید.`;
    throw new AppError(message, 429, "QUOTA_EXCEEDED");
  };
  if (limit === 0) refuse();
  const store = getStateStore(env);
  let used = 1;
  if (store) {
    const name = counterKey(key, user, now);
    try {
      used = await store.increment(name, 1, { expirationTtl: COUNTER_TTL_SEC });
    } catch (err) {
      logger.warn("[Quota] write failed:", { error: err.message });
    }
    if (limit !== null && used > limit) {
      await store.increment(name, -1, { expirationTtl: COUNTER_TTL_SEC }).catch(() => {});
      refuse();
    }
  }
  return { key, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
}

/** Give back one use (the costly work failed before it cost anything) */
export async function refundQuota(env, user, key, { now = new Date() } = {}) {
  const store = getStateStore(env);
  if (!store) return;
  try {
    await store.increment(counterKey(key, user, now), -1, { expirationTtl: COUNTER_TTL_SEC });
  } catch (err) {
    logger.warn("[Quota] refund failed:", { error: err.message });
  }
}
