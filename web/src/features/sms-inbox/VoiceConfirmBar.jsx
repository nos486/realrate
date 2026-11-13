/**
 * VoiceConfirmBar.jsx — «درست فهمیدم؟»: the bar at the bottom that waits for the user after a voice note
 *
 * The note on a bank message is read (title and category) but not recorded until the user confirms it
 * here; «اصلاح» listens again for the same message. It shows what was understood so a wrong word
 * (or a wrong category) is seen before anything is saved.
 */

import { t } from '../../utils/i18n.js';
import React from 'react';
import { Mic, Check, X } from 'lucide-react';
import { Button, IconButton } from '../../shared/ui/index.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { getIncomeCategory } from '../incomes/constants/incomeCategories.js';

/**
 * @param {{ review: { item: object, answer: { title: string, category: string }, saving: boolean }|null,
 *   onConfirm: () => void, onCorrect: () => void, onDismiss: () => void }} props
 */
export default function VoiceConfirmBar({ review, onConfirm, onCorrect, onDismiss }) {
  if (!review) return null;
  const { item, answer, saving } = review;
  const deposit = item.tx.direction === 'credit';
  const category = (deposit ? getIncomeCategory : getExpenseCategory)(answer.category).label;
  return (
    <div className="sms-voice-confirm" role="region" aria-label={t('درست فهمیدم؟')}>
      <div className="sms-voice-confirm-body">
        <span className="sms-voice-confirm-title">{answer.title}</span>
        <span className="sms-voice-confirm-category">{category}</span>
      </div>
      <div className="sms-voice-confirm-actions">
        <Button variant="secondary" size="sm" icon={<Mic size={15} />} onClick={onCorrect} disabled={saving}>{t('اصلاح')}</Button>
        <Button size="sm" icon={<Check size={15} />} onClick={onConfirm} loading={saving}>{t('ثبت')}</Button>
        <IconButton label={t('بستن')} icon={<X size={16} />} onClick={onDismiss} disabled={saving} />
      </div>
    </div>
  );
}
