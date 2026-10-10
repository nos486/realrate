/**
 * TabLoadingGate.jsx — While a tab just opened is still waiting on the server, a loader in the
 * middle of the screen (BlockingOverlay) takes every tap: on a slow or dropped connection no
 * other tab can be opened and nothing sent again until what the tab asked for has come back
 *
 * A tab loads its own data when it opens (pageRefresh.js); what it is waiting for is the requests
 * in flight (httpClient.js subscribeRequests). After a tab change the gate looks again after
 * SHOW_DELAY_MS — on a quick connection the data is in by then and nothing shows — and, while
 * requests are still on their way, blocks until none is left. A request that can't reach the
 * server fails at once (and the tab shows its error), which lets the gate go; a read with no
 * answer gives up after httpClient's READ_TIMEOUT_MS, so the app is never stuck behind it.
 * The Android app's offline copy reads from the device: no request, nothing shown.
 */

import React, { useEffect, useRef, useState } from 'react';
import { subscribeRequests } from '../api/httpClient.js';
import BlockingOverlay from '../ui/BlockingOverlay.jsx';

/** A tab's data loading quicker than this shows no loader */
export const SHOW_DELAY_MS = 300;

/**
 * @param {{ tab: string }} props — the open tab (MainPage's): each change arms the gate
 */
export default function TabLoadingGate({ tab }) {
  const [state, setState] = useState({ tab: null, blocking: false });
  const lastTab = useRef(tab);

  useEffect(() => {
    if (lastTab.current === tab) return undefined;
    lastTab.current = tab;
    let busy = false;
    let shown = false;
    let showTimer = null;
    let unsubscribe = () => {};
    const release = () => {
      window.clearTimeout(showTimer);
      unsubscribe();
      if (shown) setState({ tab, blocking: false });
      shown = false;
    };
    unsubscribe = subscribeRequests((count) => {
      busy = count > 0;
      if (!busy && shown) release();
    });
    showTimer = window.setTimeout(() => {
      if (!busy) {
        release();
        return;
      }
      shown = true;
      setState({ tab, blocking: true });
    }, SHOW_DELAY_MS);
    return release;
  }, [tab]);

  // Only the open tab's gate (a tab changed under it, e.g. by the back button, drops it)
  if (!state.blocking || state.tab !== tab) return null;
  return (
    <BlockingOverlay
      title="در حال باز کردن صفحه"
      subtitle="اطلاعات این صفحه در حال دریافت است..."
    />
  );
}
