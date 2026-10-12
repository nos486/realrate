/**
 * PlanHomeCard.jsx — «پلن رایگان» card on the app's home: what the free plan allows and how much
 * of it is used, with the button to the page comparing the plans. Nothing is shown on Pro.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, ChevronLeft } from 'lucide-react';
import { usePlan, PRO_PATH } from './usePlan.js';
import { describeLimit } from './planText.js';
import { appPath } from '../routes.js';

/** The limits the card lists, in order */
const CARD_LIMITS = ['entries', 'accounts', 'projects', 'loans', 'portfolios', 'holdings'];

export default function PlanHomeCard() {
  const navigate = useNavigate();
  const { pro, usage } = usePlan();
  if (pro) return null;
  const lines = CARD_LIMITS.map((key) => describeLimit(key, usage)).filter(Boolean);
  return (
    <button type="button" className="app-home-card plan-home-card" onClick={() => navigate(appPath(PRO_PATH))}>
      <header className="app-home-card-head">
        <h2><Crown size={15} aria-hidden="true" /> پلن رایگان</h2>
        <span className="app-home-link">مقایسه با Pro <ChevronLeft size={16} /></span>
      </header>
      {lines.length > 0 && (
        <ul className="plan-home-list">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
    </button>
  );
}
