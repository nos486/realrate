// @vitest-environment happy-dom
/**
 * assetGoalShares.test.jsx — The portfolio page says how much of an asset the goals reserved: a
 * quantity or a percent, the older goal served first, another portfolio's allocations left out
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const store = vi.hoisted(() => ({ goals: [] }));
vi.mock('../../../web/src/features/goals/hooks/useGoals.js', () => ({ useGoals: () => ({ goals: store.goals }) }));
const { useAssetGoalShares } = await import('../../../web/src/features/goals/hooks/useAssetGoalShares.js');

const alloc = (id, portfolioId, mode, value) => ({ id, portfolioId, assetId: 'gold18', mode, value, date: '2026-05-01' });
const assets = [{ assetId: 'gold18', amount: 10, unitRealPrice: 5_000_000 }];

describe('useAssetGoalShares', () => {
  it('lists each goal\'s share of the asset, the older goal first', () => {
    store.goals = [
      { id: 'late', name: 'سفر', createdAt: '2', allocations: [alloc('b', 'pf_1', 'amount', 6)] },
      { id: 'early', name: 'خانه', createdAt: '1', allocations: [alloc('a', 'pf_1', 'percent', 70)] },
    ];
    const { result } = renderHook(() => useAssetGoalShares('pf_1', assets));
    const shares = result.current.get('gold18');
    expect(shares.map((s) => [s.goalName, s.quantity])).toEqual([['سفر', 3], ['خانه', 7]]);
  });

  it('leaves out another portfolio\'s allocations', () => {
    store.goals = [{ id: 'g', name: 'خانه', createdAt: '1', allocations: [alloc('a', 'pf_2', 'amount', 2)] }];
    const { result } = renderHook(() => useAssetGoalShares('pf_1', assets));
    expect(result.current.size).toBe(0);
  });
});
