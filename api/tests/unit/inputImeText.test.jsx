// @vitest-environment happy-dom
/**
 * inputImeText.test.jsx — Text from a phone keyboard always reaches the form's state
 *
 * A Persian keyboard in the Android app's WebView can write into a field without React's change
 * event reporting it: the state stays empty while the field shows the text, and the next render of
 * the form (e.g. typing the amount) empties the title. The shared Input also reports the field's
 * own input / compositionend / blur events, once per value.
 */

import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { Input } from '../../../web/src/shared/ui/Input.jsx';

afterEach(cleanup);

function Form({ onTitle = () => {} }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <form>
      <Input id="title" value={title} onChange={(e) => { onTitle(e.target.value); setTitle(e.target.value); }} />
      <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <output id="state">{title}</output>
    </form>
  );
}

/**
 * Write like such a keyboard: the value is set through the field (so React's change tracking
 * already knows it and its change event stays silent), then the field's own event fires
 */
function keyboardWrites(field, text, eventName) {
  act(() => {
    field.value = text;
    field.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
}

describe('Input: text from a phone keyboard', () => {
  it.each(['input', 'compositionend', 'focusout'])('reaches the state on the field\'s own %s event', (eventName) => {
    const { container } = render(<Form />);
    const title = container.querySelector('#title');
    keyboardWrites(title, 'نان و شیر', eventName);
    expect(container.querySelector('#state').textContent).toBe('نان و شیر');

    // Typing the amount renders the form again: the title stays
    fireEvent.change(container.querySelector('#amount'), { target: { value: '120000' } });
    expect(title.value).toBe('نان و شیر');
    expect(container.querySelector('#state').textContent).toBe('نان و شیر');
  });

  it('reports each value once, however many events carry it', () => {
    const onTitle = vi.fn();
    const { container } = render(<Form onTitle={onTitle} />);
    const title = container.querySelector('#title');
    fireEvent.change(title, { target: { value: 'کتاب' } });
    fireEvent.input(title);
    fireEvent.compositionEnd(title);
    fireEvent.blur(title);
    expect(onTitle).toHaveBeenCalledTimes(1);
    expect(onTitle).toHaveBeenCalledWith('کتاب');
  });

  it('keeps the caller\'s own input, compositionend and blur handlers', () => {
    const onInput = vi.fn();
    const onBlur = vi.fn();
    const onCompositionEnd = vi.fn();
    const { container } = render(<Input value="" onChange={() => {}} onInput={onInput} onBlur={onBlur} onCompositionEnd={onCompositionEnd} />);
    const field = container.querySelector('input');
    fireEvent.input(field);
    fireEvent.compositionEnd(field);
    fireEvent.blur(field);
    expect([onInput, onCompositionEnd, onBlur].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});
