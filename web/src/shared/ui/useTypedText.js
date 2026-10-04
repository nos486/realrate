/**
 * useTypedText.js — A text field's typing always reaches the form's state
 *
 * Some phone keyboards (a Persian keyboard in the Android app's WebView) write into a field in a
 * way React's change event doesn't report: the state stays empty while the field shows the text,
 * and the next render of the form (e.g. typing the amount) empties the field again. The field's
 * own `input`, `compositionend` and `blur` events still arrive, so they report the value too —
 * once: only a value not reported yet.
 *
 *   const typed = useTypedText(title, (e) => setTitle(e.target.value));
 *   <input value={title} {...typed} />
 *
 * @param {string} value - the field's controlled value
 * @param {(e: Event) => void} [onChange]
 * @param {{ onInput?: Function, onCompositionEnd?: Function, onBlur?: Function }} [handlers]
 *   the field's own handlers, still called
 * @returns {{ onChange?: Function, onInput: Function, onCompositionEnd: Function, onBlur: Function }}
 */

import { useRef } from 'react';

export function useTypedText(value, onChange, { onInput, onCompositionEnd, onBlur } = {}) {
  // The last value the field reported (or was given)
  const reported = useRef(value);
  if (value !== undefined && value !== null && String(value) !== String(reported.current ?? '')) reported.current = value;

  const report = (e) => {
    reported.current = e.target.value;
    onChange?.(e);
  };
  const reportIfNew = (e) => {
    if (onChange && e?.target && String(e.target.value) !== String(reported.current ?? '')) report(e);
  };
  const also = (own) => (e) => {
    own?.(e);
    reportIfNew(e);
  };

  return {
    onChange: onChange ? report : undefined,
    onInput: also(onInput),
    onCompositionEnd: also(onCompositionEnd),
    onBlur: also(onBlur),
  };
}
