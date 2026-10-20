/**
 * csv.js — Shared CSV parse/build/download helpers, used by every feature's
 * export/import buttons (Portfolio, Incomes, Loans) so the RFC4180 handling
 * (quoted fields, "" escapes, embedded newlines/commas) lives in one place.
 */

import { saveTextFile } from './fileExport.js';

/** RFC4180-ish CSV parser: handles quoted fields, "" escaped quotes, and embedded newlines/commas. */
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(unescapeCsvFormula(field));
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(unescapeCsvFormula(field));
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(unescapeCsvFormula(field));
    rows.push(row);
  }
  return rows;
}

/** A text a spreadsheet would run as a formula (=, +, -, @, tab, carriage return first) */
const FORMULA_START_RE = /^[=+\-@\t\r]/;
/** A plain number written as text ("-12.5", "+3", "-۱۲") is data, not a formula */
const NUMBER_TEXT_RE = /^[+-]?[\d\u06F0-\u06F9.,٫٬]+%?$/;

/**
 * One quoted CSV field. A text that Excel or Sheets would run as a formula (e.g. an asset name
 * "=HYPERLINK(…)" in a portfolio someone shared) gets a leading apostrophe, so it shows as text;
 * numbers stay as they are. parseCsvText takes the apostrophe off again on import.
 */
export function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (typeof val !== 'number' && FORMULA_START_RE.test(str) && !NUMBER_TEXT_RE.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

/** A field as written, without the apostrophe escapeCsvField put before a formula-like text */
export function unescapeCsvFormula(field) {
  return /^'[=+\-@\t\r]/.test(field) ? field.slice(1) : field;
}

/** Builds a full CSV string (with UTF-8 BOM) from a header list and array of row arrays. */
export function buildCsvContent(headers, rows) {
  const lines = [headers.map(escapeCsvField).join(',')];
  rows.forEach((row) => lines.push(row.map(escapeCsvField).join(',')));
  return '﻿' + lines.join('\r\n');
}

/** Save the given CSV content (a download; the share sheet in the Android app) */
export function downloadCsvFile(filename, content) {
  return saveTextFile(filename, content, 'text/csv;charset=utf-8');
}

/** Sanitizes an arbitrary string into a safe CSV filename fragment. */
export function safeFilenamePart(name, fallback = 'export') {
  return (name || fallback).replace(/[^a-zA-Z0-9_؀-ۿ-]/g, '_'); // i18n-ignore
}
