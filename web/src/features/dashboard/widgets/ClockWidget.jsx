/**
 * ClockWidget.jsx — «ساعت و تاریخ»: the time in Tehran and today's date, in the style the user
 * picked: digital (the time large, the dates beneath), analog (a clock face with hands) or
 * compact (everything on one line). Switches: seconds, and the Gregorian date.
 *
 * It redraws at the start of each minute, or every second when seconds are shown — the only
 * timers on the home page, and they run only while the widget is on screen.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useEffect, useMemo, useState } from 'react';
import { calendarLocale } from '../../../shared/utils/dates.js';
import WidgetCard from '../WidgetCard.jsx';
import { Clock } from 'lucide-react';

const TIME_ZONE = 'Asia/Tehran';

/** Formatters per language, built once: the page language is fixed per load */
const formats = () => ({
  time: new Intl.DateTimeFormat(intlLocale(), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }),
  timeSeconds: new Intl.DateTimeFormat(intlLocale(), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  parts: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }),
  weekday: new Intl.DateTimeFormat(calendarLocale(), { timeZone: TIME_ZONE, weekday: 'long' }),
  shamsi: new Intl.DateTimeFormat(calendarLocale(), { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }),
  gregorian: new Intl.DateTimeFormat(`${intlLocale()}-u-ca-gregory`, { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }),
});

/** The current time, replaced every second (`tickSeconds`) or at the start of each minute, and when the page is shown again */
function useClock(tickSeconds) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const step = tickSeconds ? 1000 : 60_000;
    let timer = null;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, step - (Date.now() % step) + 30);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      setNow(new Date());
      schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tickSeconds]);
  return now;
}

/** The hands' angles in degrees (0 = 12 o'clock), from Tehran time */
function handAngles(parts, now) {
  const get = (type) => Number(parts.formatToParts(now).find((p) => p.type === type)?.value || 0);
  const h = get('hour') % 12;
  const m = get('minute');
  const s = get('second');
  return { hour: (h + m / 60) * 30, minute: (m + s / 60) * 6, second: s * 6 };
}

/** An analog face: ticks, the hour and minute hands and, when asked, the second hand */
function AnalogFace({ angles, seconds }) {
  const hand = (angle, length, width, extra = '') => (
    <line x1="50" y1="50" x2="50" y2={50 - length} strokeWidth={width} className={`dash-clock-hand ${extra}`} transform={`rotate(${angle} 50 50)`} />
  );
  return (
    <svg className="dash-clock-face" viewBox="0 0 100 100" role="img" aria-hidden="true">
      <circle cx="50" cy="50" r="47" className="dash-clock-rim" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1="6" x2="50" y2={i % 3 === 0 ? 14 : 10} strokeWidth={i % 3 === 0 ? 2.4 : 1.2} className="dash-clock-tick" transform={`rotate(${i * 30} 50 50)`} />
      ))}
      {hand(angles.hour, 25, 3.4)}
      {hand(angles.minute, 36, 2.4)}
      {seconds && hand(angles.second, 40, 1.1, 'is-second')}
      <circle cx="50" cy="50" r="2.6" className="dash-clock-pin" />
    </svg>
  );
}

export default function ClockWidget({ widget }) {
  const { style = 'digital', seconds = false, gregorian = true } = widget.config || {};
  const now = useClock(seconds);
  const fmt = useMemo(() => formats(), []);
  const time = (seconds ? fmt.timeSeconds : fmt.time).format(now);
  const dates = (
    <>
      <span className="dash-clock-weekday">{fmt.weekday.format(now)}</span>
      <strong className="dash-clock-date">{fmt.shamsi.format(now)}</strong>
      {gregorian && <small className="dash-clock-sub">{fmt.gregorian.format(now)}</small>}
    </>
  );

  return (
    <WidgetCard title={t('ساعت و تاریخ')} Icon={Clock}>
      <div className={`dash-clock is-${style}`}>
        {style === 'analog' ? (
          <>
            <AnalogFace angles={handAngles(fmt.parts, now)} seconds={seconds} />
            <time className="dash-clock-caption" dateTime={now.toISOString()} dir="ltr">{time}</time>
            <div className="dash-clock-dates">{dates}</div>
          </>
        ) : (
          <>
            <time className="dash-clock-time" dateTime={now.toISOString()} dir="ltr">{time}</time>
            <div className="dash-clock-dates">{dates}</div>
          </>
        )}
      </div>
    </WidgetCard>
  );
}
