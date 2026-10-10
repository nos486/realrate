/**
 * SubscriptionsContext.jsx — One shared subscriptions list for the subscriptions page and the
 * renewal reminders (shared/alerts/AppAlertSources.jsx)
 */

import React, { createContext, useContext } from 'react';
import { useSubscriptions } from '../hooks/useSubscriptions.js';

const SubscriptionsContext = createContext(null);
// One empty list, so a memo over it outside the provider stays put
const NONE = [];

export function SubscriptionsProvider({ children }) {
  const state = useSubscriptions();
  return <SubscriptionsContext.Provider value={state}>{children}</SubscriptionsContext.Provider>;
}

export function useSubscriptionsContext() {
  const context = useContext(SubscriptionsContext);
  if (!context) throw new Error('useSubscriptionsContext must be used within a SubscriptionsProvider');
  return context;
}

/** The shared list, or an empty one outside the provider (screens rendered alone, tests) */
export function useOptionalSubscriptions() {
  return useContext(SubscriptionsContext)?.subscriptions || NONE;
}

/** The whole subscriptions state (list and saving), or null outside the provider */
export function useOptionalSubscriptionsContext() {
  return useContext(SubscriptionsContext);
}
