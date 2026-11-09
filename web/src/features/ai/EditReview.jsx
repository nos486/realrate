/**
 * EditReview.jsx — The `edit` intent's answer before anything changes: which record the voice means
 * (the matches are listed to pick from) and exactly what happens to it
 */

import React, { useEffect, useRef } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { t } from '../../utils/i18n.js';
import { SkeletonRows } from '../../shared/ui/index.js';
import { getCategory } from '../../shared/categories/categoryStore.js';
import { formatAmount } from '../expenses/utils/format.js';
import { findEditCandidates } from './aiEdit.js';

const FIELD_LABELS = { amount: () => t('مبلغ'), title: () => t('عنوان'), category: () => t('دسته'), date: () => t('روز'), accountId: () => t('حساب') };

/** A change's value as shown */
function shown(field, value, kind, accounts) {
  if (field === 'amount') return `${formatAmount(value)} ${t('تومان')}`;
  if (field === 'category') return getCategory(kind, value).label;
  if (field === 'accountId') return accounts.find((a) => a.id === value)?.name || t('بدون حساب');
  return String(value);
}

/**
 * @param {{ answer: object, onChange: (answer: object) => void, context: { accounts: Array<{ id: string, name: string }> } }} props
 */
export default function EditReview({ answer, onChange, context }) {
  const accounts = context?.accounts || [];
  const started = useRef(false);
  // The records are looked up once, when the card shows
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    findEditCandidates(answer)
      .then((candidates) => onChange({ ...answer, candidates, chosenId: candidates[0]?.record.id || '' }))
      .catch(() => onChange({ ...answer, candidates: [], chosenId: '' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!answer.candidates) return <SkeletonRows rows={2} columns={2} label={t('در حال یافتن رکورد')} />;
  if (!answer.candidates.length) return <p className="ai-assistant-hint">{t('رکوردی که بشود با صدا تغییرش داد پیدا نشد.')}</p>;

  const chosen = answer.candidates.find((c) => c.record.id === answer.chosenId);
  const Icon = answer.op === 'delete' ? Trash2 : Pencil;
  return (
    <div className="ai-edit">
      {answer.candidates.length > 1 && <p className="ai-assistant-hint">{t('کدام یکی؟')}</p>}
      <ul className="ai-edit-list">
        {answer.candidates.map(({ kind, record }) => (
          <li key={record.id}>
            <label className={`ai-edit-item ${record.id === answer.chosenId ? 'is-chosen' : ''}`}>
              {answer.candidates.length > 1 && <input type="radio" name="ai-edit" checked={record.id === answer.chosenId} onChange={() => onChange({ ...answer, chosenId: record.id })} />}
              <span className="ai-assistant-title">{record.title}<small>{getCategory(kind, record.category).label} · {kind === 'income' ? record.incomeDate : record.date}</small></span>
              <span className="ai-assistant-amount">{formatAmount(record.amount)}</span>
            </label>
          </li>
        ))}
      </ul>
      {chosen && (
        <div className={`ai-edit-change ${answer.op === 'delete' ? 'is-delete' : ''}`}>
          <Icon size={16} aria-hidden="true" />
          {answer.op === 'delete' ? (
            <span>{t('این مورد پاک می‌شود.')}</span>
          ) : (
            <ul>
              {Object.entries(answer.changes).map(([field, value]) => (
                <li key={field}>{FIELD_LABELS[field]()}: {shown(field, value, chosen.kind, accounts)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
