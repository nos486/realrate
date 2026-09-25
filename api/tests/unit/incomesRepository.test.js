import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbGetUserIncomes,
  dbGetIncomeById,
  dbCreateIncome,
  dbUpdateIncome,
  dbDeleteIncome,
} from '../../src/repositories/incomes.repository.js';

/**
 * Minimal in-memory D1 stand-in covering only the statements incomes.repository.js issues.
 */
function createMockD1() {
  const store = new Map();

  const toAliased = (r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    category: r.category,
    amount: r.amount,
    incomeDate: r.income_date,
    notes: r.notes,
    recurringId: r.recurring_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  function makeStatement(query) {
    const q = query.trim();
    let args = [];

    const stmt = {
      bind(...boundArgs) {
        args = boundArgs;
        return stmt;
      },
      async run() {
        if (/^(CREATE|DROP|ALTER|INSERT OR IGNORE|DELETE FROM price_sources|INSERT INTO price_sources|UPDATE price_sources)/.test(q)) {
          return { success: true, meta: { changes: 0 } };
        }
        if (q.startsWith('INSERT INTO incomes')) {
          const [id, user_id, title, category, amount, income_date, notes, recurring_id, created_at, updated_at] = args;
          store.set(id, { id, user_id, title, category, amount, income_date, notes, recurring_id, created_at, updated_at });
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('UPDATE incomes')) {
          const [title, category, amount, income_date, notes, recurring_id, updated_at, id, user_id] = args;
          const row = store.get(id);
          if (!row || row.user_id !== user_id) return { meta: { changes: 0 } };
          Object.assign(row, { title, category, amount, income_date, notes, recurring_id, updated_at });
          return { meta: { changes: 1 } };
        }
        if (q.startsWith('DELETE FROM incomes')) {
          const [id, user_id] = args;
          const row = store.get(id);
          if (!row || row.user_id !== user_id) return { meta: { changes: 0 } };
          store.delete(id);
          return { meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
      async all() {
        if (q.includes('FROM incomes')) {
          const [user_id] = args;
          const results = [...store.values()]
            .filter((r) => r.user_id === user_id)
            .sort((a, b) => b.income_date.localeCompare(a.income_date) || b.created_at.localeCompare(a.created_at))
            .map(toAliased);
          return { results };
        }
        return { results: [] };
      },
      async first() {
        if (q.includes('FROM incomes')) {
          const [id, user_id] = args;
          const row = store.get(id);
          return row && row.user_id === user_id ? toAliased(row) : null;
        }
        return null;
      },
    };
    return stmt;
  }

  return { prepare: makeStatement, batch: async (stmts) => Promise.all(stmts.map((s) => s.run())), store };
}

const salary = { title: 'حقوق', category: 'salary', amount: 40000000, incomeDate: '2026-08-22', notes: '' };
const rent = { title: 'اجاره', category: 'rental', amount: 12000000, incomeDate: '2026-09-01', notes: 'واحد ۲' };

describe('incomes.repository (مخزن داده درآمدها)', () => {
  let env;

  beforeEach(() => {
    env = { DB: createMockD1() };
  });

  it('creates and lists incomes for a user, newest date first', async () => {
    const created = await dbCreateIncome(env, 'u_1', salary);
    await dbCreateIncome(env, 'u_1', rent);
    await dbCreateIncome(env, 'u_2', salary);

    expect(created.id).toMatch(/^inc_/);
    expect(created).toMatchObject({ userId: 'u_1', ...salary });

    const list = await dbGetUserIncomes(env, 'u_1');
    expect(list.map((i) => i.title)).toEqual(['اجاره', 'حقوق']);
    expect(list[0].amount).toBe(12000000);
  });

  it('updates only incomes owned by the user', async () => {
    const created = await dbCreateIncome(env, 'u_1', salary);

    expect(await dbUpdateIncome(env, 'u_2', created.id, { ...salary, amount: 1 })).toBeNull();

    const updated = await dbUpdateIncome(env, 'u_1', created.id, { ...salary, amount: 42000000 });
    expect(updated.amount).toBe(42000000);
    expect((await dbGetIncomeById(env, 'u_1', created.id)).amount).toBe(42000000);
  });

  it('deletes only incomes owned by the user', async () => {
    const created = await dbCreateIncome(env, 'u_1', salary);

    expect(await dbDeleteIncome(env, 'u_2', created.id)).toBe(false);
    expect(await dbDeleteIncome(env, 'u_1', created.id)).toBe(true);
    expect(await dbGetUserIncomes(env, 'u_1')).toEqual([]);
  });

  it('returns safe empty values without a database binding', async () => {
    expect(await dbGetUserIncomes({}, 'u_1')).toEqual([]);
    expect(await dbCreateIncome({}, 'u_1', salary)).toBeNull();
    expect(await dbDeleteIncome({}, 'u_1', 'inc_1')).toBe(false);
  });
});
