// @vitest-environment happy-dom
/**
 * categoryManager.test.jsx — «دسته‌ها»: add, rename, hide and remove categories, saved together
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const vault = vi.hoisted(() => ({ put: vi.fn(), status: 'unlocked' }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({ listVaultRecords: vi.fn(async () => ({ records: [] })) }));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({ putRecord: (...args) => vault.put(...args) }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (plain) => JSON.stringify(plain)),
  decryptVaultRecord: vi.fn(async (payload) => JSON.parse(payload)),
}));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: vault.status, epoch: 1 }) }));

const { default: CategoryManagerModal } = await import('../../../web/src/shared/categories/CategoryManagerModal.jsx');
const store = await import('../../../web/src/shared/categories/categoryStore.js');

beforeEach(() => {
  vault.put.mockReset();
  vault.status = 'unlocked';
  store.resetCategories();
});
afterEach(cleanup);

describe('CategoryManagerModal', () => {
  it('adds a category, hides a built-in one, and saves the list', async () => {
    const onClose = vi.fn();
    render(<CategoryManagerModal kind="expense" onClose={onClose} />);
    fireEvent.click(screen.getByText('دسته‌ی جدید'));
    fireEvent.change(screen.getByLabelText('نام دسته'), { target: { value: 'حیوان خانگی' } });
    fireEvent.click(screen.getByLabelText('PawPrint'));
    fireEvent.click(screen.getByText('تأیید'));
    // Hide «آموزش»
    const row = screen.getByText('آموزش').closest('li');
    fireEvent.click(row.querySelector('[title="پنهان از فهرست انتخاب"]'));
    fireEvent.click(screen.getByText('ذخیره'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = JSON.parse(vault.put.mock.calls[0][2]).expense;
    const added = saved.find((c) => c.label === 'حیوان خانگی');
    expect(added).toMatchObject({ icon: 'PawPrint', hidden: false });
    expect(added.value).toMatch(/^c_/);
    expect(saved.findIndex((c) => c.value === added.value)).toBeLessThan(saved.findIndex((c) => c.value === 'other'));
    expect(saved.find((c) => c.value === 'education').hidden).toBe(true);
    expect(store.listCategories('expense').some((c) => c.value === 'education')).toBe(false);
  });

  it('needs the vault open to save', () => {
    vault.status = 'locked';
    render(<CategoryManagerModal kind="income" onClose={() => {}} />);
    expect(screen.getByText(/ابتدا اطلاعات رمزنگاری‌شده را باز کنید/)).toBeTruthy();
    expect(screen.getByText('ذخیره').closest('button').disabled).toBe(true);
  });
});
