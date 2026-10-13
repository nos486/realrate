/**
 * recordOrigin.js — Where an expense or an income came from: typed by hand, read automatically
 * (a bank SMS, an imported bank statement), or recorded by another feature (a loan's installment,
 * a subscription's payment, a cleared cheque: recordOwners.js)
 *
 * The lists show it, so the user can tell what they entered from what the app read or made.
 * A hand-typed record that is linked to a loan installment, a subscription or a cheque says so.
 */

import { recordOwnerInfo } from '../../utils/recordOwners.js';

/**
 * @param {object} record an expense or an income
 * @returns {{ kind: 'import'|'sms'|'system'|'linked'|'manual', label: string, hint: string }}
 */
export function recordOriginOf(record) {
  const owner = recordOwnerInfo(record);
  if (owner) return { kind: 'system', label: `ثبت سیستمی · ${owner.label}`, hint: `این را بخش «${owner.label}» ثبت کرده` };
  if (record?.source === 'import') return { kind: 'import', label: 'ورود خودکار · فایل بانک', hint: 'از فایل خروجی بانک خوانده شده؛ مثل بقیه قابل ویرایش است' };
  if (record?.source === 'sms' || record?.smsKey) return { kind: 'sms', label: 'ورود خودکار · پیامک', hint: 'از پیامک بانک خوانده شده؛ مثل بقیه قابل ویرایش است' };
  if (record?.loanInstallment) return { kind: 'linked', label: 'وصل به وام', hint: 'پرداخت یک قسط وام است' };
  if (record?.subscriptionId) return { kind: 'linked', label: 'وصل به اشتراک', hint: 'پرداخت یک اشتراک است' };
  if (record?.chequeId) return { kind: 'linked', label: 'وصل به چک', hint: 'با یک چک پرداخت یا وصول شده' };
  return { kind: 'manual', label: '', hint: '' };
}
