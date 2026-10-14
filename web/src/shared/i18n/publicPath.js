/**
 * publicPath.js — Address of a public website page (features, FAQ, about, Android app, privacy) in the active language
 *
 * Persian pages live at the root and English ones under `/en` (web/scripts/build-seo.mjs), so a link from the
 * app or the landing page must point at the page's twin in the language the visitor reads.
 */

import { LOCALES, getLocale } from '../../utils/i18n.js';

/** Where each language's static pages live: Persian at the root, the others under their code */
const BASE = Object.fromEntries(Object.keys(LOCALES).map((code) => [code, code === 'fa' ? '' : `/${code}`]));

/**
 * @param {string} path - the Persian page's path, e.g. '/features/portfolio'
 * @returns {string} the same page in the active language, e.g. '/en/features/portfolio'
 */
export const publicPath = (path) => `${BASE[getLocale()] ?? ''}${path}`;
