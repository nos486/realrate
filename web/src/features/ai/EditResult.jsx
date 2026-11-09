/**
 * EditResult.jsx — The `edit` intent after it was applied: a line saying what happened
 */

import React from 'react';
import { t } from '../../utils/i18n.js';

/** @param {{ answer: { op: string, candidates: object[], chosenId: string } }} props */
export default function EditResult({ answer }) {
  const title = answer.candidates.find((c) => c.record.id === answer.chosenId)?.record.title || '';
  return <strong className="ai-assistant-heading">{answer.op === 'delete' ? t('«{title}» پاک شد', { title }) : t('«{title}» اصلاح شد', { title })}</strong>;
}
