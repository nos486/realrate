/**
 * ExpenseCsvImportButton.jsx — Reads an expense CSV back in (the file the expenses' or a project's
 * export writes, utils/expenseCsv.js): each row saved as an expense in the everyday expenses or
 * the project shown (`groupId`). A category and an account are found by their name in the file;
 * an unknown category is «سایر» among the everyday expenses and none in a project.
 */

import React from 'react';
import { GenericCsvImportButton } from '../../../shared/ui/index.js';
import { listCategories } from '../../../shared/categories/categoryStore.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { parseExpenseCsvRow } from '../utils/expenseCsv.js';

/**
 * @param {{ saveExpense: (input: object) => Promise<object>, groupId?: string, accounts?: object[],
 *   onImported?: () => void, disabled?: boolean }} props — groupId: a project's ('' or none: the
 *   everyday expenses)
 */
export default function ExpenseCsvImportButton({ saveExpense, groupId = '', accounts = [], onImported, disabled = false }) {
  const parseRow = (row, headerIndex, rowIndex) => {
    const categories = new Map(listCategories('expense', { includeHidden: true }).map((c) => [c.label, c.value]));
    const accountIds = new Map(accounts.map((a) => [accountLabel(a), a.id]));
    return parseExpenseCsvRow(row, headerIndex, rowIndex, {
      categoryOf: (label) => categories.get(label) || (groupId ? '' : 'other'),
      accountOf: (label) => accountIds.get(label) || '',
    });
  };
  return (
    <GenericCsvImportButton
      parseRow={parseRow}
      onImportRow={(data) => saveExpense({ ...data, groupId })}
      onFinished={onImported}
      itemLabel="هزینه"
      disabled={disabled}
    />
  );
}
