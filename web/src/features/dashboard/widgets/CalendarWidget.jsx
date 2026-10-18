/**
 * CalendarWidget.jsx — «تقویم»: a Shamsi month with a dot on every day something falls due — loan
 * installments, open cheques, subscription renewals and goal target dates. A tap on a day lists
 * its events; without one the list shows the whole month. The list sits under the grid. Records are decrypted in the browser, so a locked vault shows the bare calendar.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { todayIso } from '../../../shared/utils/dates.js';
import { appPath } from '../../../shared/routes.js';
import { formatShamsiMonth } from '../../../shared/flow/flowYear.js';
import { shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { useOptionalCheques } from '../../cheques/context/ChequesContext.jsx';
import { useOptionalSubscriptions } from '../../subscriptions/context/SubscriptionsContext.jsx';
import { useGoals } from '../../goals/hooks/useGoals.js';
import { useGoalProgress } from '../../goals/hooks/useGoalProgress.js';
import { calendarEvents } from '../calendarEvents.js';
import WidgetCard from '../WidgetCard.jsx';

/** Column titles, Saturday first */
const WEEKDAYS = [t('ش'), t('ی'), t('د'), t('س'), t('چ'), t('پ'), t('ج')];
const DAY_MS = 86_400_000;

/** What each kind of event is called and where it opens */
const KINDS = {
  loan: { label: t('قسط وام'), path: (e) => `/loans/${e.recordId}` },
  cheque: { label: t('سررسید چک'), path: () => '/cheques' },
  subscription: { label: t('تمدید اشتراک'), path: () => '/subscriptions' },
  goal: { label: t('تاریخ هدف'), path: () => '/goals' },
};

const dayLabel = (n) => n.toLocaleString(intlLocale(), { useGrouping: false });

export default function CalendarWidget() {
  const navigate = useNavigate();
  const today = todayIso();
  const [month, setMonth] = useState(() => shamsiMonthOf(todayIso()));
  const [picked, setPicked] = useState('');
  const loans = useOptionalLoans();
  const cheques = useOptionalCheques();
  const subscriptions = useOptionalSubscriptions();
  const { goals, vaultLocked } = useGoals();
  const { progressOf } = useGoalProgress(goals, { enabled: !vaultLocked });

  const { from, to, days } = useMemo(() => shamsiMonthRange(month.jy, month.jm), [month]);
  const events = useMemo(
    () => calendarEvents({ loans, cheques, subscriptions, goals, reachedGoal: (g) => progressOf(g).reached, today, from, to }),
    [loans, cheques, subscriptions, goals, progressOf, today, from, to],
  );

  const offset = (new Date(`${from}T00:00:00Z`).getUTCDay() + 1) % 7;
  const isoAt = (i) => new Date(Date.parse(from) + i * DAY_MS).toISOString().slice(0, 10);
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i)];
  const listed = [...events.entries()].filter(([day]) => !picked || day === picked).sort(([a], [b]) => a.localeCompare(b));
  const go = (delta) => {
    setMonth(shiftShamsiMonth(month, delta));
    setPicked('');
  };

  return (
    <WidgetCard title={t('تقویم')} Icon={CalendarRange}>
    <div className="dash-cal">
      <div className="dash-cal-grid-side">
        <header className="dash-cal-head">
          <button type="button" className="dash-cal-nav" onClick={() => go(-1)} aria-label={t('ماه قبل')}><ChevronRight size={16} /></button>
          <strong>{formatShamsiMonth(month.jy, month.jm)}</strong>
          <button type="button" className="dash-cal-nav" onClick={() => go(1)} aria-label={t('ماه بعد')}><ChevronLeft size={16} /></button>
        </header>
        <div className="dash-cal-grid" role="grid">
          {WEEKDAYS.map((w) => <span key={w} className="dash-cal-weekday">{w}</span>)}
          {cells.map((i, slot) => {
            if (i === null) return <span key={`blank-${slot}`} />;
            const iso = isoAt(i);
            const dayEvents = events.get(iso) || [];
            const kinds = [...new Set(dayEvents.map((e) => e.kind))];
            return (
              <button
                key={iso}
                type="button"
                className={`dash-cal-day${iso === today ? ' is-today' : ''}${iso === picked ? ' is-picked' : ''}${dayEvents.length ? ' has-events' : ''}`}
                aria-pressed={iso === picked}
                aria-label={dayEvents.length ? `${formatShamsiDisplay(`${iso}T00:00:00`)}: ${dayEvents.map((e) => e.title).join('، ')}` : formatShamsiDisplay(`${iso}T00:00:00`)}
                onClick={() => setPicked(iso === picked ? '' : iso)}
              >
                <span>{dayLabel(i + 1)}</span>
                <span className="dash-cal-dots" aria-hidden="true">
                  {kinds.map((kind) => <i key={kind} className={`dash-cal-dot is-${kind}`} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="dash-cal-agenda">
        <p className="dash-cal-agenda-title">{picked ? formatShamsiDisplay(`${picked}T00:00:00`) : t('رویدادهای این ماه')}</p>
        {listed.length === 0 ? (
          <p className="dash-cal-empty">{vaultLocked ? t('برای دیدن رویدادهای مالی، اطلاعات را باز کنید.') : t('رویدادی در این بازه نیست.')}</p>
        ) : (
          <ul className="dash-cal-list">
            {listed.map(([day, list]) => list.map((event) => (
              <li key={event.key}>
                <button type="button" className="dash-cal-event" onClick={() => navigate(appPath(KINDS[event.kind].path(event)))}>
                  <i className={`dash-cal-dot is-${event.kind}`} aria-hidden="true" />
                  <span className="dash-cal-event-text">
                    <strong>{event.title || KINDS[event.kind].label}</strong>
                    <small>{KINDS[event.kind].label}</small>
                  </span>
                  <span className="dash-cal-event-day">{picked ? '' : dayLabel(dayIndexOf(day, from) + 1)}</span>
                </button>
              </li>
            )))}
          </ul>
        )}
      </div>
    </div>
    </WidgetCard>
  );
}

/** The 0-based day of the Shamsi month that `day` is, counted from the month's first day */
function dayIndexOf(day, from) {
  return Math.round((Date.parse(day) - Date.parse(from)) / DAY_MS);
}
