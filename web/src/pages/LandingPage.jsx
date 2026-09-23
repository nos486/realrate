import React from 'react';
import {
  LandingNavbar,
  LandingHero,
  LandingLiveTicker,
  LandingTrustMetrics,
  LandingBubbleExplainer,
  LandingBentoFeatures,
  LandingHowItWorks,
  LandingSecurityVault,
  LandingPhoneShowcase,
  LandingFaqAccordion,
  LandingFinalCta,
  LandingFooter,
} from '../features/landing/index.js';

export default function LandingPage() {
  return (
    <div className="landing-root-wrapper" dir="rtl">
      {/* Sticky Glass Navigation Bar */}
      <LandingNavbar />

      <main className="landing-main-content">
        {/* 1. Hero Section with 3D-tilt glass dashboard & animated counter */}
        <LandingHero />

        {/* 2. Marquee Live Ticker */}
        <LandingLiveTicker />

        {/* 3. Trust Metrics / Key Stats Strip */}
        <LandingTrustMetrics />

        {/* 4. Interactive Bubble Explainer & Simulator */}
        <LandingBubbleExplainer />

        {/* 5. Bento Grid Features with Cursor-Follow Glow */}
        <LandingBentoFeatures />

        {/* 6. How It Works Timeline */}
        <LandingHowItWorks />

        {/* 7. Zero-Knowledge Security Vault Showcase */}
        <LandingSecurityVault />

        {/* 8. Phone Showcase (Shared Portfolio & Privacy Mode) */}
        <LandingPhoneShowcase />

        {/* 9. FAQ Accordion */}
        <LandingFaqAccordion />

        {/* 10. Final Call to Action */}
        <LandingFinalCta />
      </main>

      {/* 11. Footer */}
      <LandingFooter />
    </div>
  );
}
