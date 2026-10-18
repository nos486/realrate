/**
 * dashboardLayout.js — Shape, defaults and edits of the user's widget dashboard (the home page)
 *
 * The home page is a list of widgets the user adds, removes and reorders. There are two
 * lists, one for the wide screen (the website) and one for the app frame (the Android app and
 * phones), so each can be arranged on its own. The whole document is one encrypted vault record
 * (kind `dashboard_layout`), so the server never sees it; it is also part of the full backup.
 * Shared by the web client and the tests through a symlink; pure, no DOM.
 *
 * {
 *   version: 1,
 *   desktop: [{ id: "w_ab12cd34", type: "month", config: {} }, ...],
 *   mobile:  [{ id: "w_ef56ab78", type: "rates", config: { count: 4 } }, ...],
 *   updatedAt
 * }
 *
 * Every widget is the same size: the page lays them out in as many columns as its width allows
 * (three, two or one) and a widget with more to show scrolls inside itself. `config` holds the few per-widget options the catalog declares (an asset id, how
 * many rows to list); anything else is dropped. A list that is missing starts from the default.
 */

import { msg } from "./i18n.js";

export const DASHBOARD_RECORD_KIND = "dashboard_layout";
export const DASHBOARD_RECORD_ID = "main";
export const DASHBOARD_LAYOUT_VERSION = 1;

/** Screens a list is arranged for */
export const DASHBOARD_SCREENS = ["desktop", "mobile"];

export const DASHBOARD_LIMITS = { widgets: 40, idLength: 40, assetIdLength: 120, rateListAssets: 12 };

/**
 * The widgets a user can add. `requires` names what the user needs to see it (checked by the
 * client: a feature, `news`, `native`); `unique` widgets can be added once. `options` declares the
 * widget's config: `count` (one of the listed numbers), `asset` (one market asset id) and `assets`
 * (a list of them).
 */
export const WIDGET_CATALOG = {
  month: {
    title: msg("خلاصه‌ی ماه"),
    description: msg("خرج، درآمد و باقی‌مانده‌ی ماه، با مقایسه با ماه قبل"),
    group: "money",
    unique: true, requires: "vault",
  },
  expenses_latest: {
    title: msg("آخرین هزینه‌ها"),
    description: msg("هزینه‌هایی که تازه ثبت شده است"),
    group: "money",
    requires: "expenses",
    options: { count: [3, 5, 8, 10] }, defaults: { count: 10 },
  },
  loans: {
    title: msg("وام‌ها"),
    description: msg("قسط بعدی وام‌ها و مانده‌ی هر کدام"),
    group: "money",
    unique: true, requires: "vault",
    options: { count: [3, 5, 8, 12] }, defaults: { count: 8 },
  },
  goals: {
    title: msg("اهداف پس‌انداز"),
    description: msg("نزدیک‌ترین هدف‌ها و پیشرفت هر کدام"),
    group: "money",
    unique: true, requires: "vault",
  },
  alerts: {
    title: msg("یادآورها"),
    description: msg("اقساط، چک‌ها و اشتراک‌هایی که سررسیدشان نزدیک است"),
    group: "money",
    unique: true, requires: "vault",
  },
  rates: {
    title: msg("نرخ‌های امروز"),
    description: msg("دلار، طلای ۱۸ و سکه با تغییر امروز"),
    group: "market",
    unique: true, requires: "market",
  },
  asset: {
    title: msg("قیمت یک دارایی"),
    description: msg("قیمت و تغییر هر دارایی بازار که انتخاب کنید"),
    group: "market",
    requires: "market",
    options: { asset: true },
  },
  rate_list: {
    title: msg("نرخ‌های دلخواه"),
    description: msg("چند نرخ دلخواه از بازار، هرکدام با قیمت و تغییرش"),
    group: "market",
    requires: "market",
    options: { assets: true },
  },
  market: {
    title: msg("نرخ و حباب"),
    description: msg("بخش‌های دلخواه بازار: طلا، سکه، ارز، بورس و حباب، با کارت‌های قابل تنظیم"),
    group: "market",
    unique: true, requires: "market",
  },
  news: {
    title: msg("آخرین اخبار"),
    description: msg("تازه‌ترین خبرهای بازار"),
    group: "news",
    unique: true, requires: "news",
    options: { count: [3, 5, 8, 10] }, defaults: { count: 10 },
  },
  ai_analysis: {
    title: msg("تحلیل روز با هوش مصنوعی"),
    description: msg("فقط تحلیل روز: خلاصه‌ی خبرها، مهم‌ترین رویدادها و نکته‌ها"),
    group: "news",
    unique: true, requires: "news",
  },
  sms: {
    title: msg("پیامک‌های بانکی"),
    description: msg("پیامک‌هایی که منتظر ثبت هستند"),
    group: "tools",
    unique: true, requires: "native_sms",
  },
  clock: {
    title: msg("ساعت و تاریخ"),
    description: msg("ساعت و تاریخ امروز به وقت تهران، با تاریخ شمسی و میلادی"),
    group: "tools",
    unique: true, requires: null,
  },
  calendar: {
    title: msg("تقویم"),
    description: msg("تقویم شمسی با نشان اقساط، سررسید چک‌ها، تمدید اشتراک‌ها و تاریخ هدف‌ها"),
    group: "tools",
    unique: true, requires: null,
  },
  shortcuts: {
    title: msg("میان‌بُرها"),
    description: msg("ثبت سریع هزینه و رفتن به بخش‌های پرکاربرد"),
    group: "tools",
    unique: true, requires: null,
  },
  plan: {
    title: msg("پلن"),
    description: msg("محدودیت‌های پلن رایگان و میزان استفاده"),
    group: "tools",
    unique: true, requires: "free_plan",
  },
};

