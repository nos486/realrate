/**
 * designTokens.test.js — Keeps the app's styles on the design tokens (web/src/styles/tokens.css,
 * docs/en/DESIGN.md): no raw hex colors, font sizes, radii or extra weights outside the tokens,
 * no hover "lift", no undefined custom property, and the CSS categorical palette equal to the
 * charts' CHART_COLORS.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../../../web/src/shared/ui/chartColors.js';

const WEB_SRC = path.resolve(__dirname, '../../../web/src');
const STYLES = path.join(WEB_SRC, 'styles');
const TOKENS = 'tokens.css';
// The public landing page has its own small set of --lp-* tokens, shared with the static SEO pages
const OWN_DESIGN = new Set([TOKENS, 'landing.css']);

/**
 * Raw rgba() colors still left per file. The count may only go down: a new translucent color is a
 * token (a hue's -faint / -soft / -tint / -border, or a surface / border token).
 */
const RGBA_LEFT = {
  'app-shell.css': 6, 'banks.css': 3, 'base.css': 7, 'cheques.css': 5, 'demo.css': 9, 'expenses.css': 3,
  'feedback.css': 4, 'header.css': 4, 'loading.css': 2, 'loans.css': 7, 'market.css': 12, 'modals.css': 8,
  'news.css': 4, 'portfolio-extras.css': 5, 'portfolio.css': 20, 'transactions.css': 1, 'universal-search.css': 13,
};

const cssFiles = fs.readdirSync(STYLES).filter((f) => f.endsWith('.css'));
const read = (f) => fs.readFileSync(path.join(STYLES, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const appFiles = cssFiles.filter((f) => !OWN_DESIGN.has(f));

/** Every `prop: value` declaration of a file, with its line for the failure message */
function declarations(file, prop) {
  const out = [];
  read(file).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'g'))) out.push({ at: `${file}:${i + 1}`, value: m[1].trim() });
  });
  return out;
}

describe('design tokens', () => {
  it('has no hex color outside tokens.css', () => {
    const found = appFiles.flatMap((f) => read(f).split('\n').map((l, i) => (/#[0-9a-f]{3,8}\b/i.test(l) ? `${f}:${i + 1} ${l.trim()}` : null)).filter(Boolean));
    expect(found).toEqual([]);
  });

  it('only lowers the raw rgba() count of each file', () => {
    const over = appFiles
      .map((f) => ({ f, n: (read(f).match(/rgba?\(/g) || []).length }))
      .filter(({ f, n }) => n > (RGBA_LEFT[f] || 0))
      .map(({ f, n }) => `${f}: ${n} > ${RGBA_LEFT[f] || 0}`);
    expect(over).toEqual([]);
  });

  it('sets every font-size from the type scale', () => {
    // em sizes follow their parent; emoji / icon glyphs of 40px and more are pictures, not text
    const ok = (v) => /^var\(--fs-[\w-]+\)(\s*!important)?$/.test(v) || /em$/.test(v) || /^(inherit|max\(|clamp\()/.test(v) || (/^\d+px$/.test(v) && parseFloat(v) >= 40);
    const bad = appFiles.flatMap((f) => declarations(f, 'font-size')).filter((d) => !ok(d.value));
    expect(bad).toEqual([]);
  });

  it('sets every border-radius from the radius tokens', () => {
    const ok = (v) => v.split(/\s+/).every((p) => /^(0|var\(--[\w-]+\)|\d+%|inherit|!important)$/.test(p)) || /^calc\(/.test(v);
    const bad = appFiles.flatMap((f) => declarations(f, 'border-radius')).filter((d) => !ok(d.value));
    expect(bad).toEqual([]);
  });

  it('uses only the three font weights', () => {
    const bad = appFiles.flatMap((f) => declarations(f, 'font-weight')).filter((d) => !/^(400|600|700|normal|bold|inherit)(\s*!important)?$/.test(d.value));
    expect(bad).toEqual([]);
  });

  it('never lifts an element on hover', () => {
    const lifts = cssFiles.flatMap((f) => [...read(f).matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)]
      .filter((m) => /translateY\(\s*-[\d.]+px/.test(m[2]))
      .map((m) => `${f}: ${m[1].trim()}`));
    expect(lifts).toEqual([]);
  });

  it('defines every custom property the styles use', () => {
    const all = cssFiles.map(read).join('\n');
    const defined = new Set([...all.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    // properties a component sets inline (style={{ '--tone': … }})
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
    });
    for (const file of walk(WEB_SRC)) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/['"](--[\w-]+)['"]/g)) defined.add(m[1]);
    }
    // a var() without a fallback must resolve
    const missing = [...new Set([...all.matchAll(/var\((--[\w-]+)\s*\)/g)].map((m) => m[1]))].filter((v) => !defined.has(v));
    expect(missing).toEqual([]);
  });

  it('keeps the CSS categorical palette equal to CHART_COLORS', () => {
    const tokens = read(TOKENS);
    const cat = (name) => (tokens.match(new RegExp(`--cat-${name}:\\s*(#[0-9a-f]{6})`, 'i')) || [])[1]?.toLowerCase();
    expect(CHART_COLORS.map((_, i) => cat(i + 1))).toEqual(CHART_COLORS.map((c) => c.toLowerCase()));
    expect(cat('other')).toBe(CHART_OTHER_COLOR.toLowerCase());
  });
});
