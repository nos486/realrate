/**
 * useQuickAddParam.js — Open a page's "add" form when the page is reached with `?add=<what>`
 * (the Android app's "+" button, shared/app/AppShell.jsx)
 *
 * The parameter is taken out of the address right away (replacing the history entry), so going
 * back or reloading does not open the form again.
 */

import { useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * @param {string} what the value of `add` this page answers (e.g. 'expense')
 * @param {() => void} onOpen opens the form
 * @param {boolean} [ready=true] wait until the page can open it (data loaded, vault unlocked)
 */
export function useQuickAddParam(what, onOpen, ready = true) {
  const [params, setParams] = useSearchParams();
  const open = useEffectEvent(onOpen);
  const asked = params.get('add') === what;

  useEffect(() => {
    if (!asked || !ready) return;
    const next = new URLSearchParams(params);
    next.delete('add');
    setParams(next, { replace: true });
    open();
  }, [asked, ready, params, setParams]);
}
