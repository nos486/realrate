/**
 * CategoryLinkField.jsx — The record an income or an expense names, chosen under its category
 *
 * One field for every link of utils/categoryLinks.js: the form renders it below the category and
 * the category decides what it offers — the asset bought or sold (PortfolioLinkFields), the loan
 * installment paid, the subscription paid, the cheque paid or cashed, the credit settled. A new
 * link is one entry in that table and one picker here.
 *
 * Every picker takes the same props: `value` / `onChange` (the link's value, as the record
 * stores it in the link's field), `onFill` (fields a choice fills in: title, amount, currency,
 * account) and what it needs of the record (`recordId`, `title`, `toman`, `keepId`).
 */

import React from 'react';
import { categoryLinkOf } from '../../utils/categoryLinks.js';
import PortfolioLinkFields from '../vault/PortfolioLinkFields.jsx';
import CreditAccountPicker from '../../features/incomes/components/CreditAccountPicker.jsx';
import ChequeLinkPicker from '../../features/cheques/components/ChequeLinkPicker.jsx';
import LoanInstallmentPicker from '../../features/loans/components/LoanInstallmentPicker.jsx';
import SubscriptionLinkPicker from '../../features/subscriptions/components/SubscriptionLinkPicker.jsx';

/** A portfolio entry: bought with an expense, sold for an income */
function PortfolioPicker({ side, value, onChange, toman = 0, own = null }) {
  return <PortfolioLinkFields mode={side === 'income' ? 'sell' : 'buy'} value={value} onChange={onChange} toman={toman} own={own} />;
}

/** Each link target's picker */
const PICKERS = {
  portfolio: PortfolioPicker,
  credit_account: CreditAccountPicker,
  cheque: ChequeLinkPicker,
  loan_installment: LoanInstallmentPicker,
  subscription: SubscriptionLinkPicker,
};

/**
 * @param {{ side: 'expense'|'income', category: string, value: unknown, onChange: (value: unknown) => void,
 *   onFill?: (fields: object) => void, recordId?: string, title?: string, toman?: number, keepId?: string,
 *   own?: object|null }} props — own: a sale's link as stored (its quantity is still the portfolio's)
 */
export default function CategoryLinkField({ side, category, ...props }) {
  const link = categoryLinkOf(side, category);
  const Picker = link ? PICKERS[link.target] : null;
  return Picker ? <Picker side={side} {...props} /> : null;
}
