import React from 'react';
import Header from '../Header.jsx';
import Footer from '../Footer.jsx';

/**
 * Standard AppLayout component
 *
 * Ensures Header and Footer are rendered consistently across all pages:
 * - MainPage (Market & Portfolio)
 * - AdminPage (Dashboard & Users)
 * - PriceSourcesPage (Source Management & History Charts)
 * - SharedPortfolioPage
 *
 * Prevents repeating <div className="app-layout">, <Header />, and <Footer />
 * inside every single view and conditional return branch.
 */
export default function AppLayout({
  children,
  activeTab = null,
  setActiveTab = null,
  usdToman = undefined,
  gold18kPrice = undefined,
  className = '',
  layoutClassName = '',
  hideHeader = false,
  hideFooter = false,
}) {
  return (
    <div className={`app-layout ${layoutClassName}`}>
      {!hideHeader && (
        <Header
          usdToman={usdToman}
          gold18kPrice={gold18kPrice}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      )}

      <main className={`main-content ${className}`}>
        {children}
      </main>

      {!hideFooter && <Footer />}
    </div>
  );
}
