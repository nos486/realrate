/**
 * useAsk.js — Answer a plain-Persian question about the user's own spending or income, on this device
 *
 * The question is read by rules (askQuery.js) and answered from the records of its period, loaded and
 * decrypted here — nothing is sent anywhere. Shared by the reports' «از داده‌هایت بپرس» card (AskCard.jsx)
 * and the AI assistant's spoken questions (features/ai/QuestionResult.jsx).
 */

import { useMemo, useState } from 'react';
import { isExcludedCategory, getCategory } from '../../shared/categories/categoryStore.js';
import { getExpenseGroups, getExpenses } from '../../shared/vault/vaultExpenses.js';
import { getIncomes } from '../../shared/vault/vaultIncomes.js';
import { expenseInToman } from '../../utils/expenseDocument.js';
import { incomeInToman } from '../../utils/incomeDocument.js';
import { todayIso } from '../../shared/utils/dates.js';
import { usePricing } from '../market/index.js';
import { useUsdAt } from '../market/dailyHistory.js';
import { useFxRates } from '../market/useFxRates.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { t } from '../../utils/i18n.js';
import { parseQuestion, answerQuestion } from './askQuery.js';

/** Load the question's period: everyday expenses or incomes */
async function loadRecords(query) {
  const { from, to } = query.period;
  if (query.kind === 'income') return (await getIncomes({ from, to })).incomes;
  const { groups } = await getExpenseGroups();
  const daily = groups.find((g) => g.type === 'daily');
  return daily ? (await getExpenses({ parent: daily.id, from, to })).expenses : [];
}

/**
 * @returns {{ state: { status: 'idle'|'loading'|'done'|'error', query: object|null, records: object[], error: string },
 *   answer: object|null, query: object|null, ask: (question: string) => Promise<void> }}
 */
export function useAsk() {
  const [state, setState] = useState({ status: 'idle', query: null, records: [], error: '' });
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(true);
  const fx = useFxRates(state.records);
  const rates = useMemo(() => ({ usdToman, usdAt, ...fx }), [usdToman, usdAt, fx]);
  const expenseCats = useCategories('expense', { includeHidden: true });
  const incomeCats = useCategories('income', { includeHidden: true });

  const ask = async (question) => {
    const q = String(question ?? '').trim();
    if (!q) return;
    const query = parseQuestion(q, { today: todayIso(), categories: { expense: expenseCats, income: incomeCats } });
    setState({ status: 'loading', query, records: [], error: '' });
    try {
      setState({ status: 'done', query, records: await loadRecords(query), error: '' });
    } catch (err) {
      setState({ status: 'error', query, records: [], error: err?.message || t('خطا در بارگذاری داده‌ها') });
    }
  };

  const { query } = state;
  const answer = useMemo(() => {
    if (state.status !== 'done') return null;
    const kind = query.kind;
    return answerQuestion(query, state.records, {
      toToman: (r) => (kind === 'income' ? incomeInToman(r, rates) : expenseInToman(r, rates)),
      isExcluded: (c) => isExcludedCategory(kind, c),
      labelOf: (c) => getCategory(kind, c).label,
    });
  }, [state.status, state.records, query, rates]);

  return { state, answer, query, ask };
}
