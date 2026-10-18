/**
 * GoalsHomeCard.jsx — «اهداف» card on the app's home: the nearest unfinished goals as small bars,
 * opening the goals page. Nothing is shown without goals (or while the vault is locked), so a user
 * who never set one sees no card.
 */

import React, { useMemo } from 'react';
import { ChevronLeft, Target } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { compareGoals } from '../../../utils/goalDocument.js';
import { useGoals } from '../hooks/useGoals.js';
import { useGoalProgress } from '../hooks/useGoalProgress.js';
import { goalNumber } from '../constants/goalDisplay.js';

/** How many goals the card lists unless the page gives a `limit` */
const CARD_GOALS = 3;

/** @param {{ onOpen?: (tab: string) => void, limit?: number }} props */
export default function GoalsHomeCard({ onOpen, limit = CARD_GOALS }) {
  const hideValues = usePrivacyMode();
  const { goals, vaultLocked } = useGoals();
  const { progressOf } = useGoalProgress(goals, { enabled: !vaultLocked });
  const rows = useMemo(
    () => [...goals].sort(compareGoals(progressOf)).map((goal) => ({ goal, progress: progressOf(goal) })).slice(0, limit),
    [goals, progressOf, limit],
  );
  if (vaultLocked || rows.length === 0) return null;

  return (
    <section className="app-home-card">
      <header className="app-home-card-head">
        <h2><Target size={15} aria-hidden="true" /> {t('اهداف')}</h2>
        <button type="button" className="app-home-link" onClick={() => onOpen?.('goals')}>
          {t('همه')} <ChevronLeft size={16} />
        </button>
      </header>
      <ul className="goals-home-list">
        {rows.map(({ goal, progress: p }) => (
          <li key={goal.id} className="goals-home-row">
            <div className="goals-home-top">
              <span className="goals-home-name">{goal.name}</span>
              <strong>{hideValues ? '••' : t('{n}٪', { n: goalNumber(p.pct) })}</strong>
            </div>
            <div className="row-card-track" role="progressbar" aria-label={goal.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct}>
              <div className={`row-card-bar ${p.reached ? 'tone-positive' : 'tone-primary'}`} style={{ width: `${hideValues ? 0 : p.pct}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
