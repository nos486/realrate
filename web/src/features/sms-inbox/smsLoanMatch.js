/**
 * smsLoanMatch.js — Which loan installment a bank withdrawal most likely pays
 *
 * A withdrawal whose amount equals the next unpaid installment of one of the user's loans (in
 * tomans) is suggested as that installment's payment; the user confirms it (the inbox row's
 * «تأیید قسط» button, or the form it opens), and only then is it recorded and the installment
 * marked paid. The loans are the decrypted ones the app already holds, so nothing leaves the
 * browser. Several loans with the same installment: the one of the message's own bank, else none
 * (never a guess).
 */

const toman = (n) => Math.round(Number(n) || 0);

/**
 * @param {{ direction: string, amount: number, bankId?: string, description?: string }} tx a bank message
 * @param {Array<{ id: string, title?: string, bankId?: string, nextDueInstallment?: { id?: string|number, installmentNumber?: number, totalAmount: number }|null }>} loans
 * @returns {{ loan: object, installment: object }|null}
 */
export function matchSmsLoanInstallment(tx, loans = []) {
  if (tx?.direction !== 'debit' || !(tx.amount > 0)) return null;
  const hits = loans
    .filter((l) => l.nextDueInstallment && toman(l.nextDueInstallment.totalAmount) === toman(tx.amount))
    .map((loan) => ({ loan, installment: loan.nextDueInstallment }));
  if (hits.length === 1) return hits[0];
  // Same amount in several loans: the bank of the message decides; a message that says it is an
  // installment is the only other hint, and does not pick between loans
  const ofBank = hits.filter((h) => tx.bankId && h.loan.bankId === tx.bankId);
  if (ofBank.length === 1) return ofBank[0];
  return null;
}

