// @vitest-environment happy-dom
/**
 * userSettingsModalDelete.test.jsx — the portfolio settings «حذف» button hands over the portfolio id
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'locked' }) }));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({ updatePortfolio: vi.fn() }));

import UserSettingsModal from '../../../web/src/components/UserSettingsModal.jsx';

afterEach(cleanup);

describe('UserSettingsModal delete', () => {
  it('calls onDelete with the portfolio id, not the click event', () => {
    const onDelete = vi.fn();
    render(
      <UserSettingsModal isOpen portfolio={{ id: 'pf_1', name: 'الف' }} onClose={() => {}} onSaved={() => {}} canDelete onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByTitle('حذف «الف»'));
    expect(onDelete).toHaveBeenCalledWith('pf_1');
  });
});
