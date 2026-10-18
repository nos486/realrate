/**
 * CalendarWidget.jsx — «تقویم»: the dates that matter — loan installments, open cheques,
 * subscription renewals and goal target dates — in one of two styles. «ماه» is a Shamsi month with
 * coloured markers on every such day: hovering (or focusing) a day opens a card saying what is due
 * that day and for how much, and a tap lists the day's events under the month; a line under it
 * sums what the month asks to pay and what comes in. «برنامه» is the agenda of the coming weeks,
 * day by day. The `kinds` setting chooses which of the four are marked. Records are decrypted in
 * the browser, so a locked vault shows the bare calendar.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { appPath } from '../../../shared/routes.js';
import { formatShamsiMonth } from '../../../shared/flow/flowYear.js';
import { formatMoney } from '../../../utils/currencies.js';
import { shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { useOptionalCheques } from '../../cheques/context/ChequesContext.jsx';
import { useOptionalSubscriptions } from '../../subscriptions/context/SubscriptionsContext.jsx';
import { useGoals } from '../../goals/hooks/useGoals.js';
import { useGoalProgress } from '../../goals/hooks/useGoalProgress.js';
import { calendarEvents } from '../calendarEvents.js';
import { moneyText } from '../dashboardFormat.js';
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

/** The base currency's code (amounts in it are the user's tomans) */
const BASE = 'IRT';
const MASK = '••••••';

/** An event's amount as text (masked while values are hidden), or '' when it has none */
const amountText = (event, hidden) => {
  if (event.amount === null) return '';
  return hidden ? MASK : formatMoney(event.amount, event.currency);
};

/** What a kind's event is for the user: a payment, or money coming in (a received cheque) */
const toneOf = (event) => (event.kind === 'cheque' && event.direction === 'received' ? 'in' : event.kind === 'goal' ? 'goal' : 'out');

const dayLabel = (n) => n.toLocaleString(intlLocale(), { useGrouping: false });
const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);

/** What a kind of event is called; a cheque also says which way the money goes */
const kindLabel = (event) => (event.kind === 'cheque' ? (event.direction === 'received' ? t('چک دریافتی') : t('چک پرداختی')) : KINDS[event.kind].label);

/** One event as a row that opens its record */
function EventRow({ event, onOpen, hidden, right = '' }) {
  const amount = amountText(event, hidden);
  return (
    <li>
      <button type="button" className="dash-cal-event" onClick={() => onOpen(event)}>
        <i className={`dash-cal-dot is-${event.kind}`} aria-hidden="true" />
        <span className="dash-cal-event-text">
          <strong>{event.title || KINDS[event.kind].label}</strong>
          <small>{kindLabel(event)}</small>
        </span>
        {amount && <span className={`dash-cal-event-amount is-${toneOf(event)}`}>{amount}</span>}
        {right && <span className="dash-cal-event-day">{right}</span>}
      </button>
    </li>
  );
}

