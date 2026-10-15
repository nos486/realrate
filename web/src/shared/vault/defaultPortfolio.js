/**
 * defaultPortfolio.js — Every account has a portfolio to start with, under the account vault
 *
 * The browser creates it, with its own random data key wrapped by the account key, right after
 * the vault is set up (VaultEnableForm, the demo) and whenever the account has none (a portfolio
 * page opened with an empty list): the server never creates a portfolio without a key.
 */

import { getPortfolios, createPortfolio } from '../../features/portfolio/api/portfolioApi.js';
import { createPortfolioKey } from './vaultStore.js';
import { t } from '../../utils/i18n.js';

/** Name of the first portfolio */
export const DEFAULT_PORTFOLIO_NAME = t('پورتفوی اصلی');

/** Requests already running, so two callers never create two portfolios */
let creating = null;

/**
 * The user's portfolios, with a first one created when there is none (the vault must be unlocked)
 * @param {object[]} [known] the list the caller just read, to skip reading it again
 * @returns {Promise<object[]>}
 */
export async function ensureDefaultPortfolio(known = null) {
  const list = known || (await getPortfolios())?.portfolios || [];
  if (list.length) return list;
  if (!creating) {
    creating = (async () => {
      const { wrapped } = await createPortfolioKey();
      const res = await createPortfolio({ name: DEFAULT_PORTFOLIO_NAME, e2eeWrappedKey: wrapped });
      return res?.portfolio ? [res.portfolio] : [];
    })().finally(() => {
      creating = null;
    });
  }
  return creating;
}
