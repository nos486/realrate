/**
 * widgetRegistry.jsx — Each widget type of the catalog (utils/dashboardLayout.js) with its icon and
 * component, and who can see it
 *
 * The catalog (titles, sizes, options) is shared domain data; this file adds what only the web
 * knows. A widget the user cannot see (no market page, no news, not the Android app) is not
 * shown and not offered; one already in the layout stays there for when they can.
 */

import { hasNews as localeHasNews } from '../../utils/i18n.js';
import {
  Bell, CalendarDays, CalendarRange, Clock, Crown, List, Landmark, MessageSquareText, Newspaper,
  Receipt, Sparkles, Target, TrendingUp, Zap,
} from 'lucide-react';
import { useFeature } from '../../shared/features/useFeature.js';
import { usePlan } from '../../shared/plan/usePlan.js';
import { smsEnabled } from '../../shared/native/nativeApp.js';
import { WIDGET_CATALOG } from '../../utils/dashboardLayout.js';
import MonthWidget from './widgets/MonthWidget.jsx';
import ExpensesLatestWidget from './widgets/ExpensesLatestWidget.jsx';
import LoansWidget from './widgets/LoansWidget.jsx';
import GoalsWidget from './widgets/GoalsWidget.jsx';
import AlertsWidget from './widgets/AlertsWidget.jsx';
import RatesWidget from './widgets/RatesWidget.jsx';
import RateListWidget from './widgets/RateListWidget.jsx';
import ClockWidget from './widgets/ClockWidget.jsx';
import CalendarWidget from './widgets/CalendarWidget.jsx';
import NewsWidget from './widgets/NewsWidget.jsx';
import AiAnalysisWidget from './widgets/AiAnalysisWidget.jsx';
import SmsWidget from './widgets/SmsWidget.jsx';
import ShortcutsWidget from './widgets/ShortcutsWidget.jsx';
import PlanWidget from './widgets/PlanWidget.jsx';

/** type → { Icon, Component } */
export const WIDGET_VIEWS = {
  month: { Icon: CalendarDays, Component: MonthWidget },
  expenses_latest: { Icon: Receipt, Component: ExpensesLatestWidget },
  loans: { Icon: Landmark, Component: LoansWidget },
  goals: { Icon: Target, Component: GoalsWidget },
  alerts: { Icon: Bell, Component: AlertsWidget },
  rates: { Icon: TrendingUp, Component: RatesWidget },
  rate_list: { Icon: List, Component: RateListWidget },
  clock: { Icon: Clock, Component: ClockWidget },
  calendar: { Icon: CalendarRange, Component: CalendarWidget },
  news: { Icon: Newspaper, Component: NewsWidget },
  ai_analysis: { Icon: Sparkles, Component: AiAnalysisWidget },
  sms: { Icon: MessageSquareText, Component: SmsWidget },
  shortcuts: { Icon: Zap, Component: ShortcutsWidget },
  plan: { Icon: Crown, Component: PlanWidget },
};

/** What a catalog entry's `requires` may name (null: nothing); `useWidgetAccess` decides each */
export const WIDGET_REQUIREMENTS = ['vault', 'expenses', 'market', 'news', 'analysis', 'native_sms', 'free_plan'];

/**
 * @returns {(type: string) => boolean} whether the user can see widgets of a type (what the
 *   catalog's `requires` names)
 */
export function useWidgetAccess() {
  const hasExpenses = useFeature('expenses');
  const hasMarket = useFeature('market');
  const hasNewsFeature = useFeature('news');
  const hasAnalysis = useFeature('analysis');
  const { pro } = usePlan();
  const rules = {
    expenses: hasExpenses,
    market: hasMarket,
    // The news and the daily analysis are Persian-only (their sources are)
    news: hasNewsFeature && localeHasNews(),
    analysis: hasAnalysis && localeHasNews(),
    native_sms: smsEnabled() && hasExpenses,
    free_plan: !pro,
  };
  return (type) => {
    const need = WIDGET_CATALOG[type]?.requires;
    return !need || need === 'vault' || rules[need] === true;
  };
}
