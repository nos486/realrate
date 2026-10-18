/**
 * ClockWidget.jsx — «ساعت و تاریخ»: the time in Tehran and today's date, Shamsi first with the
 * Gregorian date beneath. It redraws on each minute (the time shows no seconds), the only timer
 * on the home page.
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { calendarLocale } from '../../../shared/utils/dates.js';

const TIME_ZONE = 'Asia/Tehran';
const MINUTE_MS = 60_000;

/** Formatters per language, built once: the page language is fixed per load */
const formats = () => ({
  time: new Intl.DateTimeFormat(intlLocale(), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }),
  weekday: new Intl.DateTimeFormat(calendarLocale(), { timeZone: TIME_ZONE, weekday: 'long' }),
  shamsi: new Intl.DateTimeFormat(calendarLocale(), { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }),
  gregorian: new Intl.DateTimeFormat(`${intlLocale()}-u-ca-gregory`, { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }),
});

/** The current time, replaced at the start of each minute and when the page is shown again */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = null;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS) + 50);
    };
    timer = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS) + 50);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

export default function ClockWidget() {
  const now = useMinuteClock();
  const fmt = React.useMemo(() => formats(), []);
  return (
    <section className="app-home-card dash-clock">
      <time className="dash-clock-time" dateTime={now.toISOString()} dir="ltr">{fmt.time.format(now)}</time>
      <span className="dash-clock-weekday">{fmt.weekday.format(now)}</span>
      <strong className="dash-clock-date">{fmt.shamsi.format(now)}</strong>
      <small className="dash-clock-sub">{fmt.gregorian.format(now)}</small>
    </section>
  );
}
