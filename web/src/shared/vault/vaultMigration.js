/**
 * vaultMigration.js — Move an account's data into the account vault
 *
 * Encrypting (vault on):
 *  - every plaintext portfolio gets its own random key (wrapped with the account key); the flag
 *    is saved FIRST, so a portfolio is never left marked plaintext while holding ciphertext, and
 *    items not yet converted stay readable (plaintext items are shown as-is) until a later run;
 *  - a portfolio that already had its own passphrase vault keeps its data untouched: its existing
 *    key is simply wrapped with the account key once its passphrase is known;
 *  - loans, incomes and cheques become encrypted vault records; the server swaps each plaintext record
 *    for its ciphertext in one batch.
 * Every step is idempotent, so an interrupted run is finished by simply running it again.
 *
 * Encryption is mandatory, so there is no way back: nothing is ever decrypted into the plaintext
 * tables again.
 */

import { httpClient } from '../api/httpClient.js';
import {
  deriveE2eeKey,
  verifyE2eeKey,
  exportRawKey,
  getVaultPassphraseFromSession,
} from '../../lib/e2ee.js';
import { getPortfolios, updatePortfolio } from '../../features/portfolio/api/portfolioApi.js';
import { getLoanDocument } from './vaultApi.js';
import {
  encryptVaultRecord,
  createPortfolioKey,
  getPortfolioKey,
  wrapPortfolioKey,
  bumpVaultEpoch,
  isAccountVaultPortfolio,
} from './vaultStore.js';
import { putRecord } from './vaultRecordMeta.js';
import { movePortfolioItemsToVault } from './vaultPortfolioItems.js';
import { clearVaultLoansCache } from './vaultLoans.js';
import { clearVaultIncomesCache } from './vaultIncomes.js';
import { clearVaultChequesCache } from './vaultCheques.js';
import { clearVaultRecurringIncomesCache } from './vaultRecurringIncomes.js';

const SILENT = { silent: true };

/** A portfolio protected by its own (pre-account-vault) passphrase */
export function isLegacyVaultPortfolio(portfolio) {
  return Boolean(portfolio?.isE2ee && !portfolio.e2eeWrappedKey && portfolio.e2eeSalt && portfolio.e2eeVerifier);
}

function createReport(onProgress) {
  const report = { done: 0, total: 0, failed: [], legacyPending: [] };
  const tick = (label) => {
    report.done += 1;
    onProgress?.({ ...report, label });
  };
  const plan = (n, label) => {
    report.total += n;
    onProgress?.({ ...report, label });
  };
  return { report, tick, plan };
}

/**
 * Fetch one list for the migration. A failure is reported and yields an empty list, so one
 * unreachable section (a network hiccup) never stops the other sections from being converted.
 */
async function fetchList(report, label, fetcher, key) {
  try {
    const res = await fetcher();
    return Array.isArray(res?.[key]) ? res[key] : [];
  } catch {
    report.failed.push(`دریافت فهرست ${label}`);
    return [];
  }
}


// ── Encrypting ──────────────────────────────────────────────────────────────

/**
 * Move a portfolio's holdings and transactions into encrypted vault records (its own key). Rows
 * already encrypted in place are decrypted and moved; plaintext rows are encrypted and moved.
 */
async function encryptPortfolioItems(portfolio, key, { tick, plan, report }) {
  try {
    const moved = await movePortfolioItemsToVault(portfolio, key, {
      onItem: () => {
        plan(1, `پورتفوی «${portfolio.name}»`);
        tick(`پورتفوی «${portfolio.name}»`);
      },
    });
    report.failed.push(...moved.failed);
  } catch {
    report.failed.push(`دریافت اقلام پورتفوی «${portfolio.name}»`);
  }
}

/**
 * Put a passphrase-vault portfolio under the account vault by wrapping its existing key (derived
 * from its own passphrase). No holding or transaction is touched.
 * @returns {Promise<boolean>} false when none of the passphrases opens it
 */
export async function adoptLegacyPortfolio(portfolio, passphrases) {
  for (const candidate of [...new Set((Array.isArray(passphrases) ? passphrases : [passphrases]).filter(Boolean))]) {
    const key = await deriveE2eeKey(candidate, portfolio.e2eeSalt, { extractable: true });
    if (!(await verifyE2eeKey(key, portfolio.e2eeVerifier))) continue;
    const wrapped = await wrapPortfolioKey(await exportRawKey(key));
    // Salt and verifier are kept: the data stays encrypted with exactly the same key
    await updatePortfolio({ id: portfolio.id, e2eeWrappedKey: wrapped }, SILENT);
    return true;
  }
  return false;
}

/**
 * Encrypt everything that is still plaintext. Safe to run repeatedly.
 * @param {{ passphrase?: string, onProgress?: (p: object) => void }} [options]
 * @returns {Promise<{ done: number, total: number, failed: string[], legacyPending: object[] }>}
 */
