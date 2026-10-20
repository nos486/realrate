/**
 * usePlan.js — The user's plan and what they have used of their limits
 *
 * Which limits apply (counts and quotas) is set by the admin per group and decided by the server:
 * GET /api/plan gives `pro` (nothing limits the user), the `usage` of each limit and `limits` (each a
 * count, or null for unlimited). It is read when a section asks and again after a record is stored or
 * deleted (httpClient announces PLAN_STALE_EVENT), so the notes stay right. Until it answers, the
 * user is Pro when config/planLimits.js isProUser says so (admin, demo, the Pro group).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../features/auth/index.js';
import { httpClient } from '../api/httpClient.js';
import { isProUser, FREE_SMS_READS } from '../../config/planLimits.js';

export const PLAN_STALE_EVENT = 'realrate:plan-stale';
export const PLAN_LIMIT_EVENT = 'realrate:plan-limit';

/** The path of the page comparing the plans */
export const PRO_PATH = '/pro';

/** The last answer of GET /api/plan, for the user it was read for */
let cache = null;
let inflight = null;

// The groups are part of the key: joining one changes the limits
const userKey = (user) => `${user?.userId || user?.id || user?.email || ''}:${(user?.groups || []).join(',')}`;

function fetchPlan(key) {
  if (!inflight) {
    inflight = httpClient.get('/api/plan', { silent: true, background: true })
      .then((res) => {
        cache = { key, pro: Boolean(res?.pro), usage: res?.usage || {}, limits: res?.limits || {} };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The phone's bank-message limits out of the plan: each a count, or null (unlimited) */
function smsLimitsOf(pro, limits) {
  if (pro) return { daily: null, monthly: null };
  return {
    daily: limits.sms_daily === undefined ? FREE_SMS_READS.daily : limits.sms_daily,
    monthly: limits.sms_monthly === undefined ? FREE_SMS_READS.monthly : limits.sms_monthly,
  };
}

/**
 * @returns {{ pro: boolean, usage: Record<string, { used: number, limit: number, period: string }>,
 *   limits: Record<string, number|null>, smsLimits: { daily: number|null, monthly: number|null },
 *   loading: boolean, refresh: () => void }}
 */
export function usePlan() {
  const { user } = useAuth() || {};
  const key = userKey(user);
  const fallbackPro = isProUser(user);
  const unlimited = Boolean(user) && (user.role === 'admin' || user.isAdmin || user.demo || user.isDemo || String(user.kind || '').startsWith('demo_'));
  const [plan, setPlan] = useState(() => (cache && cache.key === key ? cache : null));
  const [loading, setLoading] = useState(!unlimited && !plan);

  const load = useCallback(() => {
    if (unlimited || !user) return;
    fetchPlan(key)
      .then(setPlan)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [unlimited, user, key]);

  useEffect(() => {
    load();
    window.addEventListener(PLAN_STALE_EVENT, load);
    return () => window.removeEventListener(PLAN_STALE_EVENT, load);
  }, [load]);

  const current = unlimited ? null : plan && plan.key === key ? plan : null;
  const pro = unlimited || (current ? current.pro : fallbackPro);
  const limits = current?.limits || {};
  return { pro, usage: current?.usage || {}, limits, smsLimits: smsLimitsOf(pro, limits), loading, refresh: load };
}

/** @returns {boolean} whether nothing limits the signed-in user (Pro, an admin, the demo) */
export function useIsPro() {
  return usePlan().pro;
}
