/**
 * SpendingBackfill.jsx — ONE-TIME: runs spendingBackfill.js once the vault is open (nothing drawn).
 * Temporary — delete with spendingBackfill.js (see there).
 */

import { useEffect } from 'react';
import { useAuth } from '../../features/auth/context/AuthContext.jsx';
import { useDemo } from '../../features/demo/index.js';
import { useFeature } from '../features/useFeature.js';
import { useVault } from './useVault.js';

export default function SpendingBackfill() {
  const { user } = useAuth();
  const { readOnly } = useDemo();
  const { status } = useVault();
  const expenses = useFeature('expenses');
  const userId = user?.id || '';
  useEffect(() => {
    if (!userId || readOnly || status !== 'unlocked') return;
    import('./spendingBackfill.js').then(({ runSpendingBackfill }) => runSpendingBackfill({ userId, expenses })).catch(() => {});
  }, [userId, readOnly, status, expenses]);
  return null;
}
