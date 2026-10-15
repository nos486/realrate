/**
 * incomeApi.js — The incomes feature's data: every income is an end-to-end encrypted vault
 * record (shared/vault/vaultIncomes.js). The feature imports from here, so its callers never
 * name the store.
 */

export { getIncomes, createIncome, updateIncome, deleteIncome } from '../../../shared/vault/vaultIncomes.js';
