/**
 * useQuickAddParam.js — Open a page's "add" form when the page is reached with `?add=<what>`
 * (the Android app's "+" button, shared/app/AppShell.jsx; a bank SMS turned into a loan)
 *
 * The parameter — and the `fields` that prefill the form — are taken out of the address right away
 * (replacing the history entry), so going back or reloading does not open the form again.
 */

import { useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * @param {string} what the value of `add` this page answers (e.g. 'expense')
 * @param {(values: Record<string, string>) => void} onOpen opens the form, with the `fields` given
 * @param {boolean} [ready=true] wait until the page can open it (data loaded, vault unlocked)
 * @param {string[]} [fields] other parameters that prefill the form (missing ones read '')
 */
export function useQuickAddParam(what, onOpen, ready = true, fields = []) {
  const [params, setParams] = useSearchParams();
  const open = useEffectEvent(onOpen);
  const asked = params.get('add') === what;
  const fieldList = fields.join(',');

  useEffect(() => {
    if (!asked || !ready) return;
    const keys = fieldList ? fieldList.split(',') : [];
    const values = Object.fromEntries(keys.map((k) => [k, params.get(k) || '']));
    const next = new URLSearchParams(params);
    next.delete('add');
    keys.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
    open(values);
  }, [asked, ready, params, setParams, fieldList]);
}
