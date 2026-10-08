/**
 * cardFormula.js — A home card a user builds from several assets with a formula
 *
 * The user names up to FORMULA_VARS.length assets as الف، ب، ج، د and writes a formula over their
 * prices, e.g. a coin's bubble percent «الف ÷ (ب − الف)» with الف = the coin's bubble and ب = the
 * coin, shown as a percent. The card shows the formula's value at the book's prices and, turned
 * over, its daily chart: the formula of each day's closes of its assets (one request for all of
 * them). Prices are the book's toman prices (each asset's history under its id is in tomans too).
 *
 * The formula is parsed — never evaluated as code: numbers, the variables, + − × ÷ and
 * parentheses. It is stored in one form ("a/(b-a)") and shown in Persian («الف ÷ (ب − الف)»).
 * Pure: shared by the API (which validates a saved layout) and the web app.
 */

/** The variables, in order: the stored letter and how the user writes and reads it */
export const FORMULA_VARS = [
  { key: "a", label: "الف" },
  { key: "b", label: "ب" },
  { key: "c", label: "ج" },
  { key: "d", label: "د" },
];

/** How a formula card shows its value: a plain number, or a percent (the value × 100, «٪») */
export const FORMULA_FORMATS = {
  number: "عدد",
  percent: "درصد",
};

export const FORMULA_LIMITS = { nameLength: 40, exprLength: 80 };

/** A ready formula to start from */
export const FORMULA_PRESETS = [
  {
    key: "bubble_pct",
    label: "درصد حباب",
    expr: "a/(b-a)",
    format: "percent",
    // A starting choice of assets: the user can pick another coin and its bubble
    vars: { a: "bubble_full_coin", b: "full_coin" },
    hint: "الف: حباب سکه، ب: قیمت همان سکه — حباب نسبت به ارزش طلای سکه",
  },
];

/** A formula card's id in a layout section: the prefix is reserved (never a price book id) */
export const FORMULA_ID_PREFIX = "fx_";
export const FORMULA_ID_RE = /^fx_[a-z0-9]{4,24}$/;
export const isFormulaId = (id) => String(id || "").startsWith(FORMULA_ID_PREFIX);

const VAR_KEYS = new Set(FORMULA_VARS.map((v) => v.key));

/** Persian / Arabic digits and the Persian decimal sign as Latin */
const latinDigits = (s) => s
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
  .replace(/[٫]/g, ".");

/** The formula's tokens: numbers, variables (stored letters), operators and parentheses */
function tokenize(text) {
  const src = latinDigits(String(text ?? ""))
    .replace(/[÷]/g, "/")
    .replace(/[×]/g, "*")
    .replace(/[−–]/g, "-");
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ("+-*/()".includes(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    const num = src.slice(i).match(/^\d+(\.\d+)?/);
    if (num) { tokens.push({ type: "num", value: Number(num[0]), text: num[0] }); i += num[0].length; continue; }
    const label = FORMULA_VARS.find((v) => src.startsWith(v.label, i));
    if (label) { tokens.push({ type: "var", value: label.key }); i += label.label.length; continue; }
    const lower = ch.toLowerCase();
    if (VAR_KEYS.has(lower) && !/[a-z]/i.test(src[i + 1] || "")) { tokens.push({ type: "var", value: lower }); i++; continue; }
    throw new Error(`نویسه‌ی «${ch}» در فرمول معتبر نیست`);
  }
  return tokens;
}

/** A token as the user wrote it (a variable by its Persian name), for an error */
const shownToken = (t) => (t.type === "var" ? FORMULA_VARS.find((v) => v.key === t.value).label : t.text ?? t.value);

/** Recursive descent: expr := term (± term)*, term := factor (×÷ factor)*, factor := −factor | atom */
function parseTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (t, ops) => t?.type === "op" && ops.includes(t.value);

  function atom() {
    const t = tokens[pos++];
    if (!t) throw new Error("فرمول ناتمام است");
    if (t.type === "num") return { type: "num", value: t.value, text: t.text };
    if (t.type === "var") return { type: "var", key: t.value };
    if (t.type === "op" && t.value === "(") {
      const inner = expr();
      if (!isOp(tokens[pos++], ")")) throw new Error("پرانتز بسته نشده است");
      return { type: "group", inner };
    }
    throw new Error(`«${shownToken(t)}» بی‌جا آمده است`);
  }
  function factor() {
    if (isOp(peek(), "-")) {
      pos++;
      return { type: "neg", arg: factor() };
    }
    return atom();
  }
  function term() {
    let node = factor();
    while (isOp(peek(), "*/")) node = { type: "bin", op: tokens[pos++].value, left: node, right: factor() };
    return node;
  }
  function expr() {
    let node = term();
    while (isOp(peek(), "+-")) node = { type: "bin", op: tokens[pos++].value, left: node, right: term() };
    return node;
  }

  const tree = expr();
  if (pos < tokens.length) throw new Error(`«${shownToken(tokens[pos])}» بی‌جا آمده است`);
  return tree;
}

