import { t } from '../../utils/i18n.js';
import {
  BANKS,
  BANK_TYPES,
  getBankById,
  isCustomBankId,
  matchBankIdByName,
  normalizeBankName,
} from '../../config/banks.config.js';

export { BANKS, BANK_TYPES, getBankById, isCustomBankId, matchBankIdByName };

/** The dictionary key of a bank's short name: short names are common words (مسکن, شهر), so they are keyed apart from other texts */
const SHORT_NAME_KEY = 'بانک · '; // i18n-ignore

/** A standard bank's full name in the active language (English: its registry `enName` via the catalog) */
export const bankName = (bank) => t(bank.name);

/** A standard bank's compact name in the active language */
export const bankShortName = (bank) => {
  const key = SHORT_NAME_KEY + bank.shortName;
  const text = t(key);
  return text === key ? bank.shortName : text;
};

/** Public URL of a standard bank's logo, or null when it has none (`noLogo`: shown by its initial) */
export function bankLogoUrl(id) {
  const bank = getBankById(id);
  return bank && !bank.noLogo ? `/banks/${id}.svg` : null;
}

/**
 * @typedef {object} ResolvedBank
 * @property {string} key        Grouping key: same bank → same key, across id/name variations
 * @property {string} id         Standard or custom bank id ('' when only a free-text name is known)
 * @property {string} name
 * @property {string} shortName
 * @property {string|null} logo  Logo URL (standard banks only)
 * @property {'standard'|'custom'|'text'|'none'} kind
 */

/**
 * Turn whatever a record stores ({ bankId, lenderName }) into a displayable bank.
 * Older records only have a free-text lender name; those still resolve to the standard bank
 * when the name matches one, so they get its logo and group with it.
 * @param {{ bankId?: string, lenderName?: string }} ref
 * @param {Array<{ id: string, name: string }>} [customBanks]
 * @returns {ResolvedBank}
 */
export function resolveBank(ref, customBanks = []) {
  const bankId = String(ref?.bankId || '').trim();
  const lenderName = String(ref?.lenderName || '').trim();

  const standard = getBankById(bankId) || getBankById(matchBankIdByName(lenderName));
  if (standard) {
    return {
      key: standard.id,
      id: standard.id,
      name: bankName(standard),
      shortName: bankShortName(standard),
      logo: bankLogoUrl(standard.id),
      kind: 'standard',
    };
  }

  if (isCustomBankId(bankId)) {
    const custom = customBanks.find((b) => b.id === bankId);
    const name = custom?.name || lenderName || t('بانک سفارشی');
    return { key: bankId, id: bankId, name, shortName: name, logo: null, kind: 'custom' };
  }

  if (lenderName) {
    return { key: `name:${normalizeBankName(lenderName)}`, id: '', name: lenderName, shortName: lenderName, logo: null, kind: 'text' };
  }

  return { key: '__none__', id: '', name: t('بدون بانک مشخص'), shortName: t('بدون بانک'), logo: null, kind: 'none' };
}

/** Standard banks grouped for pickers, legacy (dissolved) banks left out */
export function getBankGroups() {
  return Object.entries(BANK_TYPES)
    .map(([type, label]) => ({ type, label: t(label), banks: BANKS.filter((b) => b.type === type && !b.legacy) }))
    .filter((group) => group.banks.length > 0);
}
