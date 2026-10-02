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
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
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
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
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
  return (name || fallback).replace(/[^a-zA-Z0-9_؀-ۿ-]/g, '_');
}
