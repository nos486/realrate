/**
 * features.js — Feature Flags configuration
 *
 * Stage lifecycle:
 * - 'off': disabled for everyone
 * - 'beta': enabled only for admin users (evaluated strictly from user.role === 'admin')
 * - 'ga': generally available for all authenticated users
 */

export const FEATURES = {
  cheque_scan: {
    stage: 'beta',
    label: 'اسکن چک با هوش مصنوعی',
    description: 'استخراج هوشمند اطلاعات چک بانکی از تصویر با مدل‌های بینایی Workers AI',
  },
};

/**
 * Check if a feature is enabled for a given user.
 * Unknown keys always evaluate to false.
 * Admin role is strictly derived by the server (user.role === 'admin').
 *
 * @param {string} key
 * @param {object|null} user
 * @returns {boolean}
 */
export function isFeatureEnabled(key, user) {
  const feat = FEATURES[key];
  if (!feat) return false;
  if (feat.stage === 'off') return false;
  if (feat.stage === 'beta') return user?.role === 'admin';
  if (feat.stage === 'ga') return Boolean(user);
  return false;
}

/**
 * Return a list of feature keys enabled for the user.
 *
 * @param {object|null} user
 * @returns {string[]}
 */
export function enabledFeatures(user) {
  if (!user) return [];
  return Object.keys(FEATURES).filter((k) => isFeatureEnabled(k, user));
}
