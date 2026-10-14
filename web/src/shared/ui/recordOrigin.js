/**
 * recordOrigin.js — Where an expense or an income came from: typed by hand, read automatically
 * (a bank SMS, an imported bank statement), or recorded by another feature (a loan's installment,
 * a subscription's payment, a cleared cheque: recordOwners.js)
 *
 * The lists show it, so the user can tell what they entered from what the app read or made.
 * A hand-typed record that is linked to a loan installment, a subscription or a cheque says so.
 */

import { t } from '../../utils/i18n.js';
import { recordOwnerInfo } from '../../utils/recordOwners.js';

/**
 * @param {object} record an expense or an income
 * @returns {{ kind: 'import'|'sms'|'system'|'linked'|'manual', label: string, hint: string }}
 */
export function recordOriginOf(record) {
  const owner = recordOwnerInfo(record);
  if (owner) return { kind: 'system', label: t('ثبت سیستمی · {owner}', { owner: t(owner.label) }), hint: t('این را بخش «{owner}» ثبت کرده', { owner: t(owner.label) }) };
  if (record?.source === 'import') return { kind: 'import', label: t('ورود خودکار · فایل بانک'), hint: t('از فایل خروجی بانک خوانده شده؛ مثل بقیه قابل ویرایش است') };
  if (record?.source === 'sms' || record?.smsKey) return { kind: 'sms', label: t('ورود خودکار · پیامک'), hint: t('از پیامک بانک خوانده شده؛ مثل بقیه قابل ویرایش است') };
  if (record?.loanInstallment) return { kind: 'linked', label: t('وصل به وام'), hint: t('پرداخت یک قسط وام است') };
  if (record?.subscriptionId) return { kind: 'linked', label: t('وصل به اشتراک'), hint: t('پرداخت یک اشتراک است') };
  if (record?.chequeId) return { kind: 'linked', label: t('وصل به چک'), hint: t('با یک چک پرداخت یا وصول شده') };
  return { kind: 'manual', label: '', hint: '' };
}
