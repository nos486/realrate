/**
 * dashboardLayout.js — Shape, defaults and edits of the user's widget dashboard (the home page)
 *
 * The home page is a list of widgets the user adds, removes and reorders. There is one list per
 * number of columns the page shows (4 on a wide screen, 3, 2 on a mid-size window and 1 in the
 * app frame: the Android app and phones), so each can be arranged on its own and keeps its
 * arrangement; a list never arranged starts from the default made for its column count (or, when the
 * 3-column list was arranged, from that list's widgets spread evenly over the columns). The whole document is one encrypted vault record
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
 * Every widget is one column wide; `height` is its height class
 * (1..4 = 150, 300, 450, 600px, of those its catalog entry allows; a widget with more to show scrolls inside it); the app frame is one
 * column of natural height and ignores it. `config` holds the few per-widget options the catalog declares (the market assets, how
 * many rows to list); anything else is dropped. A list that is missing starts from the default.
 */

import { msg } from "./i18n.js";

export const DASHBOARD_RECORD_KIND = "dashboard_layout";
export const DASHBOARD_RECORD_ID = "main";
export const DASHBOARD_LAYOUT_VERSION = 1;

/** Screens a list is arranged for */
export const DASHBOARD_SCREENS = ["wide", "desktop", "tablet", "mobile"];

export const DASHBOARD_LIMITS = { widgets: 40, idLength: 40, assetIdLength: 120, rateListAssets: 4, columns: 4 };

/** The list each column count is arranged in (the 3-column one is `desktop`, as it was stored before there were more) */
const SCREEN_OF_COLUMNS = { 4: "wide", 3: "desktop", 2: "tablet", 1: "mobile" };

/** @param {number} count - columns shown now (1 to DASHBOARD_LIMITS.columns) */
export const screenOfColumns = (count) => SCREEN_OF_COLUMNS[count] || "desktop";

/** The list a never-arranged screen takes its widgets from, when that one was arranged */
const SCREEN_FALLBACK = { wide: "desktop", tablet: "desktop" };

/** Height classes of the wide grid and the pixels each stands for (the same four for every widget) */
export const WIDGET_HEIGHT_PX = { 1: 150, 2: 300, 3: 450, 4: 600 };
export const WIDGET_HEIGHTS = Object.keys(WIDGET_HEIGHT_PX).map(Number);

/**
 * The widgets a user can add. `requires` names what the user needs to see it (checked by the
 * client: a feature, `news`, `native`); `unique` widgets can be added once. `options` declares the
 * widget's settings, all of them saved in its `config` and nothing else. Every widget also has the
 * two appearance switches of WIDGET_APPEARANCE (its title, its card). `heights` lists the height
 * classes (WIDGET_HEIGHT_PX) the widget can be drawn at, `defaultHeight` is the one a new widget gets:
 *   count    one of the listed numbers (how many rows)
 *   assets   a list of market asset ids
 *   style    { values, labels, default }: how the widget is drawn (a grid or a list, a clock face)
 *   choices  { key: { label, values, labels, default } }: one of several values (a range, an order)
 *   toggles  { key: { label, default } }: on/off switches
 *   multi    { key: { label, values, labels, default, min } }: a subset of `values` to show
 */