/** The stored form of a tree ("a/(b-a)") */
function storedOf(node) {
  switch (node.type) {
    case "num": return node.text;
    case "var": return node.key;
    case "group": return `(${storedOf(node.inner)})`;
    case "neg": return `-${storedOf(node.arg)}`;
    default: return `${storedOf(node.left)}${node.op}${storedOf(node.right)}`;
  }
}

const varsOfTree = (node, out = new Set()) => {
  if (node.type === "var") out.add(node.key);
  else if (node.type === "group") varsOfTree(node.inner, out);
  else if (node.type === "neg") varsOfTree(node.arg, out);
  else if (node.type === "bin") { varsOfTree(node.left, out); varsOfTree(node.right, out); }
  return out;
};

/**
 * Read a formula as the user wrote it (Persian or Latin)
 * @param {string} text
 * @returns {{ ok: true, expr: string, tree: object, vars: string[] }|{ ok: false, error: string }}
 *   `expr`: the stored form; `vars`: the variables it uses, in order
 */
export function parseFormula(text) {
  try {
    if (!String(text ?? "").trim()) throw new Error("فرمول خالی است");
    if (String(text).length > FORMULA_LIMITS.exprLength) throw new Error("فرمول خیلی طولانی است");
    const tree = parseTokens(tokenize(text));
    const used = varsOfTree(tree);
    if (used.size === 0) throw new Error("فرمول باید دست‌کم یک دارایی (الف، ب، …) داشته باشد");
    return { ok: true, expr: storedOf(tree), tree, vars: FORMULA_VARS.map((v) => v.key).filter((k) => used.has(k)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * A formula's value for the variables' values; null when one is missing or the result isn't a
 * finite number (a division by zero)
 * @param {object} tree - parseFormula().tree
 * @param {Record<string, number|null|undefined>} values - by variable letter
 */
export function evaluateFormula(tree, values) {
  const run = (node) => {
    switch (node.type) {
      case "num": return node.value;
      case "var": {
        const v = Number(values?.[node.key]);
        if (values?.[node.key] === null || values?.[node.key] === undefined || !Number.isFinite(v)) throw new Error("missing");
        return v;
      }
      case "group": return run(node.inner);
      case "neg": return -run(node.arg);
      default: {
        const l = run(node.left);
        const r = run(node.right);
        if (node.op === "+") return l + r;
        if (node.op === "-") return l - r;
        if (node.op === "*") return l * r;
        return l / r;
      }
    }
  };
  try {
    const out = run(tree);
    return Number.isFinite(out) ? out : null;
  } catch {
    return null;
  }
}

/** A stored formula as the user reads it: «الف ÷ (ب − الف)», Persian digits */
export function formatFormula(expr) {
  const parsed = parseFormula(expr);
  if (!parsed.ok) return String(expr || "");
  const show = (node) => {
    switch (node.type) {
      case "num": return Number(node.value).toLocaleString("fa-IR", { useGrouping: false, maximumFractionDigits: 10 });
      case "var": return FORMULA_VARS.find((v) => v.key === node.key).label;
      case "group": return `(${show(node.inner)})`;
      case "neg": return `−${show(node.arg)}`;
      default: return `${show(node.left)} ${{ "+": "+", "-": "−", "*": "×", "/": "÷" }[node.op]} ${show(node.right)}`;
    }
  };
  return show(parsed.tree);
}

/**
 * A formula's daily series from its assets' daily series (the days all of them have): each day's
 * candle is the formula of their opens and of their closes, its high and low the larger and smaller
 * of the two (the formula of the assets' highs is not the formula's high)
 * @param {object} tree
 * @param {Record<string, { days: string[], points: number[], candles?: number[][] }>} seriesByVar
 * @returns {{ days: string[], points: number[], candles: number[][] }|null}
 */
export function formulaSeries(tree, seriesByVar) {
  const keys = Object.keys(seriesByVar || {});
  if (!keys.length || keys.some((k) => !seriesByVar[k]?.days?.length)) return null;
  const at = Object.fromEntries(keys.map((k) => [k, new Map(seriesByVar[k].days.map((d, i) => [d, i]))]));
  const days = [];
  const points = [];
  const candles = [];
  for (const day of seriesByVar[keys[0]].days) {
    if (!keys.every((k) => at[k].has(day))) continue;
    const pick = (field) => Object.fromEntries(keys.map((k) => {
      const s = seriesByVar[k];
      const i = at[k].get(day);
      return [k, field === "open" ? s.candles?.[i]?.[0] ?? s.points[i] : s.candles?.[i]?.[3] ?? s.points[i]];
    }));
    const close = evaluateFormula(tree, pick("close"));
    if (close === null) continue;
    const open = evaluateFormula(tree, pick("open")) ?? close;
    days.push(day);
    points.push(close);
    candles.push([open, Math.max(open, close), Math.min(open, close), close]);
  }
  return days.length ? { days, points, candles } : null;
}

/**
 * A formula card's definition as stored, or null when it isn't valid: a name, the stored formula,
 * a price book id for each variable it uses (and only those), and its format
 * @param {unknown} input
 * @param {(id: string) => string} [normalizeId] - the caller's id form (the web's toPriceId)
 */
export function sanitizeFormulaCard(input, normalizeId = (id) => String(id || "").trim().toLowerCase()) {
  if (!input || typeof input !== "object") return null;
  const parsed = parseFormula(input.expr);
  if (!parsed.ok) return null;
  const vars = {};
  for (const key of parsed.vars) {
    const id = normalizeId(input.vars?.[key]);
    if (!id || id.length > 120 || isFormulaId(id)) return null;
    vars[key] = id;
  }
  const name = String(input.name ?? "").trim().slice(0, FORMULA_LIMITS.nameLength);
  if (!name) return null;
  const format = Object.hasOwn(FORMULA_FORMATS, input.format) ? input.format : "number";
  return { name, expr: parsed.expr, vars, format };
}

/** The number a formula card shows: a percent is the value × 100 */
export const formulaShownValue = (value, format) => (value === null || value === undefined ? null : format === "percent" ? value * 100 : value);

/**
 * A formula card's value as shown: «۱۹٫۶۵٪» for a percent; a number whole from 100 up, four
 * significant digits below (a ratio such as ۰٫۱۹۶۵)
 * @param {number|null} value - the formula's value
 * @param {'number'|'percent'} format
 */
export function formatFormulaValue(value, format = "number") {
  const shown = formulaShownValue(value, format);
  if (shown === null || !Number.isFinite(shown)) return "—";
  if (format === "percent") return `${shown.toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;
  return Math.abs(shown) >= 100
    ? Math.round(shown).toLocaleString("fa-IR")
    : shown.toLocaleString("fa-IR", { maximumSignificantDigits: 4 });
}
