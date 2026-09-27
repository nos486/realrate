import { useAuth } from '../../features/auth/index.js';

/**
 * useFeature — Check if a feature flag is enabled for the current authenticated user.
 * Reads features directly from user.features populated by GET /api/auth/me.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function useFeature(key) {
  const { user } = useAuth();
  if (!user || !Array.isArray(user.features)) return false;
  return user.features.includes(key);
}
