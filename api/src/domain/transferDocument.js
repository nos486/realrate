/**
 * transferDocument.js — Money moved between the user's own accounts (cash management)
 *
 * Moving money from one of your accounts to another — card to card between your own banks,
 * withdrawing cash, topping up an e-wallet — is neither spending nor income: the money is still
 * yours. A transfer is its own end-to-end encrypted vault record ("transfer"), kept out of every
 * expense and income total:
 *
 *   { id, fromAccountId, toAccountId, amount, fee?, date, notes?, smsKeys?, createdAt, updatedAt }
 *
 * - amount: tomans that left `fromAccountId` and reached `toAccountId`
 * - fee: what the bank kept (tomans), optional — informational, not an expense
 * - smsKeys: the bank messages it was recorded from (the withdrawal and / or the deposit), so
 *   neither waits again as an expense or an income (bankSms.js)
 * Shared by the browser and the API, like the other domain modules.
 */

export const TRANSFER_LIMITS = {
  notesLength: 300,
  maxAmount: 1e13,
  smsKeys: 2,
};

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v) => String(v ?? '').trim();

/**
 * Validate & normalize a transfer
 * @returns {{ value?: object, error?: string }}
 */
export function validateTransfer(body = {}) {
  const fromAccountId = text(body.fromAccountId);
  const toAccountId = text(body.toAccountId);
  if (!fromAccountId || !toAccountId) return { error: 'حساب مبدأ و مقصد را انتخاب کنید.' };
  if (!ID_RE.test(fromAccountId) || !ID_RE.test(toAccountId)) return { error: 'حساب انتخاب‌شده نامعتبر است.' };
  if (fromAccountId === toAccountId) return { error: 'حساب مبدأ و مقصد نمی‌توانند یکی باشند.' };

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'مبلغ انتقال باید بیشتر از صفر باشد.' };
  if (amount > TRANSFER_LIMITS.maxAmount) return { error: 'مبلغ انتقال بیش از حد مجاز است.' };

  const fee = Math.round(Number(body.fee) || 0);
  if (fee < 0 || fee > amount) return { error: 'کارمزد نامعتبر است.' };

  const date = text(body.date);
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'تاریخ انتقال نامعتبر است.' };

  const notes = text(body.notes);
  if (notes.length > TRANSFER_LIMITS.notesLength) return { error: `یادداشت نباید بیشتر از ${TRANSFER_LIMITS.notesLength} کاراکتر باشد.` };

  const smsKeys = [...new Set((Array.isArray(body.smsKeys) ? body.smsKeys : []).map((k) => text(k).slice(0, 120)).filter(Boolean))]
    .slice(0, TRANSFER_LIMITS.smsKeys);

  return {
    value: {
      fromAccountId,
      toAccountId,
      amount,
      ...(fee > 0 ? { fee } : {}),
      date,
      notes,
      ...(smsKeys.length ? { smsKeys } : {}),
    },
  };
}

/** Newest first, then the most recently recorded */
export function compareTransfers(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

/**
 * What moved in and out of each account: Map accountId → { in, out, count }
 * @param {object[]} transfers
 */
export function summarizeTransfersByAccount(transfers = []) {
  const byAccount = new Map();
  const entry = (id) => {
    if (!byAccount.has(id)) byAccount.set(id, { in: 0, out: 0, count: 0 });
    return byAccount.get(id);
  };
  for (const t of transfers) {
    const amount = Number(t.amount) || 0;
    const from = entry(t.fromAccountId);
    from.out += amount;
    from.count += 1;
    const to = entry(t.toAccountId);
    to.in += amount - (Number(t.fee) || 0);
    to.count += 1;
  }
  return byAccount;
}
