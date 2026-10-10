/**
 * EntryFormActions.jsx — An entry form's footer. A new entry: «ثبت و بعدی» (saved, and the form
 * stays open, cleared for the next one — entering a day's receipts one after another) beside the
 * main button; the × in the header closes it. An edit (or an entry filled in from elsewhere, a
 * bank SMS): «انصراف» and save.
 */

import React from 'react';
import { Button } from '../ui/index.js';

/**
 * @param {{ submitLabel: string, valid: boolean, submitting: boolean, onCancel: () => void,
 *   onNext?: (() => void)|null }} props — onNext: offered only for a new entry
 */
export default function EntryFormActions({ submitLabel, valid, submitting, onCancel, onNext = null }) {
  return (
    <div className="modal-actions">
      {onNext ? (
        <Button variant="secondary" block disabled={!valid || submitting} onClick={onNext}>ثبت و بعدی</Button>
      ) : (
        <Button variant="secondary" block disabled={submitting} onClick={onCancel}>انصراف</Button>
      )}
      <Button type="submit" block loading={submitting} disabled={!valid}>{submitLabel}</Button>
    </div>
  );
}