export const WIDGET_CATALOG = {
  month: {
    title: msg("خلاصه‌ی ماه"),
    description: msg("خرج، درآمد و باقی‌مانده‌ی ماه، با مقایسه با ماه قبل"),
    group: "money",
    heights: [1, 2, 3], defaultHeight: 2, unique: true, requires: "vault",
    options: {
      style: { values: ["full", "compact"], labels: { full: msg("کامل"), compact: msg("فشرده") }, default: "full" },
      toggles: {
        comparison: { label: msg("مقایسه با ماه قبل"), default: true },
        breakdown: { label: msg("جدا کردن اقساط وام"), default: true },
        stats: { label: msg("نمایش درآمد و باقی‌مانده"), default: true },
      },
    },
  },
  expenses_latest: {
    title: msg("آخرین هزینه‌ها"),
    description: msg("هزینه‌هایی که تازه ثبت شده است"),
    group: "money",
    heights: [1, 2, 3, 4], defaultHeight: 2, requires: "expenses",
    options: {
      count: [3, 5, 8, 10],
      choices: {
        range: {
          label: msg("بازه‌ی هزینه‌ها"),
          values: ["month", "week", "today"],
          labels: { month: msg("این ماه"), week: msg("۷ روز اخیر"), today: msg("امروز") },
          default: "month",
        },
      },
      toggles: { details: { label: msg("نمایش دسته و تاریخ"), default: true } },
    },
    defaults: { count: 10 },
  },
  loans: {
    title: msg("وام‌ها"),
    description: msg("قسط بعدی وام‌ها و مانده‌ی هر کدام"),
    group: "money",
    heights: [2, 3, 4], defaultHeight: 2, unique: true, requires: "vault",
    options: {
      count: [3, 5, 8, 12],
      choices: {
        sort: {
          label: msg("ترتیب وام‌ها"),
          values: ["due", "balance"],
          labels: { due: msg("قسط نزدیک‌تر"), balance: msg("مانده‌ی بیشتر") },
          default: "due",
        },
      },
      toggles: { balance: { label: msg("نمایش مانده‌ی وام"), default: true } },
    },
    defaults: { count: 8 },
  },
  goals: {
    title: msg("اهداف پس‌انداز"),
    description: msg("نزدیک‌ترین هدف‌ها و پیشرفت هر کدام"),
    group: "money",
    heights: [1, 2, 3], defaultHeight: 1, unique: true, requires: "vault",
    options: { count: [3, 5, 8, 12] }, defaults: { count: 12 },
  },
  alerts: {
    title: msg("یادآورها"),
    description: msg("اقساط، چک‌ها و اشتراک‌هایی که سررسیدشان نزدیک است"),
    group: "money",
    heights: [1, 2, 3], defaultHeight: 1, unique: true, requires: "vault",
    options: {
      multi: {
        sources: {
          label: msg("نوع یادآورها"),
          values: ["loan", "cheque", "subscription"],
          labels: { loan: msg("اقساط وام"), cheque: msg("چک‌ها"), subscription: msg("اشتراک‌ها") },
          default: ["loan", "cheque", "subscription"],
          min: 1,
        },
      },
    },
  },
  rates: {
    title: msg("نرخ‌های امروز"),
    description: msg("دلار، طلای ۱۸ و سکه با تغییر امروز"),
    group: "market",
    heights: [1, 2, 3], defaultHeight: 1, unique: true, requires: "market",
    options: {
      style: { values: ["tiles", "list"], labels: { tiles: msg("کاشی"), list: msg("فهرست") }, default: "tiles" },
      multi: {
        items: {
          label: msg("نرخ‌های نمایش‌داده‌شده"),
          values: ["usd", "gold_18k", "full_coin"],
          labels: { usd: msg("دلار"), gold_18k: msg("طلای ۱۸"), full_coin: msg("سکه امامی") },
          default: ["usd", "gold_18k", "full_coin"],
          min: 1,
        },
      },
      toggles: { change: { label: msg("نمایش تغییر"), default: true } },
    },
  },
  rate_list: {
    title: msg("نرخ‌های دلخواه"),
    description: msg("چند نرخ دلخواه از بازار، هرکدام با آیکون، قیمت، تغییر و بازه‌ی امروز"),
    group: "market",
    heights: [1, 2, 3], defaultHeight: 2, requires: "market",
    options: {
      assets: true,
      style: { values: ["grid", "list"], labels: { grid: msg("شبکه‌ای"), list: msg("فهرست") }, default: "grid" },
      toggles: { change: { label: msg("نمایش تغییر"), default: true }, range: { label: msg("نمایش بازه‌ی امروز"), default: true } },
    },
  },
  news: {
    title: msg("آخرین اخبار"),
    description: msg("تازه‌ترین خبرهای بازار"),
    group: "news",
    heights: [2, 3, 4], defaultHeight: 2, unique: true, requires: "news",
    options: {
      count: [3, 5, 8, 10],
      toggles: { analysis: { label: msg("نمایش خلاصه‌ی تحلیل روز"), default: true } },
    },
    defaults: { count: 10 },
  },
  ai_analysis: {
    title: msg("تحلیل روز با هوش مصنوعی"),
    description: msg("فقط تحلیل روز: خلاصه‌ی خبرها، مهم‌ترین رویدادها و نکته‌ها"),
    group: "news",
    heights: [3, 4], defaultHeight: 4, unique: true, requires: "analysis",
    options: {
      toggles: {
        drivers: { label: msg("مهم‌ترین خبرها"), default: true },
        points: { label: msg("نکته‌ها"), default: true },
        risk: { label: msg("زیر نظر بگیرید"), default: true },
      },
    },
  },
  sms: {
    title: msg("پیامک‌های بانکی"),
    description: msg("پیامک‌هایی که منتظر ثبت هستند"),
    group: "tools",
    heights: [1, 2, 3], defaultHeight: 1, unique: true, requires: "native_sms",
  },
  clock: {
    title: msg("ساعت و تاریخ"),
    description: msg("ساعت و تاریخ امروز به وقت تهران، با تاریخ شمسی و میلادی"),
    group: "tools",
    heights: [1, 2], defaultHeight: 1, unique: true, requires: null,
    options: {
      style: { values: ["digital", "analog", "compact"], labels: { digital: msg("دیجیتال"), analog: msg("عقربه‌ای"), compact: msg("فشرده") }, default: "digital" },
      toggles: {
        seconds: { label: msg("نمایش ثانیه"), default: false },
        weekday: { label: msg("نمایش روز هفته"), default: true },
        gregorian: { label: msg("نمایش تاریخ میلادی"), default: true },
      },
    },
  },
  calendar: {
    title: msg("تقویم"),
    description: msg("تقویم شمسی با نشان اقساط، سررسید چک‌ها، تمدید اشتراک‌ها و تاریخ هدف‌ها"),
    group: "tools",
    heights: [2, 4], defaultHeight: 2, unique: true, requires: null,
    options: {
      toggles: { list: { label: msg("فهرست رویدادها زیر تقویم"), default: true }, total: { label: msg("جمع پرداختی و دریافتی ماه"), default: true } },
      style: { values: ["month", "agenda"], labels: { month: msg("ماه"), agenda: msg("برنامه") }, default: "month" },
      multi: {
        kinds: {
          label: msg("رویدادهای نمایش‌داده‌شده"),
          values: ["loan", "cheque", "subscription", "goal"],
          labels: { loan: msg("قسط وام"), cheque: msg("سررسید چک"), subscription: msg("تمدید اشتراک"), goal: msg("تاریخ هدف") },
          default: ["loan", "cheque", "subscription", "goal"],
          min: 1,
        },
      },
    },
  },
  shortcuts: {
    title: msg("میان‌بُرها"),
    description: msg("ثبت سریع هزینه و رفتن به بخش‌های پرکاربرد"),
    group: "tools",
    heights: [1, 2, 3], defaultHeight: 1, unique: true, requires: null,
    options: {
      style: { values: ["grid", "list"], labels: { grid: msg("شبکه‌ای"), list: msg("فهرست") }, default: "grid" },
      multi: {
        items: {
          label: msg("میان‌بُرهای نمایش‌داده‌شده"),
          values: ["add-expense", "incomes", "expenses", "portfolio", "loans", "reports"],
          labels: {
            "add-expense": msg("ثبت هزینه"), incomes: msg("درآمدها"), expenses: msg("هزینه‌ها"),
            portfolio: msg("پورتفو"), loans: msg("وام و اقساط"), reports: msg("گزارش‌ها"),
          },
          default: ["add-expense", "incomes", "expenses", "portfolio", "loans", "reports"],
          min: 1,
        },
      },
    },
  },
  plan: {
    title: msg("پلن"),
    description: msg("محدودیت‌های پلن رایگان و میزان استفاده"),
    group: "tools",
    heights: [1, 2], defaultHeight: 1, unique: true, requires: "free_plan",
  },
};

