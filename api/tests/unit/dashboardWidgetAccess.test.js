/**
 * dashboardWidgetAccess.test.js — The home page's widgets follow the sections the user's group
 * opens: a widget is shown and offered only when its sections are open, the values and switches
 * of a closed section are left out of what it draws, and a saved layout keeps the hidden ones
 */
import { describe, it, expect } from 'vitest';
import {
  WIDGET_TYPES, effectiveConfig, sanitizeWidgets, widgetAllowed, withHiddenWidgets,
} from '../../src/domain/dashboardLayout.js';

/** A user for whom exactly these sections and conditions hold */
const only = (...keys) => (need) => keys.includes(need);
const everything = () => true;

describe('which widgets a user can see', () => {
  it('shows every widget when everything is open', () => {
    expect(WIDGET_TYPES.every((type) => widgetAllowed(type, everything))).toBe(true);
  });

  it('hides the news and the analysis without their sections, or in a language without news', () => {
    expect(widgetAllowed('news', only('news_locale'))).toBe(false);
    expect(widgetAllowed('news', only('news'))).toBe(false); // English
    expect(widgetAllowed('news', only('news', 'news_locale'))).toBe(true);
    expect(widgetAllowed('ai_analysis', only('news', 'news_locale'))).toBe(false);
    expect(widgetAllowed('ai_analysis', only('analysis', 'news_locale'))).toBe(true);
  });

  it('hides the market widgets without the rates and bubble section', () => {
    expect(widgetAllowed('rates', only('news'))).toBe(false);
    expect(widgetAllowed('rate_list', only('news'))).toBe(false);
    expect(widgetAllowed('rates', only('market'))).toBe(true);
  });

  it('ties each money widget to its own section', () => {
    expect(widgetAllowed('loans', only('goals'))).toBe(false);
    expect(widgetAllowed('goals', only('goals'))).toBe(true);
    expect(widgetAllowed('expenses_latest', only('incomes'))).toBe(false);
    expect(widgetAllowed('sms', only('native_sms'))).toBe(false);
    expect(widgetAllowed('sms', only('native_sms', 'expenses'))).toBe(true);
  });

  it('hides a widget whose essential list has nothing left, but not a plain calendar', () => {
    expect(widgetAllowed('alerts', only())).toBe(false);
    expect(widgetAllowed('alerts', only('cheques'))).toBe(true);
    expect(widgetAllowed('shortcuts', only())).toBe(false);
    expect(widgetAllowed('shortcuts', only('reports'))).toBe(true);
    expect(widgetAllowed('calendar', only())).toBe(true);
    expect(widgetAllowed('clock', only())).toBe(true);
  });

  it('knows nothing of an unknown type', () => {
    expect(widgetAllowed('nope', everything)).toBe(false);
  });
});

describe('what a widget draws', () => {
  it('leaves out the values of a closed section, keeping the stored ones', () => {
    const [alerts] = sanitizeWidgets([{ type: 'alerts' }]);
    expect(effectiveConfig(alerts, only('loans', 'subscriptions')).sources).toEqual(['loan', 'subscription']);
    expect(alerts.config.sources).toEqual(['loan', 'cheque', 'subscription']);
    const [shortcuts] = sanitizeWidgets([{ type: 'shortcuts' }]);
    expect(effectiveConfig(shortcuts, only('expenses')).items).toEqual(['add-expense', 'expenses']);
    const [calendar] = sanitizeWidgets([{ type: 'calendar' }]);
    expect(effectiveConfig(calendar, only()).kinds).toEqual([]);
  });

  it('turns off a switch tied to a closed section', () => {
    const [news] = sanitizeWidgets([{ type: 'news' }]);
    expect(effectiveConfig(news, only('news')).analysis).toBe(false);
    expect(effectiveConfig(news, everything).analysis).toBe(true);
    const [month] = sanitizeWidgets([{ type: 'month' }]);
    const drawn = effectiveConfig(month, only('expenses'));
    expect(drawn.stats).toBe(false);
    expect(drawn.breakdown).toBe(false);
    expect(drawn.comparison).toBe(true);
  });
});

describe('a saved layout with widgets the user cannot see', () => {
  it('keeps them after an edit of what is shown', () => {
    const all = sanitizeWidgets([{ type: 'news' }, { type: 'clock' }, { type: 'goals' }]);
    const canSee = (type) => type !== 'news';
    const shown = all.filter((w) => canSee(w.type));
    const next = withHiddenWidgets(shown.filter((w) => w.type !== 'clock'), all, canSee);
    expect(next.map((w) => w.type)).toEqual(['goals', 'news']);
  });
});
