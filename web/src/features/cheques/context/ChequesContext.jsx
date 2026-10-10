/**
 * ChequesContext.jsx — One shared cheques list for the cheques page and the home reminders
 */

import React, { createContext, useContext } from 'react';
import { useCheques } from '../hooks/useCheques.js';

const ChequesContext = createContext(null);

export function ChequesProvider({ children }) {
  const chequesState = useCheques();
  return (
    <ChequesContext.Provider value={chequesState}>
      {children}
    </ChequesContext.Provider>
  );
}

export function useChequesContext() {
  const context = useContext(ChequesContext);
  if (!context) {
    throw new Error('useChequesContext must be used within a ChequesProvider');
  }
  return context;
}

// One empty list, so a memo over it outside the provider stays put
const NONE = [];

/** The cheques, or none outside a ChequesProvider (forms that only offer them as a choice) */
export function useOptionalCheques() {
  return useContext(ChequesContext)?.cheques || NONE;
}
