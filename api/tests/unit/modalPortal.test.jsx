// @vitest-environment happy-dom
/**
 * modalPortal.test.js — A modal renders at the end of <body>, outside whatever opened it: a
 * modal opened from another modal's form is not inside that form, and submitting it does not
 * submit the form below (Android: categories edited from the expense form were lost)
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import Modal from '../../../web/src/shared/ui/Modal.jsx';

afterEach(cleanup);

function Nested({ onOuter, onInner }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ transform: 'translateY(0)' }} data-testid="page">
      <Modal isOpen title="بیرونی" onClose={() => {}} onSubmit={(e) => { e.preventDefault(); onOuter(); }}>
        <button type="button" onClick={() => setOpen(true)}>باز کردن</button>
        {open && (
          <Modal isOpen title="درونی" onClose={() => setOpen(false)} onSubmit={(e) => { e.preventDefault(); onInner(); }}>
            <input aria-label="نام" />
            <button type="submit">ذخیره‌ی درونی</button>
          </Modal>
        )}
      </Modal>
    </div>
  );
}

describe('modal portal', () => {
  it('renders in <body>, not inside the page or the modal that opened it', () => {
    const onOuter = vi.fn();
    const onInner = vi.fn();
    render(<Nested onOuter={onOuter} onInner={onInner} />);
    expect(screen.getByTestId('page').querySelector('.modal-backdrop')).toBeNull();
    fireEvent.click(screen.getByText('باز کردن'));
    const dialogs = document.body.querySelectorAll(':scope > .modal-backdrop');
    expect(dialogs).toHaveLength(2);
    const input = screen.getByLabelText('نام');
    expect(input.closest('form')).toBe(dialogs[1].querySelector('form'));
    fireEvent.submit(input.closest('form'));
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onOuter).not.toHaveBeenCalled();
  });
});
