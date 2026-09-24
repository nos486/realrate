import {
  BANKS,
  BANK_TYPES,
  getBankById,
  isCustomBankId,
  matchBankIdByName,
  normalizeBankName,
} from '../../config/banks.config.js';

export { BANKS, BANK_TYPES, getBankById, isCustomBankId, matchBankIdByName };

/** Public URL of a standard bank's logo */
export function bankLogoUrl(id) {
  return `/banks/${id}.svg`;
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
      name: standard.name,
      shortName: standard.shortName,
      logo: bankLogoUrl(standard.id),
      kind: 'standard',
    };
  }

  if (isCustomBankId(bankId)) {
    const custom = customBanks.find((b) => b.id === bankId);
    const name = custom?.name || lenderName || 'بانک سفارشی';
    return { key: bankId, id: bankId, name, shortName: name, logo: null, kind: 'custom' };
  }

  if (lenderName) {
    return { key: `name:${normalizeBankName(lenderName)}`, id: '', name: lenderName, shortName: lenderName, logo: null, kind: 'text' };
  }

  return { key: '__none__', id: '', name: 'بدون بانک مشخص', shortName: 'بدون بانک', logo: null, kind: 'none' };
}

/** Standard banks grouped for pickers, legacy (dissolved) banks left out */
export function getBankGroups() {
  return Object.entries(BANK_TYPES)
    .map(([type, label]) => ({ type, label, banks: BANKS.filter((b) => b.type === type && !b.legacy) }))
    .filter((group) => group.banks.length > 0);
}
