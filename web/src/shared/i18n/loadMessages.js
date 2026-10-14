/**
 * loadMessages.js — Loads the English dictionary (`web/src/i18n/en/*.js`) before the app renders
 *
 * Each dictionary file default-exports `{ 'persian text': 'English text' }`, one file per area, and
 * is loaded only for English: Persian needs none (the Persian text is the key).
 */

import { registerMessages } from '../../utils/i18n.js';

const dictionaries = import.meta.glob('../../i18n/*/*.js');

/** @param {string} code - a language other than Persian */
export async function loadMessages(code) {
  const prefix = `../../i18n/${code}/`;
  const loaders = Object.entries(dictionaries).filter(([path]) => path.startsWith(prefix));
  const modules = await Promise.all(loaders.map(([, load]) => load()));
  for (const mod of modules) registerMessages(code, mod.default);
}
