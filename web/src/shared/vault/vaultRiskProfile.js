/**
 * vaultRiskProfile.js — A portfolio's latest risk-tolerance test result under the account vault
 *
 * One encrypted 'risk_profile' record per portfolio in vault_records (parent_id = the portfolio,
 * encrypted with the portfolio's own key, id derived from the portfolio so each portfolio has
 * exactly one). Only the latest result is kept (domain/riskProfile.js).
 */

import { e2eeEncrypt, e2eeDecrypt } from '../../lib/e2ee.js';
import { listVaultRecords } from './vaultApi.js';
import { putRecord } from './vaultRecordMeta.js';
import { RISK_RECORD_KIND, validateRiskResult } from '../../utils/riskProfile.js';

const SILENT = { silent: true };
const recordIdOf = (portfolioId) => `risk_${portfolioId}`.slice(0, 80);

/**
 * Load and decrypt the portfolio's test result
 * @param {string} portfolioId
 * @param {CryptoKey} key portfolio vault key
 * @returns {Promise<object|null>} the stored result, or null when the test was never taken
 */
export async function loadRiskProfile(portfolioId, key) {
  if (!portfolioId || !key) return null;
  const res = await listVaultRecords(RISK_RECORD_KIND, SILENT, { parent: portfolioId });
  const record = res?.records?.[0];
  if (!record) return null;
  const plain = await e2eeDecrypt(key, record.payload);
  return validateRiskResult(plain).value || null;
}

/**
 * Store a finished test (replacing the previous result)
 * @param {string} portfolioId
 * @param {CryptoKey} key portfolio vault key
 * @param {{ totalAsset: number, answers: number[] }} input
 * @returns {Promise<object>} the stored result
 */
export async function saveRiskProfile(portfolioId, key, input) {
  if (!portfolioId || !key) throw new Error('شناسه پورتفو و کلید رمزنگاری الزامی است.');
  const { value, error } = validateRiskResult(input);
  if (error) throw new Error(error);
  await putRecord(RISK_RECORD_KIND, recordIdOf(portfolioId), await e2eeEncrypt(key, value), value, { parentId: portfolioId, ...SILENT });
  return value;
}
