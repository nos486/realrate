import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbCreateTransaction,
  dbGetTransactionsByPortfolio,
  dbGetTransactionById,
  dbUpdateTransaction,
  dbDeleteTransaction,
} from '../../src/repositories/transactionRepository.js';

// In-memory mock D1 database helper
function createMockD1() {
  const store = new Map();

  return {
    prepare(query) {
      const q = query.trim();
      let boundArgs = [];

      const stmt = {
        bind(...args) {
          boundArgs = args;
          return stmt;
        },
        async run() {
          if (q.startsWith('CREATE') || q.startsWith('DROP') || q.startsWith('ALTER')) {
            return { success: true };
          }
          if (q.startsWith('INSERT INTO transactions')) {
            const [id, userId, portfolioId, encryptedPayload, createdAt, updatedAt] = boundArgs;
            store.set(id, { id, userId, portfolioId, encryptedPayload, createdAt, updatedAt });
            return { meta: { changes: 1 } };
          }
          if (q.startsWith('UPDATE transactions')) {
            const [encryptedPayload, updatedAt, id, userId] = boundArgs;
            const existing = store.get(id);
            if (existing && existing.userId === userId) {
              store.set(id, { ...existing, encryptedPayload, updatedAt });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (q.startsWith('DELETE FROM transactions')) {
            const [id, userId] = boundArgs;
            const existing = store.get(id);
            if (existing && existing.userId === userId) {
              store.delete(id);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (q.includes('FROM transactions') && q.includes('WHERE id = ? AND user_id = ?')) {
            const [id, userId] = boundArgs;
            const item = store.get(id);
            if (item && item.userId === userId) return item;
            return null;
          }
          return null;
        },
        async all() {
          if (q.includes('FROM transactions') && q.includes('WHERE user_id = ? AND portfolio_id = ?')) {
            const [userId, portfolioId] = boundArgs;
            const results = [];
            for (const item of store.values()) {
              if (item.userId === userId && item.portfolioId === portfolioId) {
                results.push(item);
              }
            }
            return { results };
          }
          return { results: [] };
        }
      };

      return stmt;
    }
  };
}

describe('Transaction Repository D1 Operations', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = { DB: createMockD1() };
  });

  it('creates and retrieves transactions for a user portfolio', async () => {
    const created = await dbCreateTransaction(mockEnv, {
      userId: 'usr_1',
      portfolioId: 'p_1',
      encryptedPayload: 'enc:e2ee:v1:test_payload_123',
    });

    expect(created).toBeDefined();
    expect(created.id).toMatch(/^tx_/);
    expect(created.userId).toBe('usr_1');
    expect(created.portfolioId).toBe('p_1');
    expect(created.encryptedPayload).toBe('enc:e2ee:v1:test_payload_123');

    // Retrieve by portfolio
    const list = await dbGetTransactionsByPortfolio(mockEnv, 'usr_1', 'p_1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
    expect(list[0].encryptedPayload).toBe('enc:e2ee:v1:test_payload_123');

    // Retrieve by single ID
    const single = await dbGetTransactionById(mockEnv, created.id, 'usr_1');
    expect(single).toBeDefined();
    expect(single.id).toBe(created.id);
  });

  it('isolates transactions between different users and portfolios', async () => {
    await dbCreateTransaction(mockEnv, {
      userId: 'usr_1',
      portfolioId: 'p_1',
      encryptedPayload: 'payload_u1_p1',
    });
    await dbCreateTransaction(mockEnv, {
      userId: 'usr_2',
      portfolioId: 'p_1',
      encryptedPayload: 'payload_u2_p1',
    });
    await dbCreateTransaction(mockEnv, {
      userId: 'usr_1',
      portfolioId: 'p_2',
      encryptedPayload: 'payload_u1_p2',
    });

    const u1p1 = await dbGetTransactionsByPortfolio(mockEnv, 'usr_1', 'p_1');
    expect(u1p1).toHaveLength(1);
    expect(u1p1[0].encryptedPayload).toBe('payload_u1_p1');

    const u2p1 = await dbGetTransactionsByPortfolio(mockEnv, 'usr_2', 'p_1');
    expect(u2p1).toHaveLength(1);
    expect(u2p1[0].encryptedPayload).toBe('payload_u2_p1');

    // User 1 cannot access User 2's transaction by ID
    const crossAccess = await dbGetTransactionById(mockEnv, u2p1[0].id, 'usr_1');
    expect(crossAccess).toBeNull();
  });

  it('updates an existing transaction encrypted payload', async () => {
    const tx = await dbCreateTransaction(mockEnv, {
      userId: 'usr_1',
      portfolioId: 'p_1',
      encryptedPayload: 'original_payload',
    });

    const updated = await dbUpdateTransaction(mockEnv, {
      id: tx.id,
      userId: 'usr_1',
      portfolioId: 'p_1',
      encryptedPayload: 'updated_payload',
    });

    expect(updated).toBeDefined();
    expect(updated.encryptedPayload).toBe('updated_payload');

    const fetched = await dbGetTransactionById(mockEnv, tx.id, 'usr_1');
    expect(fetched.encryptedPayload).toBe('updated_payload');
  });

  it('deletes a transaction successfully', async () => {
    const tx = await dbCreateTransaction(mockEnv, {
      userId: 'usr_1',
      portfolioId: 'p_1',
      encryptedPayload: 'payload_to_delete',
    });

    const deleted = await dbDeleteTransaction(mockEnv, tx.id, 'usr_1');
    expect(deleted).toBe(true);

    const fetched = await dbGetTransactionById(mockEnv, tx.id, 'usr_1');
    expect(fetched).toBeNull();

    const list = await dbGetTransactionsByPortfolio(mockEnv, 'usr_1', 'p_1');
    expect(list).toHaveLength(0);
  });
});
