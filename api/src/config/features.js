/**
 * features.js — Feature Flags configuration
 *
 * Each feature has an audience:
 * - stage 'off':  disabled for everyone
 * - stage 'beta': enabled only for admin users (evaluated strictly from user.role === 'admin')
 * - stage 'ga':   generally available for authenticated users — every one of them, or, when
 *                 `groups` lists group keys (domain/userGroups.js), only the members of those
 *                 groups (admins always; the demo account too, so it can show everything)
 * These are the defaults. The admin can change a feature's stage and groups at runtime (the
 * rules are laid over these defaults: lib/features.js loadFeatureRules); the server enforces them
 * (requireFeature) and tells the client its features in GET /api/auth/me.
 *
 * Shared with the web client through a symlink.
 */

export const FEATURE_STAGES = ['off', 'beta', 'ga'];

export const FEATURES = {
  market: {
    stage: 'ga',
    groups: ['pro'],
    label: 'صفحه‌ی نرخ و حباب',
    description: 'صفحه‌ی اول: کارت قیمت دارایی‌ها، نمودار تاریخچه و شخصی‌سازی چیدمان',
  },
  cheque_scan: {
    stage: 'ga',
    label: 'اسکن چک با هوش مصنوعی',
    description: 'استخراج اطلاعات چک بانکی از تصویر با Gemini (محدودیت روزانه: config/usageLimits.js)',
  },
  expenses: {
    stage: 'ga',
    label: 'هزینه‌ها',
    description: 'بخش‌های هزینه (پروژه‌ها و ...) با ثبت هزینه به تومان یا دلار',
  },
  bank_accounts: {
    stage: 'ga',
    label: 'حساب‌ها',
    description: 'حساب‌های بانکی، نقد و کیف پول؛ منبع هر هزینه',
  },
  cheque_scan_debug: {
    stage: 'beta',
    label: 'ابزار بررسی دقت اسکن چک',
    description: 'خروجی خام مدل، دلیل خطا و سنجش دقت فیلدها در نتیجه اسکن',
  },
};

const isDemoUser = (user) => Boolean(user?.isDemo) || String(user?.kind || '').startsWith('demo_');

/**
 * Check if a feature is enabled for a given user.
 * Unknown keys always evaluate to false.
 * Admin role is strictly derived by the server (user.role === 'admin'); a user's groups come
 * from the server too (`user.groups`: group keys).
 *
 * @param {string} key
 * @param {object|null} user
 * @param {Record<string, { stage: string, groups?: string[] }>} [rules] the effective rules (defaults: FEATURES)
 * @returns {boolean}
 */
export function isFeatureEnabled(key, user, rules = FEATURES) {
  const feat = rules?.[key] || null;
  if (!feat || !FEATURES[key]) return false;
  if (feat.stage === 'off') return false;
  if (feat.stage === 'beta') return user?.role === 'admin';
  if (feat.stage !== 'ga' || !user) return false;
  const groups = Array.isArray(feat.groups) ? feat.groups : [];
  if (!groups.length || user.role === 'admin' || isDemoUser(user)) return true;
  const mine = Array.isArray(user.groups) ? user.groups : [];
  return groups.some((g) => mine.includes(g));
}

/**
 * Return a list of feature keys enabled for the user.
 *
 * @param {object|null} user
 * @param {Record<string, object>} [rules]
 * @returns {string[]}
 */
export function enabledFeatures(user, rules = FEATURES) {
  if (!user) return [];
  return Object.keys(FEATURES).filter((k) => isFeatureEnabled(k, user, rules));
}

/**
 * The effective rules: the code's defaults with the admin's changes laid over them. Only a
 * known feature's stage and groups can change; anything else in the stored changes is ignored.
 * @param {Record<string, { stage?: string, groups?: string[] }>|null} overrides
 * @returns {Record<string, { stage: string, groups: string[], label: string, description: string }>}
 */
export function mergeFeatureRules(overrides) {
  const rules = {};
  for (const [key, def] of Object.entries(FEATURES)) {
    const o = overrides && typeof overrides === 'object' ? overrides[key] : null;
    const stage = FEATURE_STAGES.includes(o?.stage) ? o.stage : def.stage;
    const groups = Array.isArray(o?.groups) ? o.groups.filter((g) => typeof g === 'string') : (def.groups || []);
    rules[key] = { ...def, stage, groups };
  }
  return rules;
}

/**
 * Validate the admin's change to one feature
 * @param {string} key
 * @param {{ stage?: string, groups?: string[] }} input
 * @param {string[]} knownGroups the keys of the groups that exist
 * @returns {{ value?: { stage: string, groups: string[] }, error?: string }}
 */
export function validateFeatureRule(key, input, knownGroups = []) {
  if (!FEATURES[key]) return { error: 'ویژگی ناشناخته است.' };
  const stage = input?.stage;
  if (!FEATURE_STAGES.includes(stage)) return { error: 'وضعیت ویژگی نامعتبر است.' };
  const groups = [...new Set(Array.isArray(input?.groups) ? input.groups.map((g) => String(g)) : [])];
  const unknown = groups.filter((g) => !knownGroups.includes(g));
  if (unknown.length) return { error: `گروه ناشناخته: ${unknown.join('، ')}` };
  return { value: { stage, groups: stage === 'ga' ? groups : [] } };
}
