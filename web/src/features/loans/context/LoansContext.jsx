/**
 * LoansContext.jsx — Unified Loans React Context Provider
 * Feature: features/loans
 * Provides a single shared instance of useLoans across the entire application,
 * ensuring all components (LoansPage, UpcomingInstallmentsAlert, etc.) stay synchronized.
 */

import React, { createContext, useContext } from 'react';
import { useLoans } from '../hooks/useLoans.js';

const LoansContext = createContext(null);

export function LoansProvider({ children }) {
  const loansState = useLoans();

  return (
    <LoansContext.Provider value={loansState}>
      {children}
    </LoansContext.Provider>
  );
}

export function useLoansContext() {
  const context = useContext(LoansContext);
  if (!context) {
    throw new Error('useLoansContext must be used within a LoansProvider');
  }
  return context;
}
