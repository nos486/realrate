/**
 * PlanNote.jsx — «پلن رایگان» note on a section: what the free plan allows there and how much of it
 * the user has used, with a link to the page comparing the plans. Nothing is shown on Pro.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { usePlan, PRO_PATH } from './usePlan.js';
import { SECTION_LIMITS, describeLimit } from './planText.js';
import { appPath } from '../routes.js';
import { t } from '../../utils/i18n.js';

/**
 * @param {object} props
 * @param {string} props.section - a key of SECTION_LIMITS (the open tab)
 */
export default function PlanNote({ section }) {
  const { pro, usage } = usePlan();
  const keys = SECTION_LIMITS[section];
  if (pro || !keys) return null;
  const parts = keys.map((key) => describeLimit(key, usage)).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="plan-note" role="note">
      <span className="plan-note-badge">{t('پلن رایگان')}</span>
      <span className="plan-note-text">{parts.join(' · ')}</span>
      <Link className="plan-note-link" to={appPath(PRO_PATH)}>
        <Crown size={14} aria-hidden="true" />
        <span>{t('مقایسه با Pro')}</span>
      </Link>
    </div>
  );
}

