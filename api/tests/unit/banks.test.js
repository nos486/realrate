import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BANKS,
  getBankById,
  isCustomBankId,
  matchBankIdByName,
  normalizeBankName,
} from '../../src/config/banks.config.js';
import {
  dbCreateCustomBank,
  dbDeleteCustomBank,
  dbListCustomBanks,
  MAX_CUSTOM_BANKS_PER_USER,
} from '../../src/repositories/customBanks.repository.js';
import { resolveLoanBank } from '../../src/repositories/loans.repository.js';
import worker from '../../src/index.js';

/** Minimal in-memory D1 for the custom_banks table */
function createDb() {
  const banks = [];
  const executed = [];
  const db = {
    banks,
    executed,
    prepare(sql) {
      const q = sql.trim();
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() {
          executed.push({ q, args });
          if (q.startsWith('INSERT INTO custom_banks')) {
            const [id, user_id, name, created_at] = args;
            banks.push({ id, user_id, name, created_at });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('DELETE FROM custom_banks')) {
            const [id, userId] = args;
            const i = banks.findIndex((b) => b.id === id && b.user_id === userId);
            if (i >= 0) banks.splice(i, 1);
            return { meta: { changes: i >= 0 ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async all() {
          if (q.includes('FROM custom_banks WHERE user_id')) {
            return { results: banks.filter((b) => b.user_id === args[0]) };
          }
          return { results: [] };
        },
        async first() {
          if (q.includes('FROM custom_banks WHERE id')) {
            return banks.find((b) => b.id === args[0] && b.user_id === args[1]) || null;
          }
          return null;
        },
      };
      return stmt;
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
  return db;
}

describe('standard bank registry', () => {
  it('has unique, stable ids and a logo-safe id format', () => {
    const ids = BANKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(getBankById('mellat').name).toBe('بانک ملت');
    expect(getBankById('nope')).toBeNull();
  });

  it('never gives two banks the same normalized name', () => {
    const seen = new Map();
    for (const bank of BANKS) {
      for (const label of [bank.name, bank.shortName, bank.enName, ...(bank.aliases || [])]) {
        const key = normalizeBankName(label);
        if (seen.has(key)) expect(seen.get(key)).toBe(bank.id);
        seen.set(key, bank.id);
      }
    }
  });

  it.each([
    ['بانک ملت', 'mellat'],
    ['بانك ملي ايران', 'melli'],
    ['ملی', 'melli'],
    ['اقتصادنوین', 'eghtesad-novin'],
    ['قرض الحسنه رسالت', 'resalat'],
    ['موسسه اعتباری ملل', 'melal'],
    ['بانک انصار', 'sepah'],
    ['Bank Mellat', 'mellat'],
    ['توسعه صادرات', 'tosee-saderat'],
    ['بانک صادرات', 'saderat'],
  ])('matches free-text "%s" to %s', (text, id) => {
    expect(matchBankIdByName(text)).toBe(id);
  });

  it('does not guess for unknown names', () => {
    expect(matchBankIdByName('صندوق خانوادگی')).toBeNull();
    expect(matchBankIdByName('')).toBeNull();
  });

  it('recognizes custom bank ids by prefix', () => {
    expect(isCustomBankId('cb_abc')).toBe(true);
    expect(isCustomBankId('mellat')).toBe(false);
  });
});

describe('custom banks repository', () => {
  let env;
  beforeEach(() => {
    env = { DB: createDb() };
  });

  it('creates, lists and dedupes by normalized name', async () => {
    const a = await dbCreateCustomBank(env, 'u1', '  صندوق   خانوادگی ');
    expect(a.id).toMatch(/^cb_[0-9a-f]{16}$/);
    expect(a.name).toBe('صندوق خانوادگی');
    const again = await dbCreateCustomBank(env, 'u1', 'صندوق خانوادگی');
    expect(again.id).toBe(a.id);
    expect(await dbListCustomBanks(env, 'u1')).toHaveLength(1);
    expect(await dbListCustomBanks(env, 'u2')).toHaveLength(0);
  });

  it('validates the name and the per-user limit', async () => {
    await expect(dbCreateCustomBank(env, 'u1', '   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(dbCreateCustomBank(env, 'u1', 'x'.repeat(61))).rejects.toMatchObject({ statusCode: 400 });
    for (let i = 0; i < MAX_CUSTOM_BANKS_PER_USER; i++) await dbCreateCustomBank(env, 'u1', `بانک ${i}`);
    await expect(dbCreateCustomBank(env, 'u1', 'یکی دیگر')).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deletes only the owner's bank and unlinks that user's loans", async () => {
    const bank = await dbCreateCustomBank(env, 'u1', 'صندوق');
    expect(await dbDeleteCustomBank(env, 'u2', bank.id)).toBe(false);
    expect(await dbDeleteCustomBank(env, 'u1', bank.id)).toBe(true);
    // Unlinking is always scoped to the requesting user's own loans
    const unlinks = env.DB.executed.filter((e) => e.q.startsWith("UPDATE loans SET bank_id = ''"));
    expect(unlinks.map((e) => e.args)).toEqual([[bank.id, 'u2'], [bank.id, 'u1']]);
  });
});

describe('resolveLoanBank', () => {
  let env;
  beforeEach(() => {
    env = { DB: createDb() };
  });

  it('takes the display name from a standard bank id', async () => {
    expect(await resolveLoanBank(env, 'u1', { bankId: 'mellat', lenderName: 'whatever' }))
      .toEqual({ bankId: 'mellat', lenderName: 'بانک ملت' });
  });

  it("resolves the user's own custom bank and rejects someone else's", async () => {
    const bank = await dbCreateCustomBank(env, 'u1', 'صندوق خانوادگی');
    expect(await resolveLoanBank(env, 'u1', { bankId: bank.id }))
      .toEqual({ bankId: bank.id, lenderName: 'صندوق خانوادگی' });
    await expect(resolveLoanBank(env, 'u2', { bankId: bank.id })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an unknown bank id', async () => {
    await expect(resolveLoanBank(env, 'u1', { bankId: 'not-a-bank' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('links a free-text lender name to a standard bank when it matches, else keeps the name', async () => {
    expect(await resolveLoanBank(env, 'u1', { lenderName: 'بانک مسکن' }))
      .toEqual({ bankId: 'maskan', lenderName: 'بانک مسکن' });
    expect(await resolveLoanBank(env, 'u1', { lenderName: 'پدرم' }))
      .toEqual({ bankId: '', lenderName: 'پدرم' });
    expect(await resolveLoanBank(env, 'u1', {})).toEqual({ bankId: '', lenderName: '' });
  });
});

describe('custom bank routes', () => {
  it.each([
    ['GET', '/api/banks/custom'],
    ['POST', '/api/banks/custom'],
    ['DELETE', '/api/banks/custom/cb_123'],
  ])('%s %s requires a signed-in user', async (method, path) => {
    const res = await worker.fetch(new Request(`https://api.realrate.ir${path}`, { method }), {}, {});
    expect(res.status).toBe(401);
  });
});
