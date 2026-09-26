/**
 * pageLocally.js — The same date filter / order / page the server applies to vault records, for
 * a list already in the browser (accounts still on the older plaintext API)
 */

/**
 * @param {Array<object>} items
 * @param {{ from?: string, to?: string, order?: 'asc'|'desc', limit?: number, offset?: number }} filters
 * @param {(item: object) => string} dateOf the item's Gregorian YYYY-MM-DD ('' when it has none)
 * @returns {{ items: Array<object>, total: number }}
 */
export function pageLocally(items, { from = '', to = '', order = 'desc', limit = 0, offset = 0 } = {}, dateOf) {
  const dir = order === 'asc' ? 1 : -1;
  const matching = items
    .filter((item) => {
      const day = dateOf(item) || '';
      return (!from || day >= from) && (!to || (day && day <= to));
    })
    .sort((a, b) =>
      dir * ((dateOf(a) || '').localeCompare(dateOf(b) || '') || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    );
  return { items: limit ? matching.slice(offset, offset + limit) : matching, total: matching.length };
}
