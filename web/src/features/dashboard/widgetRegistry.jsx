/**
 * widgetRegistry.jsx — Each widget type of the catalog (utils/dashboardLayout.js) with its icon and
 * component, and who can see it
 *
 * The catalog (titles, sizes, options) is shared domain data; this file adds what only the web
 * knows, and who can see each: the catalog ties every widget (and some of its settings) to the
 * sections it shows (config/features.js, opened per group by the admin). A widget the user cannot
 * see (a section their group does not open, no news in English, not the Android app) is not shown
 * nor offered, also while arranging; one already in the layout stays there for when they can.
 */

import { hasNews as localeHasNews } from '../../utils/i18n.js';
import {
  Bell, CalendarDays, CalendarRange, Clock, Crown, List, Landmark, MessageSquareText, Newspaper,
  Receipt, Sparkles, Target, TrendingUp, Zap,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '../auth/index.js';
import { usePlan } from '../../shared/plan/usePlan.js';
import { smsEnabled } from '../../shared/native/nativeApp.js';
import { effectiveConfig, widgetAllowed } from '../../utils/dashboardLayout.js';
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

/**
 * Who can see what on the home page: whether a widget type is shown and offered (its catalog
 * `requires`: sections' features and WIDGET_CONDITIONS), and each widget's settings as drawn
 * (values and switches of sections the user cannot open left out)
 * @returns {{ can: (requirement: string) => boolean, canSee: (type: string) => boolean,
 *   configOf: (widget: object) => object }}
 */
export function useWidgetAccess() {
  const { user } = useAuth() || {};
  const { pro } = usePlan();
  return useMemo(() => {
    const features = new Set(Array.isArray(user?.features) ? user.features : []);
    const conditions = {
      native_sms: smsEnabled(),
      free_plan: !pro,
      // The news and the daily analysis are Persian-only (their sources are)
      news_locale: localeHasNews(),
    };
    const can = (need) => (need in conditions ? conditions[need] === true : features.has(need));
    return {
      can,
      canSee: (type) => widgetAllowed(type, can),
      configOf: (widget) => effectiveConfig(widget, can),
    };
  }, [user, pro]);
}
