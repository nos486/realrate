/**
 * useGoalProgress.js — Where each goal stands today: its deposits at today's rates and its
 * allocated portfolio assets at today's prices (utils/goalDocument.js)
 *
 * Shared by the goals page and the home card. The prices and rates are the price book's (the
 * browser never computes them); the portfolios are read only when a goal allocates from one, or
 * when the page needs them for its allocation form.
 */

import { useMemo } from 'react';
import { usePricing } from '../../market/index.js';
import { useFxRates } from '../../market/useFxRates.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { goalProgress, resolveAllocations } from '../../../utils/goalDocument.js';
import { usePortfolioAssets } from './usePortfolioAssets.js';

/**
 * @param {object[]} goals
 * @param {{ enabled?: boolean, withPortfolios?: boolean }} [options] - enabled false: nothing is read;
 *   withPortfolios: read the portfolios even when no goal allocates from one yet
 */
export function useGoalProgress(goals, { enabled = true, withPortfolios = false } = {}) {
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const records = useMemo(() => [...goals, ...goals.flatMap((g) => g.deposits || [])], [goals]);
  const fx = useFxRates(records, enabled);
  const needsPortfolios = enabled && (withPortfolios || goals.some((g) => (g.allocations || []).length > 0));
  const { portfolios, assets, index, loading } = usePortfolioAssets({ enabled: needsPortfolios });
  const today = todayIso();

  return useMemo(() => {
    const rates = { usdToman, ...fx };
    const resolved = resolveAllocations(goals, index);
    const progressOf = (goal) => goalProgress(goal, { today, rates, allocations: resolved.byGoal.get(goal.id) || [] });
    return { progressOf, resolved, rates, portfolios, assets, loading, today };
  }, [goals, index, usdToman, fx, today, portfolios, assets, loading]);
}
