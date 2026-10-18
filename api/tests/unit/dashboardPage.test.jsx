// @vitest-environment happy-dom
/**
 * dashboardPage.test.jsx — The home page end to end (widgets stubbed): the default widgets show,
 * «شخصی‌سازی» opens edit mode, an added widget is saved as the encrypted dashboard record, a
 * removed one goes, and a locked vault offers no editing
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const vault = { status: 'unlocked', epoch: 0 };
const putRecord = vi.fn(async () => ({ success: true }));
const listVaultRecords = vi.fn(async () => ({ records: [] }));

vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => vault }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: (...a) => listVaultRecords(...a),
  deleteVaultRecord: vi.fn(async () => ({})),
}));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({ putRecord: (...a) => putRecord(...a) }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: async (v) => `enc:${JSON.stringify(v)}`,
  decryptVaultRecord: async (p) => JSON.parse(String(p).slice(4)),
}));
vi.mock('../../../web/src/shared/vault/VaultUnlockCard.jsx', () => ({ default: () => <p>unlock</p> }));
vi.mock('../../../web/src/shared/app/appLayout.js', () => ({ useAppLayout: () => false }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: async () => true }) }));
vi.mock('../../../web/src/features/dashboard/widgetRegistry.jsx', async () => {
  const { WIDGET_TYPES } = await import('../../src/domain/dashboardLayout.js');
  const View = ({ widget }) => <p>widget:{widget.type}</p>;
  return {
    WIDGET_VIEWS: Object.fromEntries(WIDGET_TYPES.map((type) => [type, { Icon: () => <i />, Component: View }])),
    useWidgetAccess: () => (type) => type !== 'market' && type !== 'sms',
  };
});

import Dashboard from '../../../web/src/features/dashboard/Dashboard.jsx';
import { DEFAULT_DASHBOARD } from '../../src/domain/dashboardLayout.js';

beforeEach(() => {
  vault.status = 'unlocked';
  localStorage.clear();
  putRecord.mockClear();
  listVaultRecords.mockClear();
});
afterEach(cleanup);

const open = vi.fn();
const shownTypes = () => screen.queryAllByText(/^widget:/).map((el) => el.textContent.replace('widget:', ''));

describe('the home page', () => {
  it('shows the default widgets the user can see', () => {
    render(<Dashboard onOpen={open} />);
    const expected = DEFAULT_DASHBOARD.desktop.map((w) => w.type);
    // The page is columns of stacked widgets, so the order in the page is column by column
    expect([...shownTypes()].sort()).toEqual([...expected].sort());
    expect(document.querySelectorAll('.dash-col').length).toBeGreaterThan(1);
  });

  it('saves an added widget as an encrypted record and shows it', async () => {
    render(<Dashboard onOpen={open} />);
    fireEvent.click(screen.getByRole('button', { name: /شخصی‌سازی/ }));
    fireEvent.click(screen.getByRole('button', { name: /افزودن ویجت/ }));
    fireEvent.click(screen.getByText('میان‌بُرها').closest('button'));
    expect(shownTypes()).toContain('shortcuts');
    await waitFor(() => expect(putRecord).toHaveBeenCalled(), { timeout: 3000 });
    const [kind, id, payload, plain] = putRecord.mock.calls.at(-1);
    expect(kind).toBe('dashboard_layout');
    expect(id).toBe('main');
    expect(payload.startsWith('enc:')).toBe(true);
    // The test window is mid-size (2 columns), so the edit lands in the 2-column list only
    expect(plain.tablet.map((w) => w.type)).toContain('shortcuts');
    expect(plain.mobile).toBeNull();
    expect(plain.desktop).toBeNull();
    expect(JSON.parse(localStorage.getItem('realrate_dashboard_u1')).tablet).toHaveLength(plain.tablet.length);
  });

  it('removes a widget after asking', async () => {
    render(<Dashboard onOpen={open} />);
    fireEvent.click(screen.getByRole('button', { name: /شخصی‌سازی/ }));
    const before = shownTypes();
    fireEvent.click(screen.getAllByRole('button', { name: /^حذف/ })[0]);
    await waitFor(() => expect(shownTypes()).toHaveLength(before.length - 1));
  });

  it('does not offer editing while the vault is locked, and shows the unlock card', () => {
    vault.status = 'locked';
    render(<Dashboard onOpen={open} />);
    expect(screen.queryByRole('button', { name: /شخصی‌سازی/ })).toBeNull();
    expect(screen.getByText('unlock')).toBeTruthy();
    expect(shownTypes().length).toBeGreaterThan(0);
  });

  it('opens with the arrangement kept in this browser', () => {
    localStorage.setItem('realrate_dashboard_u1', JSON.stringify({ version: 1, desktop: [{ id: 'w_1', type: 'news', size: 2, config: { count: 5 } }], mobile: null }));
    render(<Dashboard onOpen={open} />);
    expect(shownTypes()).toEqual(['news']);
  });
});