/** Groups of the «افزودن ویجت» list, in order */
export const WIDGET_GROUPS = [
  { id: "money", title: msg("مالی من") },
  { id: "market", title: msg("بازار") },
  { id: "news", title: msg("اخبار") },
  { id: "tools", title: msg("ابزارها") },
];

export const WIDGET_TYPES = Object.keys(WIDGET_CATALOG);

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ASSET_ID_RE = /^[^\s/\\]{1,120}$/;

const newWidgetId = () => `w_${Math.random().toString(36).slice(2, 10)}`;

/** Only the options the type declares, with valid values */
function cleanConfig(type, raw) {
  const spec = WIDGET_CATALOG[type];
  const config = { ...(spec.defaults || {}) };
  const options = spec.options || {};
  if (raw && typeof raw === "object") {
    if (options.count && options.count.includes(Number(raw.count))) config.count = Number(raw.count);
    if (options.asset && typeof raw.assetId === "string" && ASSET_ID_RE.test(raw.assetId)) config.assetId = raw.assetId;
    if (options.assets && Array.isArray(raw.assetIds)) {
      const ids = raw.assetIds.filter((id) => typeof id === "string" && ASSET_ID_RE.test(id));
      config.assetIds = [...new Set(ids)].slice(0, DASHBOARD_LIMITS.rateListAssets);
    }
  }
  return config;
}

/** @returns {object|null} a valid widget, or null for something that is not one */
function cleanWidget(raw, usedIds) {
  if (!raw || typeof raw !== "object" || !WIDGET_CATALOG[raw.type]) return null;
  const type = raw.type;
  let id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : newWidgetId();
  while (usedIds.has(id)) id = newWidgetId();
  usedIds.add(id);
  return {
    id,
    type,
    config: cleanConfig(type, raw.config),
  };
}

/**
 * A list of widgets from stored or restored data: unknown types dropped, a second copy of a
 * unique widget dropped, options made valid, the length limited
 * @param {unknown} raw
 * @returns {Array<{ id: string, type: string, config: object }>}
 */
