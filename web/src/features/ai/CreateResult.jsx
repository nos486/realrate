/**
 * CreateResult.jsx — The `create` intent after it was saved: a line saying what was made
 */

import React from 'react';
import { t } from '../../utils/i18n.js';
import { SPECS } from './aiCreate.js';

/** @param {{ answer: { type: string, data: object } }} props */
export default function CreateResult({ answer }) {
  const spec = SPECS[answer.type];
  return <strong className="ai-assistant-heading">{t('{type} «{title}» ثبت شد', { type: spec.label(), title: spec.title(answer.data) })}</strong>;
}
