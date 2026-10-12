/**
 * PlanNote.jsx — «پلن رایگان» note on a section: what the free plan allows there and how much of it
 * the user has used, with a link to the page comparing the plans. Nothing is shown on Pro.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { usePlan, PRO_PATH } from './usePlan.js';
import { PLAN_LIMITS, FREE_SMS_READS } from '../../config/planLimits.js';
import { smsFreeUsage } from '../native/smsPlan.js';
import { appPath } from '../routes.js';

const faNum = (n) => Number(n).toLocaleString('fa-IR');

/** The sections' notes: the limits each one shows (keys of usage from GET /api/plan, or 'sms') */
const SECTION_LIMITS = {
  expenses: ['entries'],
  incomes: ['entries'],
  projects: ['projects'],
  accounts: ['accounts'],
  loans: ['loans'],
  cheques: ['cheques'],
  subscriptions: ['subscriptions'],
  portfolio: ['portfolios', 'holdings'],
  sms: ['sms'],
};

const LABELS = { portfolios: 'پورتفو', sms: 'پیامک خوانده‌شده' };

function describe(key, usage) {
  if (key === 'sms') {
    const sms = smsFreeUsage();
    return `پیامک: ${faNum(sms.daily)} از ${faNum(FREE_SMS_READS.daily)} امروز · ${faNum(sms.monthly)} از ${faNum(FREE_SMS_READS.monthly)} این ماه`;
  }
  const label = LABELS[key] || PLAN_LIMITS[key]?.label || key;
  const u = usage[key];
  if (!u) return null;
  if (u.limit === 0) return `${label}: بسته`;
  const period = u.period === 'month' ? ' در این ماه' : '';
  return `${label}: ${faNum(Math.min(u.used, u.limit))} از ${faNum(u.limit)}${period}`;
}

/**
 * @param {object} props
 * @param {string} props.section - a key of SECTION_LIMITS (the open tab)
 */
export default function PlanNote({ section }) {
  const { pro, usage } = usePlan();
  const keys = SECTION_LIMITS[section];
  if (pro || !keys) return null;
  const parts = keys.map((key) => describe(key, usage)).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="plan-note" role="note">
      <span className="plan-note-badge">پلن رایگان</span>
      <span className="plan-note-text">{parts.join(' · ')}</span>
      <Link className="plan-note-link" to={appPath(PRO_PATH)}>
        <Crown size={14} aria-hidden="true" />
        <span>مقایسه با Pro</span>
      </Link>
    </div>
  );
}