export function sanitizeWidgets(raw) {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set();
  const seenUnique = new Set();
  const out = [];
  for (const item of raw) {
    if (out.length >= DASHBOARD_LIMITS.widgets) break;
    const widget = cleanWidget(item, usedIds);
    if (!widget) continue;
    if (WIDGET_CATALOG[widget.type].unique) {
      if (seenUnique.has(widget.type)) continue;
      seenUnique.add(widget.type);
    }
    out.push(widget);
  }
  return out;
}

const preset = (type) => ({ type });

/** What a user who never arranged the page sees, per screen */
export const DEFAULT_DASHBOARD = {
  desktop: [
    preset("alerts"), preset("month"), preset("rates"), preset("news"), preset("ai_analysis"),
    preset("expenses_latest"), preset("goals"), preset("loans"), preset("plan"),
  ],
  mobile: [
    preset("rates"), preset("month"), preset("sms"), preset("alerts"), preset("plan"),
    preset("goals"), preset("news"), preset("expenses_latest"),
  ],
};

/**
 * The default widgets of a screen, each with a fresh id
 * @param {"desktop"|"mobile"} screen
 */
export function defaultWidgets(screen) {
  return sanitizeWidgets(DEFAULT_DASHBOARD[screen === "mobile" ? "mobile" : "desktop"]);
}

/**
 * A whole dashboard document from stored or restored data; a screen without a valid list is not
 * set (null), so the default applies to it
 * @param {unknown} raw
 * @returns {{ version: number, desktop: object[]|null, mobile: object[]|null, updatedAt: string }|null}
 */
export function sanitizeDashboard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = { version: DASHBOARD_LAYOUT_VERSION, desktop: null, mobile: null, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt.slice(0, 40) : "" };
  for (const screen of DASHBOARD_SCREENS) {
    if (Array.isArray(raw[screen])) out[screen] = sanitizeWidgets(raw[screen]);
  }
  return out.desktop || out.mobile ? out : null;
}

/** The widgets of one screen: the saved list, else the default */
export function widgetsOf(dashboard, screen) {
  const saved = dashboard?.[screen];
  return Array.isArray(saved) ? saved : defaultWidgets(screen);
}

/** The dashboard with one screen's list replaced */
export function withScreen(dashboard, screen, widgets) {
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    desktop: dashboard?.desktop ?? null,
    mobile: dashboard?.mobile ?? null,
    [screen]: sanitizeWidgets(widgets),
    updatedAt: new Date().toISOString(),
  };
}

/** Whether a widget of this type can be added to the list (a unique one only once; limit) */
export function canAddWidget(widgets, type) {
  const spec = WIDGET_CATALOG[type];
  if (!spec || widgets.length >= DASHBOARD_LIMITS.widgets) return false;
  return !(spec.unique && widgets.some((w) => w.type === type));
}

/** Add a widget of `type` at the end (or after `afterId`) */
export function addWidget(widgets, type, config = null) {
  if (!canAddWidget(widgets, type)) return widgets;
  const widget = { id: newWidgetId(), type, config: cleanConfig(type, config) };
  return [...widgets, widget];
}

export const removeWidget = (widgets, id) => widgets.filter((w) => w.id !== id);

/** Move the widget `activeId` to where `overId` is */
export function moveWidget(widgets, activeId, overId) {
  const from = widgets.findIndex((w) => w.id === activeId);
  const to = widgets.findIndex((w) => w.id === overId);
  if (from < 0 || to < 0 || from === to) return widgets;
  const next = [...widgets];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Move a widget one place up (-1) or down (+1): the keyboard and the arrows of the editor */
export function shiftWidget(widgets, id, step) {
  const from = widgets.findIndex((w) => w.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= widgets.length) return widgets;
  return moveWidget(widgets, id, widgets[to].id);
}

export const configureWidget = (widgets, id, config) =>
  widgets.map((w) => (w.id === id ? { ...w, config: cleanConfig(w.type, { ...w.config, ...config }) } : w));
