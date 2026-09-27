/**
 * usageLimits.js — Which users may use costly features how often
 *
 * Every user belongs to one tier; a tier sets a daily limit per metered feature. A feature a
 * tier doesn't list is not allowed to it (0), so a new costly feature is closed until a limit is
 * written here; an `unlimited` tier is never limited (it is still counted).
 *
 * To meter a new feature: add it to USAGE_LIMITS, give each tier its limit, and call
 * consumeQuota(env, user, key) (lib/usageQuota.js) before the costly work.
 * To add a tier (a paid plan, say): add it to USER_TIERS and return it from userTierOf.
 */

/** Metered features: `label` and `unit` are shown to users */
export const USAGE_LIMITS = {
  cheque_scan: { label: "اسکن چک با هوش مصنوعی", unit: "اسکن" },
};

export const USER_TIERS = {
  admin: { label: "مدیر", unlimited: true, limits: {} },
  user: { label: "کاربر", limits: { cheque_scan: 10 } },
};

/** The tier of a signed-in user (the admin role comes from ADMIN_EMAIL, on the server) */
export function userTierOf(user) {
  return user?.role === "admin" ? "admin" : "user";
}

/**
 * How many times a day `user` may use `key`: a number, or null for no limit
 * @returns {number|null}
 */
export function dailyLimitFor(user, key) {
  if (!USAGE_LIMITS[key]) return 0;
  const tier = USER_TIERS[userTierOf(user)];
  if (!tier) return 0;
  if (tier.unlimited) return null;
  return tier.limits[key] ?? 0;
}
