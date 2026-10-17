/**
 * useAssetGoalShares.js — How much of each asset of one portfolio the goals have reserved, for the
 * portfolio page to say so under the asset (utils/goalDocument.js resolveAllocations)
 *
 * An asset's quantity goes to one goal at a time and an allocation points at a portfolio and an
 * asset, so only that portfolio's own assets are needed to work the shares out.
 */

import { useMemo } from 'react';
import { assetKey, resolveAllocations } from '../../../utils/goalDocument.js';
import { useGoals } from './useGoals.js';

/**
 * @param {string|undefined} portfolioId
 * @param {Array<{ assetId: string, amount: number, unitRealPrice: number }>} assets - the portfolio's ledger assets
 * @param {boolean} [enabled] false: no goal is read
 * @returns {{ shares: Map<string, Array<{ goalId: string, goalName: string, quantity: number, toman: number }>>,
 *   reserved: Map<string, { quantity: number, toman: number, asked: number, over: boolean }>,
 *   reservedToman: number }} by asset id; `reserved`: what the goals hold of each asset in total
 *   (`over`: they asked for more than the portfolio now holds); `reservedToman`: all of it, in tomans
 */
export function useAssetGoalShares(portfolioId, assets, enabled = true) {
  const { goals } = useGoals({ enabled: enabled && Boolean(portfolioId) });
  return useMemo(() => {
    const shares = new Map();
    const reserved = new Map();
    if (!portfolioId) return { shares, reserved, reservedToman: 0 };
    const index = new Map(assets.map((a) => [assetKey(portfolioId, a.assetId), { amount: a.amount, unitPrice: a.unitRealPrice }]));
    const { byGoal, askedOf } = resolveAllocations(goals, index);
    let reservedToman = 0;
    for (const goal of goals) {
      (goal.allocations || []).forEach((alloc, i) => {
        const got = byGoal.get(goal.id)?.[i];
        if (alloc.portfolioId !== portfolioId || !got || got.quantity <= 0) return;
        shares.set(alloc.assetId, [...(shares.get(alloc.assetId) || []), { goalId: goal.id, goalName: goal.name, quantity: got.quantity, toman: got.toman }]);
        const before = reserved.get(alloc.assetId) || { quantity: 0, toman: 0 };
        reserved.set(alloc.assetId, { quantity: before.quantity + got.quantity, toman: before.toman + got.toman });
        reservedToman += got.toman;
      });
    }
    for (const [assetId, r] of reserved) {
      const asked = askedOf(portfolioId, assetId);
      reserved.set(assetId, { ...r, asked, over: asked > r.quantity + 1e-9 });
    }
    return { shares, reserved, reservedToman };
  }, [goals, assets, portfolioId]);
}
