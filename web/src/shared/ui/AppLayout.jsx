import React from 'react';
import Header from '../../components/Header.jsx';
import Footer from '../../components/Footer.jsx';
import { DemoBanner } from '../../features/demo/index.js';
import OfflineBar from '../offline/OfflineBar.jsx';
import { isNativeApp } from '../native/nativeApp.js';
import { AppTopBar, AppBottomNav } from '../app/AppShell.jsx';

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
 *
 * Inside the Android app, a page with sections (`navItems`) gets the app's own frame instead
 * (shared/app/AppShell.jsx): a top app bar and a bottom navigation bar, no footer.
 */
export default function AppLayout({
  children,
  activeTab = null,
  setActiveTab = null,
  navItems = null,
  usdToman = undefined,
  gold18kPrice = undefined,
  className = '',
  layoutClassName = '',
  hideHeader = false,
  hideFooter = false,
}) {
  if (isNativeApp() && navItems?.length && !hideHeader) {
    return (
      <div className={`app-layout has-app-shell ${layoutClassName}`}>
        {/* One sticky block: the offline bar sits above the app bar instead of under it */}
        <div className="app-top">
          <OfflineBar />
          <AppTopBar activeTab={activeTab} navItems={navItems} />
        </div>
        <DemoBanner />
        <main className={`main-content ${className}`}>
          {/* Each section fades in, like switching screens in an app */}
          <div key={activeTab} className="app-page">{children}</div>
        </main>
        <AppBottomNav activeTab={activeTab} navItems={navItems} onSelect={setActiveTab} />
      </div>
    );
  }

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <OfflineBar />
      <DemoBanner />
      {!hideHeader && (
        <Header
          usdToman={usdToman}
          gold18kPrice={gold18kPrice}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          navItems={navItems}
        />
      )}

      <main className={`main-content ${className}`}>
        {children}
      </main>

      {!hideFooter && <Footer />}
    </div>
  );
}
