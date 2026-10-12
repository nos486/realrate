/**
 * smsAccounts.js — The account a bank SMS belongs to, created from the message when it has none
 *
 * Every income and expense is tied to an account, so a message from a bank (or a card) the user
 * has no account for makes one: the bank, and the card's or account's last digits the message
 * names (utils/bankSms.js reads them). The next message of the same card then matches it
 * (matchSmsAccount). A message naming no digits goes to the bank's account when there is one.
 * Creations are serialized, so two messages arriving together make one account, not two.
 */

import { resolveBank } from '../../shared/banks/resolveBank.js';
import { matchSmsAccount } from '../../utils/bankSms.js';
import { saveAccount } from '../../shared/vault/vaultAccounts.js';

const faDigits = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** The account a message describes, as AccountForm saves it (a toman bank account) */
export function smsAccountInput(tx) {
  const bank = resolveBank({ bankId: tx.bankId });
  const base = bank.shortName || 'حساب بانکی';
  return {
    type: 'bank',
    // A card's digits show beside the name already (accountLabel); an account's do not
    name: !tx.cardLast4 && tx.accountLast4 ? `${base} ${faDigits(tx.accountLast4)}` : base,
    bankId: tx.bankId || '',
    bankName: bank.name || '',
    cardLast4: tx.cardLast4 || '',
    accountNumber: tx.accountLast4 || '',
    currencies: ['IRT'],
    notes: 'ساخته‌شده خودکار از پیامک بانک',
  };
}

let queue = Promise.resolve();

/**
 * The id of the account a message belongs to: the matching one, else a new one made from the
 * message. `accounts` is the caller's list of active accounts and gets the new one pushed to it,
 * so the next message sees it. Returns '' when the account cannot be made.
 * @param {object} tx a parsed bank SMS (utils/bankSms.js)
 * @param {object[]} accounts
 * @returns {Promise<string>}
 */
export function ensureSmsAccount(tx, accounts) {
  const run = queue.catch(() => {}).then(async () => {
    const matched = matchSmsAccount(tx, accounts);
    if (matched) return matched;
    // No digits to tell them apart: the bank's first account, rather than another one per message
    if (!tx.cardLast4 && !tx.accountLast4) {
      const ofBank = accounts.find((a) => !a.archived && a.bankId === tx.bankId && (a.currencies || [a.currency || 'IRT']).includes('IRT'));
      if (ofBank) return ofBank.id;
    }
    try {
      const { account } = await saveAccount(smsAccountInput(tx));
      accounts.push(account);
      return account.id;
    } catch (err) {
      console.warn('Creating an account from an SMS failed:', err);
      return '';
    }
  });
  queue = run;
  return run;
}