/** The appearance switches every widget has, whatever its type: its title and its card (background) */
export const WIDGET_APPEARANCE = {
  title: { label: msg("نمایش عنوان"), default: true },
  card: { label: msg("پس‌زمینه‌ی کارت"), default: true },
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

/** A valid height class: the one given when the widget allows it, else the allowed one nearest to it (the taller on a tie), else the type's default */
function fitHeight(type, height) {
  const { heights, defaultHeight } = WIDGET_CATALOG[type];
  const n = Math.round(Number(height));
  if (!WIDGET_HEIGHTS.includes(n)) return defaultHeight;
  return [...heights].sort((a, b) => Math.abs(a - n) - Math.abs(b - n) || b - a)[0];
}

/** A subset of `def.values` in their own order, or the default when fewer than `def.min` remain */
function cleanMulti(def, raw) {
  const picked = Array.isArray(raw) ? def.values.filter((v) => raw.includes(v)) : [];
  return picked.length >= (def.min || 0) && picked.length > 0 ? picked : [...def.default];
}

/** Only the options the type declares, with valid values (the default for anything else) */
function cleanConfig(type, raw) {
  const spec = WIDGET_CATALOG[type];
  const config = { ...(spec.defaults || {}) };
  const options = spec.options || {};
  const src = raw && typeof raw === "object" ? raw : {};
  if (options.count && options.count.includes(Number(src.count))) config.count = Number(src.count);
  if (options.assets && Array.isArray(src.assetIds)) {
    const ids = src.assetIds.filter((id) => typeof id === "string" && ASSET_ID_RE.test(id));
    config.assetIds = [...new Set(ids)].slice(0, DASHBOARD_LIMITS.rateListAssets);
  }
  if (options.style) config.style = options.style.values.includes(src.style) ? src.style : options.style.default;
  for (const [key, def] of Object.entries(options.choices || {})) {
    config[key] = def.values.includes(src[key]) ? src[key] : def.default;
  }
  for (const [key, def] of Object.entries({ ...WIDGET_APPEARANCE, ...(options.toggles || {}) })) {
    config[key] = typeof src[key] === "boolean" ? src[key] : def.default;
  }
  for (const [key, def] of Object.entries(options.multi || {})) config[key] = cleanMulti(def, src[key]);
  return config;
}

/** @returns {object|null} a valid widget, or null for something that is not one */
function cleanWidget(raw, usedIds) {
  if (!raw || typeof raw !== "object" || !WIDGET_CATALOG[raw.type]) return null;
  const type = raw.type;
  let id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : newWidgetId();
  while (usedIds.has(id)) id = newWidgetId();
  usedIds.add(id);
  const widget = {
    id,
    type,
    height: fitHeight(type, raw.height),
    config: cleanConfig(type, raw.config),
  };
  // The column the user put it in (the wide grid); absent, it goes where there is the most room
  if (Number.isInteger(raw.col) && raw.col >= 0 && raw.col < DASHBOARD_LIMITS.columns) widget.col = raw.col;
  return widget;
}

/**
 * A list of widgets from stored or restored data: unknown types dropped, a second copy of a
 * unique widget dropped, heights and options made valid, the length limited
 * @param {unknown} raw
 * @returns {Array<{ id: string, type: string, height: number, config: object, col?: number }>}
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

const preset = (type, extra = {}) => ({ type, ...extra });

/**
 * Every widget, in the order that spreads them evenly: a widget without a column goes under the
 * shortest one at its turn (layoutColumns), so the same list fills 4, 3 or 2 columns, also when
 * some are not shown to the user (no news in English, no bank messages on the website)
 */
const EVERYTHING = [
  preset("clock"), preset("month", { height: 2 }), preset("rate_list", { height: 2, config: { assetIds: ["USD", "USDT", "ons_gold", "oil_brent"] } }),
  preset("ai_analysis", { height: 4 }), preset("calendar", { height: 4 }), preset("expenses_latest", { height: 3 }),
  preset("goals", { height: 1 }), preset("shortcuts", { height: 2 }), preset("news", { height: 3 }),
  preset("alerts", { height: 1 }), preset("loans", { height: 2 }),
  preset("rates", { height: 1 }), preset("plan", { height: 1 }), preset("sms", { height: 1 }),
];

/**
 * What a user who never arranged the page sees, per screen: every widget on the website, for the
 * user to keep what they want; the app frame (one long column) starts with the essentials
 */
export const DEFAULT_DASHBOARD = {
  wide: EVERYTHING,
  desktop: EVERYTHING,
  tablet: EVERYTHING,
  mobile: [
    preset("rates"), preset("month"), preset("sms"), preset("alerts"), preset("plan"),
    preset("goals"), preset("news"), preset("expenses_latest"),
  ],
};

/**
 * The default widgets of a screen, each with a fresh id
 * @param {"wide"|"desktop"|"tablet"|"mobile"} screen
 */
const defaultsCache = new Map();
export function defaultWidgets(screen) {
  const key = DEFAULT_DASHBOARD[screen] ? screen : "desktop";
  // Built once per screen: the ids stay the same between renders (keys, open dialogs, drags)
  if (!defaultsCache.has(key)) defaultsCache.set(key, sanitizeWidgets(DEFAULT_DASHBOARD[key]));
  return defaultsCache.get(key);
}

/**
 * A whole dashboard document from stored or restored data; a screen without a valid list is not
 * set (null), so the default applies to it
 * @param {unknown} raw
 * @returns {{ version: number, wide: object[]|null, desktop: object[]|null, tablet: object[]|null, mobile: object[]|null, updatedAt: string }|null}
 */
export function sanitizeDashboard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = { version: DASHBOARD_LAYOUT_VERSION, ...Object.fromEntries(DASHBOARD_SCREENS.map((s) => [s, null])), updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt.slice(0, 40) : "" };
  for (const screen of DASHBOARD_SCREENS) {
    if (Array.isArray(raw[screen])) out[screen] = sanitizeWidgets(raw[screen]);
  }
  return DASHBOARD_SCREENS.some((s) => out[s]) ? out : null;
}

