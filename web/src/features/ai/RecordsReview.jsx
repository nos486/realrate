/**
 * RecordsReview.jsx — The `records` intent's answer before anything is saved: every expense and
 * income the voice described, to correct and complete
 *
 * What the voice did not give is asked here: an amount that was not understood is a field to fill
 * (the card cannot be confirmed without it) and an account that was not named is a list to pick
 * from. Kind, title, category and day can be changed, and a wrong item removed.
 */

import React from 'react';
import { HandCoins, Wallet, Trash2 } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { NumericInput, IconButton, Input } from '../../shared/ui/index.js';
import DateField from '../../shared/form/DateField.jsx';
import { listCategories } from '../../shared/categories/categoryStore.js';
import { gregorianToShamsi, shamsiToGregorian } from '../portfolio/components/ShamsiDatePicker.jsx';
import { FALLBACK_CATEGORY } from '../../utils/categoryDocument.js';

const KINDS = [{ value: 'expense', label: t('هزینه'), Icon: HandCoins }, { value: 'income', label: t('درآمد'), Icon: Wallet }];

/**
 * @param {{ answer: { items: object[] }, onChange: (answer: object) => void,
 *   context: { accounts: Array<{ id: string, name: string }> } }} props
 */
export default function RecordsReview({ answer, onChange, context }) {
  const accounts = context?.accounts || [];
  const setItem = (index, patch) => onChange({ ...answer, items: answer.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const removeItem = (index) => onChange({ ...answer, items: answer.items.filter((_, i) => i !== index) });
  // The category list of a kind, keeping the one the item has
  const categoriesOf = (item) => listCategories(item.kind, { keep: item.category }).filter((c) => !c.excluded || c.value === item.category);

  return (
    <ul className="ai-review">
      {answer.items.map((item, i) => {
        const needsAmount = !(item.amount > 0);
        const needsAccount = accounts.length > 0 && !item.accountId;
        return (
          <li key={i} className={`ai-review-item is-${item.kind}`}>
            <div className="ai-review-row">
              <select className="ui-input-control ai-review-kind" aria-label={t('نوع')} value={item.kind} onChange={(e) => setItem(i, { kind: e.target.value, category: FALLBACK_CATEGORY })}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <Input size="sm" aria-label={t('عنوان')} value={item.title} maxLength={120} onChange={(e) => setItem(i, { title: e.target.value })} />
              <IconButton icon={<Trash2 size={16} />} label={t('حذف این مورد')} onClick={() => removeItem(i)} />
            </div>
            <NumericInput
              className={`ui-input-control ${needsAmount ? 'is-missing' : ''}`}
              aria-label={t('مبلغ')}
              placeholder={t('مبلغ را وارد کنید')}
              affix={t('تومان')}
              value={item.amount ? String(item.amount) : ''}
              onValueChange={(v) => setItem(i, { amount: Math.round(Number(String(v).replace(/[^\d]/g, ''))) || 0 })}
            />
            <div className="ai-review-row">
              <select className="ui-input-control" aria-label={t('دسته')} value={item.category} onChange={(e) => setItem(i, { category: e.target.value })}>
                {categoriesOf(item).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {accounts.length > 0 && (
                <select
                  className={`ui-input-control ${needsAccount ? 'is-missing' : ''}`}
                  aria-label={t('حساب')}
                  value={item.accountId}
                  onChange={(e) => setItem(i, { accountId: e.target.value })}
                >
                  <option value="">{t('کدام حساب؟ (بدون حساب)')}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
            <DateField label={t('روز')} value={gregorianToShamsi(`${item.date}T00:00:00`)} onChange={(shamsi) => setItem(i, { date: shamsiToGregorian(shamsi) || item.date })} />
          </li>
        );
      })}
    </ul>
  );
}
