/**
 * TextField.jsx — A plain text `<input>` (or `<textarea>`) whose typing always reaches the form's
 * state, whatever the phone keyboard (useTypedText.js). A drop-in for a bare text input: same
 * props, same element.
 */

import React, { forwardRef } from 'react';
import { useTypedText } from './useTypedText.js';

const TextField = forwardRef(function TextField({ as = 'input', value, onChange, onInput, onCompositionEnd, onBlur, ...props }, ref) {
  const typed = useTypedText(value, onChange, { onInput, onCompositionEnd, onBlur });
  const Component = as === 'textarea' ? 'textarea' : 'input';
  return <Component ref={ref} value={value} {...props} {...typed} />;
});

export default TextField;