/** Whether any screen of the dashboard has a saved list */
export const hasSavedScreen = (dashboard) => DASHBOARD_SCREENS.some((s) => Array.isArray(dashboard?.[s]));

/**
 * The widgets of one screen: its saved list; else, for the 4- and 2-column screens, the 3-column
 * list when the user arranged it (the same widgets in the same order, their columns dropped so
 * they spread over this screen's columns); else the screen's own default
 */
export function widgetsOf(dashboard, screen) {
  const saved = dashboard?.[screen];
  if (Array.isArray(saved)) return saved;
  const base = dashboard?.[SCREEN_FALLBACK[screen]];
  return Array.isArray(base) ? base.map(({ col, ...widget }) => widget) : defaultWidgets(screen);
}

/** The dashboard with one screen's list replaced */
export function withScreen(dashboard, screen, widgets) {
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    ...Object.fromEntries(DASHBOARD_SCREENS.map((s) => [s, dashboard?.[s] ?? null])),
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
  const spec = WIDGET_CATALOG[type];
  const widget = { id: newWidgetId(), type, height: spec.defaultHeight, config: cleanConfig(type, config) };
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

/** How tall a widget is in the columns, in the grid's row units (its height class) */
const HEIGHT_UNITS = { 1: 2, 2: 4, 3: 6, 4: 8 };

/**
 * The widgets in `count` columns (the wide grid). A widget keeps the column the user put it in
 * (`col`, wrapped when there are fewer columns); one without goes under the shortest column at
 * its turn, so a layout never arranged still tiles evenly. Each column keeps the list's order.
 * @param {Array<object>} widgets
 * @param {number} count - 1 to DASHBOARD_LIMITS.columns
 * @returns {Array<Array<object>>}
 */
export function layoutColumns(widgets, count) {
  const columns = Array.from({ length: count }, () => []);
  const heights = Array(count).fill(0);
  for (const widget of widgets) {
    const column = Number.isInteger(widget.col) ? widget.col % count : heights.indexOf(Math.min(...heights));
    columns[column].push(widget);
    heights[column] += HEIGHT_UNITS[widget.height] || HEIGHT_UNITS[2];
  }
  return columns;
}

/**
 * Put a widget in column `column`, before the widget `beforeId` (the end of the column without
 * one). Every widget's column is saved with it, so the others stay where they are shown. Within
 * its own column it moves to where `beforeId` is, like moveWidget.
 */
export function placeWidget(widgets, count, id, column, beforeId = null) {
  const shown = layoutColumns(widgets, count);
  const columnOf = new Map(shown.flatMap((list, c) => list.map((w) => [w.id, c])));
  const fixed = widgets.map((w) => ({ ...w, col: columnOf.get(w.id) }));
  const active = fixed.find((w) => w.id === id);
  if (!active || !(column >= 0 && column < count)) return widgets;
  if (active.col === column && beforeId) return moveWidget(fixed, id, beforeId);
  const rest = fixed.filter((w) => w.id !== id);
  const at = beforeId ? rest.findIndex((w) => w.id === beforeId) : -1;
  const placed = { ...active, col: column };
  if (at < 0) return [...rest, placed];
  return [...rest.slice(0, at), placed, ...rest.slice(at)];
}

/** Move a widget one place up (-1) or down (+1): the keyboard and the arrows of the editor */
export function shiftWidget(widgets, id, step) {
  const from = widgets.findIndex((w) => w.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= widgets.length) return widgets;
  return moveWidget(widgets, id, widgets[to].id);
}

export const setWidgetHeight = (widgets, id, height) =>
  widgets.map((w) => (w.id === id ? { ...w, height: fitHeight(w.type, height) } : w));

export const configureWidget = (widgets, id, config) =>
  widgets.map((w) => (w.id === id ? { ...w, config: cleanConfig(w.type, { ...w.config, ...config }) } : w));