export async function encryptAccountData({ passphrase, onProgress } = {}) {
  const { report, tick, plan } = createReport(onProgress);

  // 1. Portfolios
  const portfolios = await fetchList(report, 'پورتفوها', getPortfolios, 'portfolios');
  for (const portfolio of portfolios) {
    try {
      if (isAccountVaultPortfolio(portfolio)) {
        const key = await getPortfolioKey(portfolio);
        if (!key) {
          report.failed.push(`کلید پورتفوی «${portfolio.name}»`);
          continue;
        }
        if (!portfolio.isE2ee) await updatePortfolio({ id: portfolio.id, isE2ee: true }, SILENT);
        await encryptPortfolioItems(portfolio, key, { tick, plan, report });
      } else if (isLegacyVaultPortfolio(portfolio)) {
        const adopted = await adoptLegacyPortfolio(portfolio, [passphrase, getVaultPassphraseFromSession(portfolio.id)]);
        if (!adopted) report.legacyPending.push(portfolio);
      } else {
        const { wrapped, key } = await createPortfolioKey();
        await updatePortfolio({ id: portfolio.id, isE2ee: true, e2eeWrappedKey: wrapped, e2eeSalt: '', e2eeVerifier: '' }, SILENT);
        await encryptPortfolioItems(portfolio, key, { tick, plan, report });
      }
    } catch {
      report.failed.push(`پورتفوی «${portfolio.name}»`);
    }
  }

  // 2. Loans — the whole stored document (states + extra payments) becomes one record
  const loans = await fetchList(report, 'وام‌ها', () => httpClient.get('/api/loans'), 'loans');
  plan(loans.length, 'وام‌ها');
  for (const loan of loans) {
    try {
      const { document } = await getLoanDocument(loan.id, SILENT);
      await putRecord('loan', loan.id, await encryptVaultRecord(document), document, { replacePlain: true, ...SILENT });
    } catch {
      report.failed.push(`وام «${loan.title}»`);
    }
    tick('وام‌ها');
  }

  // 3. Incomes
  const incomes = await fetchList(report, 'درآمدها', () => httpClient.get('/api/incomes'), 'incomes');
  plan(incomes.length, 'درآمدها');
  for (const income of incomes) {
    try {
      const { userId: _userId, ...record } = income;
      await putRecord('income', income.id, await encryptVaultRecord(record), record, { replacePlain: true, ...SILENT });
    } catch {
      report.failed.push(`درآمد «${income.title}»`);
    }
    tick('درآمدها');
  }

  // 4. Cheques (with their tracking log)
  const cheques = await fetchList(report, 'چک‌ها', () => httpClient.get('/api/cheques'), 'cheques');
  plan(cheques.length, 'چک‌ها');
  for (const cheque of cheques) {
    try {
      const { userId: _userId, ...record } = cheque;
      await putRecord('cheque', cheque.id, await encryptVaultRecord(record), record, { replacePlain: true, ...SILENT });
    } catch {
      report.failed.push(`چک «${cheque.counterparty}»`);
    }
    tick('چک‌ها');
  }

  // 5. Fixed income rules
  const rules = await fetchList(report, 'درآمدهای ثابت', () => httpClient.get('/api/incomes/recurring'), 'rules');
  plan(rules.length, 'درآمدهای ثابت');
  for (const rule of rules) {
    try {
      const { userId: _userId, ...record } = rule;
      await putRecord('recurring_income', rule.id, await encryptVaultRecord(record), record, { replacePlain: true, ...SILENT });
    } catch {
      report.failed.push(`درآمد ثابت «${rule.title}»`);
    }
    tick('درآمدهای ثابت');
  }

  clearVaultLoansCache();
  clearVaultIncomesCache();
  clearVaultChequesCache();
  clearVaultRecurringIncomesCache();
  bumpVaultEpoch();
  return report;
}

/** Whether anything is still waiting to be encrypted (plaintext data or unlinked vaults) */
export async function findPendingPlaintext() {
  // Each list on its own: one failing request must not hide what the others found
  const settled = await Promise.allSettled([
    getPortfolios(),
    httpClient.get('/api/loans'),
    httpClient.get('/api/incomes'),
    httpClient.get('/api/cheques'),
    httpClient.get('/api/incomes/recurring'),
  ]);
  const [pRes, loansRes, incomesRes, chequesRes, rulesRes] = settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
  if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
  const portfolios = pRes?.portfolios || [];
  return {
    plainPortfolios: portfolios.filter((p) => !p.isE2ee && !p.e2eeWrappedKey),
    legacyPortfolios: portfolios.filter(isLegacyVaultPortfolio),
    plainLoans: (loansRes?.loans || []).length,
    plainIncomes: (incomesRes?.incomes || []).length,
    plainCheques: (chequesRes?.cheques || []).length,
    plainRecurringIncomes: (rulesRes?.rules || []).length,
  };
}
