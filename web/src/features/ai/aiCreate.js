/**
 * aiCreate.js — The `create` intent: a new cheque or subscription filled in from what the voice said
 *
 * One table of types (SPECS), each with the fields of its form, what makes it complete, and how it is
 * saved and taken back — a new type is a new row, with its prompt part and normalizer on the server
 * (api/src/domain/aiAssistant.js). The fields are shown for the user to correct before saving
 * (CreateReview.jsx); everything is validated again by the type's own validator when saved.
 */

import { t } from '../../utils/i18n.js';
import { createCheque, deleteCheque } from '../../shared/vault/vaultCheques.js';
import { saveSubscription, deleteSubscription } from '../../shared/vault/vaultSubscriptions.js';

/** Field kinds: 'text', 'amount' (tomans), 'day' (ISO day), 'select' (`options`), 'bool', 'account' (the user's accounts) */
export const SPECS = {
  cheque: {
    label: () => t('چک'),
    fields: [
      { key: 'direction', kind: 'select', label: () => t('نوع'), options: () => [{ value: 'received', label: t('دریافتی') }, { value: 'issued', label: t('صادره') }] },
      { key: 'counterparty', kind: 'text', label: () => t('طرف حساب'), required: true },
      { key: 'amount', kind: 'amount', label: () => t('مبلغ'), required: true },
      { key: 'dueDate', kind: 'day', label: () => t('سررسید') },
      { key: 'bankName', kind: 'text', label: () => t('بانک') },
      { key: 'accountId', kind: 'account', label: () => t('حساب') },
    ],
    title: (data) => data.counterparty,
    save: async (data) => (await createCheque(data)).cheque,
    remove: (record) => deleteCheque(record.id),
  },
  subscription: {
    label: () => t('اشتراک'),
    fields: [
      { key: 'name', kind: 'text', label: () => t('نام اشتراک'), required: true },
      { key: 'amount', kind: 'amount', label: () => t('مبلغ هر دوره'), required: true },
      { key: 'cycleMonths', kind: 'select', number: true, label: () => t('دوره'), options: () => [{ value: 1, label: t('ماهانه') }, { value: 3, label: t('سه‌ماهه') }, { value: 6, label: t('شش‌ماهه') }, { value: 12, label: t('سالانه') }] },
      { key: 'startDate', kind: 'day', label: () => t('شروع') },
      { key: 'autoRenew', kind: 'bool', label: () => t('تمدید خودکار') },
      { key: 'accountId', kind: 'account', label: () => t('حساب') },
    ],
    title: (data) => data.name,
    save: async (data) => (await saveSubscription(data)).subscription,
    remove: (record) => deleteSubscription(record.id),
  },
};

/** Whether the filled form can be saved: every required field has a value (an amount above zero) */
export function createReady(answer) {
  const spec = SPECS[answer.type];
  return Boolean(spec) && spec.fields.filter((f) => f.required).every((f) => (f.kind === 'amount' ? answer.data[f.key] > 0 : String(answer.data[f.key] ?? '').trim()));
}

/** Save the new cheque or subscription; the handle undo needs */
export async function applyCreate(answer) {
  return { type: answer.type, record: await SPECS[answer.type].save(answer.data) };
}

/** Delete what applyCreate saved */
export async function undoCreate({ type, record }) {
  await SPECS[type].remove(record);
}
