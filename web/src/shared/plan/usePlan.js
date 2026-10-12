/**
 * usePlan.js — The user's plan (Free or Pro) and what they have used of the free plan's limits
 *
 * Pro is read from the user the server described (groups, admin, demo): config/planLimits.js
 * isProUser. Usage comes from GET /api/plan, read when a section asks and again after a record is
 * stored or deleted (httpClient announces PLAN_STALE_EVENT), so the notes stay right.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../features/auth/index.js';
import { httpClient } from '../api/httpClient.js';
import { isProUser } from '../../config/planLimits.js';

export const PLAN_STALE_EVENT = 'realrate:plan-stale';
export const PLAN_LIMIT_EVENT = 'realrate:plan-limit';

/** The path of the page comparing the plans */
export const PRO_PATH = '/pro';

let cache = null;

/** @returns {boolean} whether the signed-in user is on Pro (or is never limited) */
export function useIsPro() {
  const { user } = useAuth() || {};
  return isProUser(user);
}

/**
 * @returns {{ pro: boolean, usage: Record<string, { used: number, limit: number, period: string }>,
 *   loading: boolean, refresh: () => void }}
 */
export function usePlan() {
  const { user } = useAuth() || {};
  const pro = isProUser(user);
  const [usage, setUsage] = useState(cache || {});
  const [loading, setLoading] = useState(!pro && !cache);

  const load = useCallback(() => {
    if (pro || !user) return;
    httpClient.get('/api/plan', { silent: true, background: true })
      .then((res) => {
        cache = res?.usage || {};
        setUsage(cache);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pro, user]);

  useEffect(() => {
    load();
    window.addEventListener(PLAN_STALE_EVENT, load);
    return () => window.removeEventListener(PLAN_STALE_EVENT, load);
  }, [load]);

  return { pro, usage, loading, refresh: load };
}
