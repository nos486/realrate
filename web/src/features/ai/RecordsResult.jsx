/**
 * RecordsResult.jsx — The AI assistant's answer to a spoken list of transactions: what was recorded
 */

import React from 'react';
import { HandCoins, Wallet } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { getCategory } from '../../shared/categories/categoryStore.js';
import { formatAmount } from '../expenses/utils/format.js';

/** @param {{ answer: { items: object[] } }} props */
export default function RecordsResult({ answer }) {
  return (
    <>
      <strong className="ai-assistant-heading">{t('{n} مورد ثبت شد', { n: answer.items.length })}</strong>
      <ul className="ai-assistant-list">
        {answer.items.map((item, i) => {
          const Icon = item.kind === 'income' ? Wallet : HandCoins;
          return (
            <li key={i} className={`is-${item.kind}`}>
              <Icon size={18} aria-hidden="true" />
              <span className="ai-assistant-title">{item.title}<small>{getCategory(item.kind, item.category).label} · {item.date}</small></span>
              <span className="ai-assistant-amount">{formatAmount(item.amount)}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