/** The card a day opens on hover or focus: its date and each thing due, with the amount */
function DayTip({ iso, events, today, hidden, placement }) {
  const left = Math.round((Date.parse(iso) - Date.parse(today)) / DAY_MS);
  const when = left === 0 ? t('امروز') : left === 1 ? t('فردا') : left === -1 ? t('دیروز') : left > 0 ? t('{n} روز دیگر', { n: dayLabel(left) }) : t('{n} روز پیش', { n: dayLabel(-left) });
  return (
    <div className={`dash-cal-tip ${placement}`} aria-hidden="true">
      <p className="dash-cal-tip-head">
        <strong>{formatShamsiDisplay(`${iso}T00:00:00`)}</strong>
        <small>{when}</small>
      </p>
      <ul>
        {events.map((event) => (
          <li key={event.key}>
            <i className={`dash-cal-dot is-${event.kind}`} />
            <span>
              <strong>{event.title || KINDS[event.kind].label}</strong>
              <small>{kindLabel(event)}</small>
            </span>
            {event.amount !== null && <b className={`is-${toneOf(event)}`}>{amountText(event, hidden)}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the month's events ask to pay and bring in, in tomans (a foreign-currency one is left out) */
function monthTotals(events) {
  const totals = { out: 0, in: 0 };
  for (const list of events.values()) {
    for (const event of list) {
      if (event.amount === null || event.currency !== BASE) continue;
      const tone = toneOf(event);
      if (tone === 'out') totals.out += event.amount;
      else if (tone === 'in') totals.in += event.amount;
    }
  }
  return totals;
}

export default function CalendarWidget({ widget }) {
  const navigate = useNavigate();
  const hidden = usePrivacyMode();
  const today = todayIso();
  const style = widget.config?.style || 'month';
  const kinds = widget.config?.kinds;
  const currentMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(currentMonth);
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
  const totals = useMemo(() => monthTotals(events), [events]);
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
                  <ul className="dash-cal-list">{list.map((e) => <EventRow key={e.key} event={e} onOpen={open} hidden={hidden} />)}</ul>
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
  const rows = Math.ceil(cells.length / 7);
  const listed = [...events.entries()].filter(([day]) => !picked || day === picked).sort(([a], [b]) => a.localeCompare(b));
  const onCurrentMonth = month.jy === currentMonth.jy && month.jm === currentMonth.jm;
  const shownKinds = kinds || Object.keys(KINDS);
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
            {!onCurrentMonth && (
              <button type="button" className="dash-cal-today" onClick={() => { setMonth(currentMonth); setPicked(''); }}>{t('امروز')}</button>
            )}
            <button type="button" className="dash-cal-nav" onClick={() => go(1)} aria-label={t('ماه بعد')}><ChevronLeft size={16} /></button>
          </header>
          <div className="dash-cal-grid" role="grid">
            {WEEKDAYS.map((w, d) => <span key={w} className={`dash-cal-weekday${d === 6 ? ' is-friday' : ''}`}>{w}</span>)}
            {cells.map((i, slot) => {
              if (i === null) return <span key={`blank-${slot}`} />;
              const iso = addDays(range.from, i);
              const dayEvents = events.get(iso) || [];
              const dayKinds = [...new Set(dayEvents.map((e) => e.kind))];
              const column = slot % 7;
              const placement = `${Math.floor(slot / 7) < rows / 2 ? 'is-below' : 'is-above'} ${column < 3 ? 'is-start' : column > 3 ? 'is-end' : 'is-mid'}`;
              return (
                <div key={iso} className="dash-cal-cell">
                  <button
                    type="button"
                    className={`dash-cal-day${iso === today ? ' is-today' : ''}${iso === picked ? ' is-picked' : ''}${column === 6 ? ' is-friday' : ''}${dayEvents.length ? ` has-events tone-${dayKinds[0]}` : ''}${iso < today ? ' is-past' : ''}`}
                    aria-pressed={iso === picked}
                    aria-label={dayEvents.length ? `${formatShamsiDisplay(`${iso}T00:00:00`)}: ${dayEvents.map((e) => e.title).join('، ')}` : formatShamsiDisplay(`${iso}T00:00:00`)}
                    onClick={() => setPicked(iso === picked ? '' : iso)}
                  >
                    <span>{dayLabel(i + 1)}</span>
                    <span className="dash-cal-dots" aria-hidden="true">
                      {dayKinds.map((kind) => <i key={kind} className={`dash-cal-dot is-${kind}`} />)}
                      {dayEvents.length > dayKinds.length && <small>{`+${dayLabel(dayEvents.length - dayKinds.length)}`}</small>}
                    </span>
                  </button>
                  {dayEvents.length > 0 && <DayTip iso={iso} events={dayEvents} today={today} hidden={hidden} placement={placement} />}
                </div>
              );
            })}
          </div>
          <ul className="dash-cal-legend" aria-label={t('نشانه‌ها')}>
            {shownKinds.map((kind) => <li key={kind}><i className={`dash-cal-dot is-${kind}`} aria-hidden="true" />{KINDS[kind].label}</li>)}
          </ul>
          {widget.config?.total !== false && (totals.out > 0 || totals.in > 0) && (
            <div className="dash-cal-totals">
              {totals.out > 0 && <span className="is-out"><small>{t('پرداختی این ماه')}</small><b>{moneyText(totals.out, hidden)}</b></span>}
              {totals.in > 0 && <span className="is-in"><small>{t('دریافتی این ماه')}</small><b>{moneyText(totals.in, hidden)}</b></span>}
            </div>
          )}
        </div>
        {widget.config?.list !== false && (
          <div className="dash-cal-agenda">
            <p className="dash-cal-agenda-title">{picked ? formatShamsiDisplay(`${picked}T00:00:00`) : t('رویدادهای این ماه')}</p>
            {listed.length === 0 ? (
              <p className="dash-cal-empty">{vaultLocked ? t('برای دیدن رویدادهای مالی، اطلاعات را باز کنید.') : t('رویدادی در این بازه نیست.')}</p>
            ) : (
              <ul className="dash-cal-list">
                {listed.map(([day, list]) => list.map((event) => (
                  <EventRow key={event.key} event={event} onOpen={open} hidden={hidden} right={picked ? '' : dayLabel(Math.round((Date.parse(day) - Date.parse(range.from)) / DAY_MS) + 1)} />
                )))}
              </ul>
            )}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
