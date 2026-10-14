/**
 * i18n-scan.mjs — Finds Persian texts in the source that are not translatable yet
 *
 * A Persian literal counts as handled when it is the argument of `t('…')` / `msg('…')` (utils/i18n.js),
 * sits in a comment, or its line ends with `// i18n-ignore` (Persian that must stay Persian: bank SMS
 * patterns, search aliases, the Persian-only dictionary entries themselves).
 *
 *   node web/scripts/i18n-scan.mjs [path ...]   # lists the unhandled lines (default: web/src and the shared api/src code)
 *
 * The functions are also used by api/tests/unit/i18n.test.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PERSIAN = /[؀-ۿ]/;
const CALL = /\b(?:t|msg)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** Replaces every comment with spaces (keeping line breaks), leaving strings untouched */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && n === '/' && src[i - 1] !== ':') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Every literal handed to t() / msg() in a source text
 * @param {string} src
 * @returns {string[]} the texts, escapes resolved
 */
export function extractKeys(src) {
  const keys = [];
  for (const m of stripComments(src).matchAll(CALL)) {
    try {
      keys.push(new Function(`return ${m[1]}${m[2].replace(/\$\{/g, '\\${')}${m[1]}`)());
    } catch {
      keys.push(m[2]);
    }
  }
  return keys;
}

/**
 * Lines holding Persian text that is neither translatable nor marked `i18n-ignore`
 * @param {string} src
 * @returns {{ line: number, text: string }[]}
 */
export function findUntranslated(src) {
  const original = src.split('\n');
  const masked = stripComments(src).replace(CALL, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
  const out = [];
  masked.forEach((text, idx) => {
    if (PERSIAN.test(text) && !/i18n-ignore/.test(original[idx])) out.push({ line: idx + 1, text: original[idx].trim() });
  });
  return out;
}

/**
 * Data files whose Persian names, units, badges and labels are translated at display time instead of
 * line by line: the Worker shares these files and only speaks Persian, so the web looks each name up
 * in web/src/i18n/en/catalog.js (displayEngine.js, the asset registry, bank registry helpers).
 * api/tests/unit/catalogI18n.test.js checks that every displayed name has an English entry.
 */
export const SKIP = new Set([
  'api/src/config/banks.config.js',
  'api/src/config/categories.config.js',
  'api/src/config/features.js',
  'api/src/config/news.config.js',
  'api/src/config/planLimits.js',
  'api/src/config/sources.config.js',
  'api/src/config/tgjuCatalog.js',
  'api/src/config/usageLimits.js',
  'api/src/domain/specs/bubble.spec.js',
  'api/src/domain/specs/cash.spec.js',
  'api/src/domain/specs/coin.spec.js',
  'api/src/domain/specs/commodity.spec.js',
  'api/src/domain/specs/crypto.spec.js',
  'api/src/domain/specs/forex.spec.js',
  'api/src/domain/specs/gold.spec.js',
  'api/src/domain/specs/silver.spec.js',
].map((p) => path.join(ROOT, p)));

/** Source files (not symlinks, not tests, not SKIP data files) under a directory */
export function listSources(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink() || SKIP.has(full)) continue;
    if (entry.isDirectory()) files.push(...listSources(full));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** The directories whose Persian texts reach the screen: the web app and the code it shares with the API */
export const SCAN_ROOTS = ['web/src', 'api/src/domain', 'api/src/config'].map((p) => path.join(ROOT, p));
/** The English dictionaries (one file per area) */
export const DICTIONARY_DIR = path.join(ROOT, 'web/src/i18n/en');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const roots = process.argv.slice(2).map((p) => path.resolve(p));
  let total = 0;
  for (const dir of roots.length ? roots : SCAN_ROOTS) {
    const files = fs.statSync(dir).isDirectory() ? listSources(dir) : [dir];
    for (const file of files) {
      if (file.startsWith(DICTIONARY_DIR)) continue;
      const hits = findUntranslated(fs.readFileSync(file, 'utf8'));
      for (const hit of hits) console.log(`${path.relative(ROOT, file)}:${hit.line}: ${hit.text}`);
      total += hits.length;
    }
  }
  console.log(`${total} untranslated line(s)`);
}
