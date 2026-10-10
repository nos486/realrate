/**
 * entryForm.js — Driving the entry forms' parts in UI tests (web/src/shared/form/: the expense and
 * income forms): the category tiles, the currency beside the amount, a picker row, the day, and
 * «جزئیات بیشتر». Keeps the tests about what is chosen, not how the form lays it out.
 */
import { screen, fireEvent, within } from '@testing-library/react';

/** Pick a category tile (opening «همه‌ی دسته‌ها» when it is not among the first) */
export function pickCategory(name) {
  const grid = () => within(document.querySelector('.category-grid'));
  let tile = grid().queryByRole('radio', { name });
  if (!tile) {
    const more = document.querySelector('.category-tile.is-more');
    if (more?.getAttribute('aria-expanded') === 'false') fireEvent.click(more);
    tile = grid().getByRole('radio', { name });
  }
  fireEvent.click(tile);
}

/** The category tile chosen (its name) */
export const chosenCategory = () => document.querySelector('.category-tile[aria-checked="true"]')?.getAttribute('aria-label') || '';

/** Choose the currency beside the amount, by its name («یورو») */
export function pickCurrency(label) {
  const select = screen.getByLabelText('ارز');
  const option = [...select.options].find((o) => o.textContent === label);
  if (!option) throw new Error(`No currency «${label}»`);
  fireEvent.change(select, { target: { value: option.value } });
}

/** The currency chosen beside the amount (its name) */
export const chosenCurrency = () => {
  const select = screen.getByLabelText('ارز');
  return select.options[select.selectedIndex]?.textContent || '';
};

/** A picker row by its label (null when the form has none) */
export function pickerRow(label) {
  return [...document.querySelectorAll('.picker-row')]
    .find((row) => row.querySelector('.picker-row-label')?.textContent === label) || null;
}

/** Open a picker row and return its options (a `within` of the list) */
export function openRow(label) {
  const row = pickerRow(label);
  if (!row) throw new Error(`No picker row «${label}»`);
  if (row.getAttribute('aria-expanded') === 'false') fireEvent.click(row);
  return within(document.getElementById(row.getAttribute('aria-controls')));
}

/** Pick an option of a picker row */
export function pickRow(label, name) {
  fireEvent.click(openRow(label).getByRole('radio', { name }));
}

/** What a picker row shows as chosen */
export const rowValue = (label) => pickerRow(label)?.querySelector('.picker-row-value')?.textContent || '';

/** Type a Shamsi day («1404/12/10») through «روز دیگر» */
export function setDay(shamsi) {
  if (!document.querySelector('.date-field .date-text-input')) {
    fireEvent.click(within(document.querySelector('.date-field')).getByRole('tab', { name: 'روز دیگر' }));
  }
  fireEvent.change(document.querySelector('.date-field .date-text-input'), { target: { value: shamsi } });
}

/** Open «جزئیات بیشتر» */
export function openDetails() {
  const toggle = document.querySelector('.more-details-toggle');
  if (toggle?.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
}
