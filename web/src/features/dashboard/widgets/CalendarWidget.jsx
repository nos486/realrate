/**
 * CalendarWidget.jsx — «تقویم»: the dates that matter — loan installments, open cheques,
 * subscription renewals and goal target dates — in one of two styles. «ماه» is a Shamsi month with
 * a dot on every such day (a tap lists the day's events); «برنامه» is the agenda of the coming
 * weeks, day by day. The `kinds` setting chooses which of the four are marked. Records are
 * decrypted in the browser, so a locked vault shows the bare calendar.
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
/** How far ahead the agenda looks */
const AGENDA_DAYS = 60;

/** What each kind of event is called and where it opens */
const KINDS = {
  loan: { label: t('قسط وام'), path: (e) => `/loans/${e.recordId}` },
  cheque: { label: t('سررسید چک'), path: () => '/cheques' },
  subscription: { label: t('تمدید اشتراک'), path: () => '/subscriptions' },
  goal: { label: t('تاریخ هدف'), path: () => '/goals' },
};

const dayLabel = (n) => n.toLocaleString(intlLocale(), { useGrouping: false });
const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);

/** One event as a row that opens its record */
function EventRow({ event, onOpen, right = '' }) {
  return (
    <li>
      <button type="button" className="dash-cal-event" onClick={() => onOpen(event)}>
        <i className={`dash-cal-dot is-${event.kind}`} aria-hidden="true" />
        <span className="dash-cal-event-text">
          <strong>{event.title || KINDS[event.kind].label}</strong>
          <small>{KINDS[event.kind].label}</small>
        </span>
        {right && <span className="dash-cal-event-day">{right}</span>}
      </button>
    </li>
  );
}

export default function CalendarWidget({ widget }) {
  const navigate = useNavigate();
  const today = todayIso();
  const style = widget.config?.style || 'month';
  const kinds = widget.config?.kinds;
  const [month, setMonth] = useState(() => shamsiMonthOf(todayIso()));
  const [picked, setPicked] = useState('');
  const loans = useOptionalLoans();
  const cheques = useOptionalCheques();
  const subscriptions = useOptionalSubscriptions();
  const { goals, vaultLocked } = useGoals();
  const { progressOf } = useGoalProgress(goals, { enabled: !vaultLocked });

  const range = useMemo(() => shamsiMonthRange(month.jy, month.jm), [month]);
  const span = style === 'agenda' ? { from: today, to: addDays(today, AGENDA_DAYS) } : { from: range.from, to: range.to };
  const events = useMemo(() => {
    const all = calendarEvents({ loans, cheques, subscriptions, goals, reachedGoal: (g) => progressOf(g).reached, today, ...span });
    if (!kinds) return all;
    return new Map([...all].map(([day, list]) => [day, list.filter((e) => kinds.includes(e.kind))]).filter(([, list]) => list.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, cheques, subscriptions, goals, progressOf, today, span.from, span.to, kinds]);
  const open = (event) => navigate(appPath(KINDS[event.kind].path(event)));
  const title = t('تقویم');

  if (style === 'agenda') {
    const days = [...events.entries()].sort(([a], [b]) => a.localeCompare(b));
    return (
      <WidgetCard title={title} Icon={CalendarRange}>
        {days.length === 0 ? (
          <p className="dash-state-empty">{vaultLocked ? t('برای دیدن رویدادهای مالی، اطلاعات را باز کنید.') : t('رویدادی در این بازه نیست.')}</p>
        ) : (
          <div className="dash-scroll">
            {days.map(([day, list]) => {
              const left = Math.round((Date.parse(day) - Date.parse(today)) / DAY_MS);
              return (
                <section key={day} className="dash-cal-day-group">
                  <p className="dash-cal-agenda-title">
                    {formatShamsiDisplay(`${day}T00:00:00`)}
                    <small>{left === 0 ? t('امروز') : left === 1 ? t('فردا') : t('{n} روز دیگر', { n: dayLabel(left) })}</small>
                  </p>
                  <ul className="dash-cal-list">{list.map((e) => <EventRow key={e.key} event={e} onOpen={open} />)}</ul>
                </section>
              );
            })}
          </div>
        )}
      </WidgetCard>
    );
  }

  const offset = (new Date(`${range.from}T00:00:00Z`).getUTCDay() + 1) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: range.days }, (_, i) => i)];
  const listed = [...events.entries()].filter(([day]) => !picked || day === picked).sort(([a], [b]) => a.localeCompare(b));
  const go = (delta) => {
    setMonth(shiftShamsiMonth(month, delta));
    setPicked('');
  };

  return (
    <WidgetCard title={title} Icon={CalendarRange}>
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
              const iso = addDays(range.from, i);
              const dayEvents = events.get(iso) || [];
              const dayKinds = [...new Set(dayEvents.map((e) => e.kind))];
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
                    {dayKinds.map((kind) => <i key={kind} className={`dash-cal-dot is-${kind}`} />)}
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
                <EventRow key={event.key} event={event} onOpen={open} right={picked ? '' : dayLabel(Math.round((Date.parse(day) - Date.parse(range.from)) / DAY_MS) + 1)} />
              )))}
            </ul>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
