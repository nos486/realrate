/**
 * recurringIncomeApi.js — Fixed (recurring) income rules
 *
 * Plaintext accounts use the REST API; with account-wide end-to-end encryption on, rules are
 * encrypted vault records handled in the browser (same signatures and response shapes).
 */

import { httpClient } from '../../../shared/api/httpClient.js';
import { routeThroughVault } from '../../../shared/vault/vaultRouting.js';
import * as vaultRecurring from '../../../shared/vault/vaultRecurringIncomes.js';

const BASE = '/api/incomes/recurring';
const one = (ruleId) => `${BASE}/${encodeURIComponent(ruleId)}`;

export const {
  getRecurringIncomes,
  createRecurringIncome,
  updateRecurringIncome,
  deleteRecurringIncome,
} = routeThroughVault(
  {
    getRecurringIncomes: () => httpClient.get(BASE),
    createRecurringIncome: (data) => httpClient.post(BASE, data),
    // `silent`: advancing a rule after creating its entries happens in the background
    updateRecurringIncome: (ruleId, data, options) => httpClient.put(one(ruleId), data, options),
    deleteRecurringIncome: (ruleId) => httpClient.delete(one(ruleId)),
  },
  vaultRecurring
);
