/**
 * recurringSync.js — Turn due fixed-income periods into income entries
 *
 * Runs in the browser whenever incomes load (and after a rule changes), so it works the same for
 * plaintext and end-to-end encrypted accounts. For each rule it creates the entries that came due
 * since `generatedThrough` — skipping any that already exist — then advances `generatedThrough`
 * to the last date handled. A failure stops that rule where it is; the next run continues there.
 */

import { dueOccurrences } from '../../../utils/recurringIncome.js';

/** The editable fields of a stored rule (what the API accepts back) */
export function ruleInput(rule) {
  const { id: _id, userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = rule;
  return input;
}

/**
 * @param {object} args
 * @param {Array<object>} args.rules
 * @param {Array<object>} args.incomes current entries (to avoid duplicates)
 * @param {string} args.today ISO date
 * @param {(data: object) => Promise<{ income: object }>} args.createIncome
 * @param {(ruleId: string, data: object) => Promise<{ rule: object }>} args.updateRule
 * @returns {Promise<{ created: object[], rules: object[], errors: string[] }>}
 */
export async function syncRecurringIncomes({ rules, incomes, today, createIncome, updateRule }) {
  const created = [];
  const errors = [];
  const nextRules = [];

  for (const rule of rules) {
    const due = dueOccurrences(rule, today);
    if (due.length === 0) {
      nextRules.push(rule);
      continue;
    }

    const existing = new Set(incomes.filter((i) => i.recurringId === rule.id).map((i) => i.incomeDate));
    let handledThrough = '';
    for (const date of due) {
      if (!existing.has(date)) {
        try {
          const res = await createIncome({
            title: rule.title,
            category: rule.category,
            amount: rule.amount,
            incomeDate: date,
            notes: rule.notes,
            recurringId: rule.id,
          });
          if (res?.income) created.push(res.income);
        } catch (err) {
          errors.push(`«${rule.title}»: ${err.message || 'ثبت خودکار ناموفق بود'}`);
          break;
        }
      }
      handledThrough = date;
    }

    if (!handledThrough) {
      nextRules.push(rule);
      continue;
    }
    try {
      const res = await updateRule(rule.id, { ...ruleInput(rule), generatedThrough: handledThrough });
      nextRules.push(res?.rule || { ...rule, generatedThrough: handledThrough });
    } catch (err) {
      // The entries exist; the duplicate check keeps the next run from adding them again
      errors.push(`«${rule.title}»: ${err.message || 'به‌روزرسانی ناموفق بود'}`);
      nextRules.push(rule);
    }
  }

  return { created, rules: nextRules, errors };
}
