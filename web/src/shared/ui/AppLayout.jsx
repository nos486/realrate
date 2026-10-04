import React from 'react';
import Header from '../../components/Header.jsx';
import Footer from '../../components/Footer.jsx';
import { DemoBanner } from '../../features/demo/index.js';
import OfflineBar from '../offline/OfflineBar.jsx';
import { useAppLayout } from '../app/appLayout.js';
import { AppTopBar, AppBottomNav } from '../app/AppShell.jsx';
import AppUpdatePrompt, { AppUpdateBanner } from '../app/AppUpdatePrompt.jsx';
import AppSuggestBanner from '../app/AppSuggestBanner.jsx';
import AppSetupPrompt from '../app/AppSetupPrompt.jsx';

/**
 * Standard AppLayout component
 *
 * Ensures Header and Footer are rendered consistently across all pages:
 * - MainPage (Market & Portfolio)
 * - SharedPortfolioPage
 * (The admin area, pages/AdminApp.jsx, has its own shell.)
 *
 * Prevents repeating <div className="app-layout">, <Header />, and <Footer />
 * inside every single view and conditional return branch.
 *
 * In the Android app and on a phone-sized screen (shared/app/appLayout.js), a page with sections
 * (`navItems`) gets the app's own frame instead (shared/app/AppShell.jsx): a top app bar and a
 * bottom navigation bar, no footer — one design for the mobile website and the app. Inside the
 * app it also has the update prompt (shared/app/AppUpdatePrompt.jsx; nothing on the website).
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
  const appLayout = useAppLayout();
  if (appLayout && navItems?.length && !hideHeader) {
    return (
      <div className={`app-layout has-app-shell ${layoutClassName}`}>
        {/* One sticky block: the offline bar sits above the app bar instead of under it */}
        <div className="app-top">
          <OfflineBar />
          <AppTopBar activeTab={activeTab} navItems={navItems} />
        </div>
        <DemoBanner />
        {/* On an Android phone's browser: the app is easier and faster */}
        <AppSuggestBanner />
        <AppUpdateBanner />
        <main className={`main-content ${className}`}>
          {/* Each section fades in, like switching screens in an app */}
          <div key={activeTab} className="app-page">{children}</div>
        </main>
        <AppBottomNav activeTab={activeTab} navItems={navItems} onSelect={setActiveTab} />
        {/* «نسخه‌ی جدید»: checks for a newer APK and installs it (shared/native/appUpdate.js) */}
        <AppUpdatePrompt />
        {/* Right after installing: turn on bank SMS and the fingerprint (Android app only) */}
        <AppSetupPrompt />
      </div>
    );
  }

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <OfflineBar />
      <DemoBanner />
      {/* On an Android phone's browser: the app is easier and faster */}
      <AppSuggestBanner />
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
