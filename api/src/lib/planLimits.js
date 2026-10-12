/**
 * planLimits.js — Enforce the free plan's limits (config/planLimits.js) on the user's records
 *
 * Called before a vault record is stored (handlers/vaultRoutes.js) and a portfolio is created. Only
 * records that do not exist yet count; replacing one is always allowed. If counting fails the write
 * goes on (the same store would fail it anyway).
 */

import { AppError } from "./AppError.js";
import { logger } from "./logger.js";
import { withUserGroups } from "./features.js";
import { tehranToday } from "../domain/isoDate.js";
import { PLAN_LIMITS, FREE_PORTFOLIOS, isProUser, planLimitKeyOfKind } from "../config/planLimits.js";
import {
  dbCountVaultRecords, dbExistingVaultRecordIds, dbDeleteVaultRecords, dbClaimPlanCounter, dbReleasePlanCounter, dbGetPlanCounter,
} from "../repositories/vault.repository.js";
import { dbGetUserPortfolios } from "../repositories/portfolio.repository.js";

const userIdOf = (user) => user?.userId || user?.id || user?.email || "";
const faNum = (n) => Number(n).toLocaleString("fa-IR");
const persianDay = new Intl.DateTimeFormat("en-u-ca-persian", { timeZone: "Asia/Tehran", day: "numeric" });

/**
 * The instant the current Shamsi month began (Tehran midnight, ISO UTC), the cut-off for monthly limits
 * @param {Date} [now]
 */
export function shamsiMonthStart(now = new Date()) {
  const dayOfMonth = Number(persianDay.format(now)) || 1;
  const [y, m, d] = tehranToday(now).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, d - (dayOfMonth - 1)));
  const iso = first.toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00+03:30`).toISOString();
}

function limitError(rule, limit) {
  const what = rule.monthly != null ? `${faNum(limit)} ${rule.label} در ماه` : `${faNum(limit)} ${rule.label}`;
  const msg = limit === 0
    ? `${rule.label} در پلن رایگان بسته است. برای استفاده به Pro ارتقا دهید.`
    : `پلن رایگان فقط ${what} را اجازه می‌دهد. برای ادامه به Pro ارتقا دهید.`;
  return new AppError(msg, 403, "PLAN_LIMIT");
}

const NO_GUARD = { verify: async () => {}, undo: async () => {} };

/**
 * Refuse new records of `kind` past the free plan's limit, and hold their place until they are stored
 * - A monthly limit is a counter that deletions do not lower (deleting and re-adding is not a way
 *   around it); it is claimed atomically, so parallel requests cannot all slip under it.
 * - A total limit is checked before and again after the store (`verify`), which removes the new
 *   records if parallel requests together went over.
 * @param {object} env
 * @param {object} user - the authenticated user
 * @param {string} kind - vault record kind
 * @param {string[]} ids - ids being stored
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ verify: () => Promise<void>, undo: () => Promise<void> }>}
 */
export async function enforceRecordLimit(env, user, kind, ids, { now = new Date() } = {}) {
  const key = planLimitKeyOfKind(kind);
  if (!key) return NO_GUARD;
  let claimed = null;
  try {
    await withUserGroups(env, user);
    if (isProUser(user)) return NO_GUARD;
    const rule = PLAN_LIMITS[key];
    const userId = userIdOf(user);
    const existing = await dbExistingVaultRecordIds(env, userId, kind, ids);
    const newIds = ids.filter((id) => !existing.has(id));
    if (!newIds.length) return NO_GUARD;
    const limit = rule.monthly ?? rule.total;
    if (rule.monthly != null) {
      const period = shamsiMonthStart(now);
      const seed = await dbCountVaultRecords(env, userId, rule.kinds, { since: period });
      if (!(await dbClaimPlanCounter(env, userId, key, period, { seed, add: newIds.length, limit }))) throw limitError(rule, limit);
      claimed = { period, add: newIds.length };
      return { verify: async () => {}, undo: () => dbReleasePlanCounter(env, userId, key, period, newIds.length).catch(() => {}) };
    }
    if (await dbCountVaultRecords(env, userId, rule.kinds) + newIds.length > limit) throw limitError(rule, limit);
    return {
      verify: async () => {
        // Parallel requests passed the check together: keep the first records up to the limit
        const used = await dbCountVaultRecords(env, userId, rule.kinds);
        if (used <= limit) return;
        await dbDeleteVaultRecords(env, userId, kind, newIds);
        throw limitError(rule, limit);
      },
      undo: async () => {},
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn("[PlanLimit] check failed:", { error: err.message });
    if (claimed) await dbReleasePlanCounter(env, userIdOf(user), key, claimed.period, claimed.add).catch(() => {});
    return NO_GUARD;
  }
}

/**
 * Store `ids` of `kind` with `store()` under the free plan's limits: refused before when over,
 * rolled back when parallel requests went over, and the monthly claim given back if storing fails
 * @template T
 * @param {() => Promise<T>} store
 * @returns {Promise<T>}
 */
export async function withRecordLimit(env, user, kind, ids, store, opts) {
  const guard = await enforceRecordLimit(env, user, kind, ids, opts);
  let result;
  try {
    result = await store();
  } catch (err) {
    await guard.undo();
    throw err;
  }
  try {
    await guard.verify();
  } catch (err) {
    await guard.undo();
    throw err;
  }
  return result;
}

/** Refuse a second portfolio on the free plan */
export async function enforcePortfolioLimit(env, user) {
  try {
    await withUserGroups(env, user);
    if (isProUser(user)) return;
    const portfolios = await dbGetUserPortfolios(env, userIdOf(user));
    if (portfolios.length >= FREE_PORTFOLIOS) {
      throw new AppError("پلن رایگان فقط یک پورتفو را اجازه می‌دهد. برای ساخت پورتفوی بیشتر به Pro ارتقا دهید.", 403, "PLAN_LIMIT");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn("[PlanLimit] portfolio check failed:", { error: err.message });
  }
}

/**
 * What the user has used of each limit (for the notes beside each section and the Pro page)
 * @returns {Promise<{ pro: boolean, usage: Record<string, { used: number, limit: number, period: 'month'|'total' }> }>}
 */
export async function getPlanUsage(env, user, { now = new Date() } = {}) {
  await withUserGroups(env, user);
  if (isProUser(user)) return { pro: true, usage: {} };
  const userId = userIdOf(user);
  const since = shamsiMonthStart(now);
  const entries = await Promise.all(Object.entries(PLAN_LIMITS).map(async ([key, rule]) => {
    const monthly = rule.monthly != null;
    const rows = await dbCountVaultRecords(env, userId, rule.kinds, monthly ? { since } : {});
    // A monthly limit also counts what was deleted this month (the counter of enforceRecordLimit)
    const used = monthly ? Math.max(rows, await dbGetPlanCounter(env, userId, key, since)) : rows;
    return [key, { used, limit: monthly ? rule.monthly : rule.total, period: monthly ? "month" : "total" }];
  }));
  const portfolios = await dbGetUserPortfolios(env, userId).catch(() => []);
  entries.push(["portfolios", { used: portfolios.length, limit: FREE_PORTFOLIOS, period: "total" }]);
  return { pro: false, usage: Object.fromEntries(entries) };
}
