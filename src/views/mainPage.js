/**
 * mainPage.js — User-facing web application HTML (main site)
 * Contains all HTML/CSS/JS for the main RealRate interface
 */

import { REALRATE_SVG_LOGO, REALRATE_FAVICON_DATA_URI } from "./assets.js";

function getHTMLContent(env, analytics, globalSettings) {
  const defaultGoldUsd = globalSettings.default_gold_usd || "2450";
  const googleClientId = (env && env.GOOGLE_CLIENT_ID) ? env.GOOGLE_CLIENT_ID.trim() : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>RealRate</title>
  <meta name="description" content="محاسبه قیمت واقعی طلا، سکه و ارزهای مطرح جهان بر اساس دلار و انس جهانی">
  
  <!-- PWA & Mobile Icons / Meta -->
  <link rel="icon" type="image/svg+xml" href="${REALRATE_FAVICON_DATA_URI}">
  <link rel="manifest" href="/manifest.json">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="RealRate">
  <meta name="theme-color" content="#0a0d14">
  <link rel="apple-touch-icon" href="${REALRATE_FAVICON_DATA_URI}">

  <!-- Google Identity Services -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-primary: #0a0d14;
      --bg-glass: rgba(18, 24, 36, 0.75);
      --bg-card: rgba(26, 34, 52, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(245, 158, 11, 0.35);
      
      --gold-primary: #f59e0b;
      --gold-light: #fbbf24;
      --gold-gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --info-blue: #3b82f6;

      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-xl: 18px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Vazirmatn', sans-serif;
    }

    body {
      background-color: var(--bg-primary);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(245, 158, 11, 0.06) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.04) 0%, transparent 40%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .container {
      width: 100%;
      max-width: 980px;
      margin: 0 auto;
    }

    header {
      position: relative;
      z-index: 50;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding: 12px 18px;
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      flex-wrap: wrap;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-logo-svg {
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.4));
    }

    .brand-title h1 {
      font-size: 18px;
      font-weight: 800;
      background: linear-gradient(135deg, #fff 0%, #fde047 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-title p {
      font-size: 11px;
      color: var(--text-muted);
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Analytics Badges */
    .analytics-badges {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .badge-item {
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 11px;
      color: var(--text-main);
    }

    .badge-item.online {
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--success);
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 6px var(--success);
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    /* Google Auth & User Profile Widget */
    .user-auth-section {
      display: flex;
      align-items: center;
      position: relative;
    }

    .google-btn-custom {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      border-radius: 18px;
      padding: 4px 10px;
      color: var(--text-main);
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .google-btn-custom:hover {
      background: rgba(255, 255, 255, 0.14);
      border-color: rgba(245, 158, 11, 0.5);
      transform: translateY(-1px);
    }

    .user-profile-widget {
      position: relative;
      display: flex;
      align-items: center;
      z-index: 60;
    }

    .user-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 4px 9px 4px 6px;
      color: var(--text-main);
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s ease;
      user-select: none;
    }

    .user-pill-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(245, 158, 11, 0.4);
    }

    .user-pill-btn.active {
      background: rgba(255, 255, 255, 0.14);
      border-color: var(--gold-primary);
    }

    .dropdown-arrow {
      transition: transform 0.2s ease;
      opacity: 0.75;
    }

    .user-pill-btn.active .dropdown-arrow {
      transform: rotate(180deg);
    }

    .user-avatar-img {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid var(--gold-light);
      background: #1f2937;
    }

    .user-name-span {
      font-weight: 700;
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: ltr;
      unicode-bidi: plaintext;
      display: inline-block;
      vertical-align: middle;
    }

    @media (max-width: 640px) {
      .user-name-span {
        max-width: 85px;
      }
    }

    .user-role-badge {
      font-size: 9px;
      padding: 1px 6px;
      border-radius: 8px;
      font-weight: 700;
      white-space: nowrap;
    }

    .user-role-badge.admin {
      background: var(--gold-gradient);
      color: #000;
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
    }

    .user-role-badge.user {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-muted);
    }

    .user-dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      min-width: 220px;
      background: #111827;
      background: rgba(18, 24, 38, 0.98);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 14px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08);
      padding: 8px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .user-dropdown-header {
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
    }

    .user-dropdown-divider {
      height: 1px;
      background: var(--border-color);
      margin: 3px 0;
    }

    .user-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-main);
      text-decoration: none;
      background: transparent;
      border: none;
      cursor: pointer;
      width: 100%;
      text-align: right;
      transition: background 0.15s;
    }

    .user-dropdown-item:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .user-dropdown-item.admin-link {
      color: var(--gold-light);
    }

    .user-dropdown-item.logout {
      color: #f87171;
    }

    .user-dropdown-item.logout:hover {
      background: rgba(239, 68, 68, 0.15);
    }

    /* Quick 4-Currencies Row Bar */
    .quick-currencies-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 10px 14px;
    }

    @media (max-width: 640px) {
      .quick-currencies-bar {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        padding: 8px 10px;
      }
    }

    .quick-curr-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(10, 13, 20, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-md);
      padding: 8px 12px;
      gap: 6px;
    }

    .quick-curr-flag {
      font-size: 18px;
    }

    .quick-curr-name {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
    }

    .quick-curr-price {
      font-size: 13px;
      font-weight: 800;
      color: var(--gold-light);
      white-space: nowrap;
    }

    /* System Announcement Banner */
    .system-announcement {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(18, 24, 36, 0.8) 100%);
      border: 1px solid var(--info-blue);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #93c5fd;
      font-size: 12px;
      font-weight: 600;
    }

    /* Warning Alert Banner when Dollar is null */
    .alert-banner {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid var(--gold-primary);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--gold-light);
      font-size: 13px;
      font-weight: 700;
    }

    /* Inputs Panel */
    .input-panel {
      background: var(--bg-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 16px 20px;
      margin-bottom: 16px;
    }

    .inputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .input-group label {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-wrapper input {
      width: 100%;
      background: rgba(10, 13, 20, 0.7);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      padding-left: 70px;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      outline: none;
      transition: all 0.25s ease;
    }

    .input-wrapper input:focus {
      border-color: var(--gold-primary);
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
    }

    .input-suffix {
      position: absolute;
      left: 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--gold-light);
      pointer-events: none;
    }

    .input-time-tag {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 2px;
      padding-right: 4px;
    }

    /* Tabs Navigation */
    .tabs-nav {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
      background: rgba(18, 24, 36, 0.5);
      padding: 4px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
    }

    .tab-btn {
      flex: 1;
      padding: 10px 12px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 700;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
    }

    .tab-btn svg {
      transition: transform 0.2s, stroke 0.2s;
    }

    .tab-btn:hover svg {
      transform: scale(1.1);
    }

    .tab-btn.active {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid var(--gold-primary);
      color: var(--gold-light);
    }

    .tab-btn.active svg {
      stroke: var(--gold-light);
    }

    /* Recommendation Box */
    .rec-box {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(10, 13, 20, 0.8) 100%);
      border: 1px solid var(--success);
      border-radius: var(--radius-lg);
      padding: 14px 18px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .rec-info h3 {
      font-size: 15px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 2px;
    }

    .rec-info p {
      font-size: 12px;
      color: var(--text-muted);
    }

    .rec-badge {
      background: var(--success);
      color: #000;
      font-weight: 800;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      white-space: nowrap;
    }

    /* Comparison Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-bottom: 24px;
    }

    @media (max-width: 768px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 16px;
      position: relative;
      transition: transform 0.2s, border-color 0.2s;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card:hover {
      border-color: rgba(245, 158, 11, 0.3);
    }

    .card.highlight {
      border-color: var(--success);
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.15);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .card-title h3 {
      font-size: 16px;
      font-weight: 800;
      color: #fff;
    }

    .card-title span {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Custom Color Badges for Bubble Percentages */
    .bubble-badge {
      padding: 4px 10px;
      border-radius: 14px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .bubble-badge.disabled {
      background: rgba(156, 163, 175, 0.1);
      border: 1px solid rgba(156, 163, 175, 0.2);
      color: var(--text-muted);
    }

    /* Green for Negative Bubble (< 0%) */
    .bubble-badge.good {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--success);
      color: var(--success);
    }

    /* Blue for 0% to 5% */
    .bubble-badge.blue {
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid var(--info-blue);
      color: #60a5fa;
    }

    /* Orange for 5% to 15% */
    .bubble-badge.orange {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid var(--warning);
      color: var(--gold-light);
    }

    /* Red for > 15% */
    .bubble-badge.danger {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--danger);
      color: #f87171;
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }

    .price-label {
      font-size: 12px;
      color: var(--text-muted);
    }

    .price-val {
      font-size: 17px;
      font-weight: 800;
      color: #fff;
    }

    .price-val.gold {
      color: var(--gold-light);
    }

    .price-val.expected {
      color: #60a5fa;
    }

    .timestamp-tag {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed var(--border-color);
      display: flex;
      justify-content: space-between;
    }

    /* COMPACT CURRENCIES LIST */
    .currency-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }

    .currency-row {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.2s;
    }

    .currency-row:hover {
      background: rgba(26, 34, 52, 0.9);
      border-color: rgba(245, 158, 11, 0.3);
    }

    .curr-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .curr-flag {
      font-size: 22px;
    }

    .curr-name {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }

    .curr-note {
      font-size: 11px;
      color: var(--text-muted);
    }

    .curr-price {
      font-size: 16px;
      font-weight: 800;
      color: var(--gold-light);
    }

    /* Jewelry Tab */
    .calc-box {
      background: var(--bg-glass);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-xl);
      padding: 18px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    @media (max-width: 768px) {
      .calc-box { grid-template-columns: 1fr; }
    }

    .receipt-line {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dashed var(--border-color);
      font-size: 13px;
    }

    .receipt-line.total {
      border-bottom: none;
      border-top: 2px solid var(--gold-primary);
      margin-top: 10px;
      padding-top: 12px;
      font-weight: 800;
      font-size: 16px;
      color: var(--gold-light);
    }

    footer {
      margin-top: 28px;
      text-align: center;
      font-size: 11px;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      padding-top: 16px;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    footer a, footer button {
      color: var(--gold-light);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }

    footer a:hover, footer button:hover {
      color: #fff;
    }
  </style>
</head>
<body>

  <div class="container">
    <!-- Header Navbar -->
    <header>
      <div class="brand">
        <div class="brand-logo-svg">
          ${REALRATE_SVG_LOGO}
        </div>
        <div class="brand-title">
          <h1>RealRate</h1>
          <p>تحلیل قیمت واقعی طلا، سکه و ارزهای جهان بر اساس دلار</p>
        </div>
      </div>

      <div class="header-controls">
        <!-- Live IP-based Analytics Badges (Super Compact Icons) -->
        <div class="analytics-badges">
          <div class="badge-item online" title="کاربران آنلاین فعلی">
            <span class="pulse-dot"></span>
            <strong id="onlineUsersCount">${analytics.onlineUsers.toLocaleString("fa-IR")}</strong>
          </div>
          <div class="badge-item" title="کل بازدیدهای ثبت شده">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--gold-light);">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <strong id="totalViewsCount">${analytics.pageViews.toLocaleString("fa-IR")}</strong>
          </div>
        </div>

        <!-- Google Auth / User Profile Widget -->
        <div class="user-auth-section" id="userAuthSection">
          <div id="googleHeaderBtnContainer">
            <button class="google-btn-custom" onclick="triggerGoogleLogin()" id="googleLoginBtn" title="ورود با حساب گوگل">
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>ورود با گوگل</span>
            </button>
            <div id="hiddenGsiBtn" style="position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; overflow: hidden;"></div>
          </div>
          <div id="userProfileWidget" class="user-profile-widget" style="display: none;">
            <button class="user-pill-btn" id="userPillBtn" onclick="toggleUserDropdown(event)" title="حساب کاربری">
              <img id="userAvatarImg" class="user-avatar-img" src="" alt="کاربر" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'%23fbbf24\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'">
              <span id="userNameSpan" class="user-name-span"></span>
              <span id="userRoleBadge" class="user-role-badge"></span>
              <svg class="dropdown-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="user-dropdown-menu" id="userDropdownMenu" style="display: none;">
              <div class="user-dropdown-header">
                <span id="dropdownUserName" style="font-weight: 700; color: #fff; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></span>
                <span id="dropdownUserEmail" style="font-size: 11px; color: var(--text-muted); direction: ltr; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></span>
              </div>
              <div class="user-dropdown-divider"></div>
              <a href="/admin" id="dropdownAdminLink" class="user-dropdown-item admin-link" style="display: none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span>ورود به پنل مدیریت</span>
              </a>
              <button class="user-dropdown-item logout" onclick="handleSiteLogout()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                <span>خروج از حساب</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Optional System Announcement Banner -->
    <div class="system-announcement" id="sysAnnouncement" style="${globalSettings.announcement ? 'display: flex;' : 'display: none;'}">
      <span>📢</span>
      <span id="sysAnnouncementText">${globalSettings.announcement || ''}</span>
    </div>

    <!-- Quick 4 Main Currencies Bar (1 Single Row: USD, EUR, AED, TRY) -->
    <div class="quick-currencies-bar" id="quickCurrenciesBar">
      <div class="quick-curr-item">
        <span style="display: flex; align-items: center; gap: 6px;">
          <span class="quick-curr-flag">🇺🇸</span>
          <span class="quick-curr-name">دلار</span>
        </span>
        <strong id="q_usd_val" class="quick-curr-price">در حال دریافت...</strong>
      </div>
      <div class="quick-curr-item">
        <span style="display: flex; align-items: center; gap: 6px;">
          <span class="quick-curr-flag">🇪🇺</span>
          <span class="quick-curr-name">یورو</span>
        </span>
        <strong id="q_eur_val" class="quick-curr-price">در حال دریافت...</strong>
      </div>
      <div class="quick-curr-item">
        <span style="display: flex; align-items: center; gap: 6px;">
          <span class="quick-curr-flag">🇦🇪</span>
          <span class="quick-curr-name">درهم</span>
        </span>
        <strong id="q_aed_val" class="quick-curr-price">در حال دریافت...</strong>
      </div>
      <div class="quick-curr-item">
        <span style="display: flex; align-items: center; gap: 6px;">
          <span class="quick-curr-flag">🇹🇷</span>
          <span class="quick-curr-name">لیر</span>
        </span>
        <strong id="q_try_val" class="quick-curr-price">در حال دریافت...</strong>
      </div>
    </div>

    <!-- Alert Banner (shown when Dollar is null) -->
    <div class="alert-banner" id="usdAlert" style="display: flex;">
      <span>⚠️ لطفاً ابتدا نرخ دلار آزاد (تومان) را وارد کنید تا محاسبات انجام شود.</span>
    </div>

    <!-- Inputs Panel -->
    <div class="input-panel">
      <div class="inputs-grid">
        <div class="input-group">
          <label for="usdToman">
            <span>قیمت دلار آزاد (تومان)</span>
            <span id="usdSourceTag" style="font-size: 11px; color: var(--success); font-weight: 700;">🌐 زنده از بازار</span>
          </label>
          <div class="input-wrapper">
            <input type="text" id="usdToman" placeholder="مثلاً ۶۲,۰۰۰" oninput="onInputsChanged()">
            <span class="input-suffix">تومان</span>
          </div>
          <div class="input-time-tag" id="usdTimeTag">آخرین بروزرسانی: <strong>در حال استعلام...</strong></div>
        </div>

        <div class="input-group">
          <label for="goldUsd">
            <span>انس جهانی طلا ($)</span>
            <span style="font-size: 11px; color: var(--success); font-weight: 700;">🌐 انس جهانی</span>
          </label>
          <div class="input-wrapper">
            <input type="text" id="goldUsd" value="${defaultGoldUsd}" oninput="onInputsChanged()">
            <span class="input-suffix">USD</span>
          </div>
          <div class="input-time-tag" id="goldTimeTag">آخرین بروزرسانی: <strong>در حال استعلام...</strong></div>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs with Sleek SVG Icons -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('analysisTab', this)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        <span>حباب طلا و سکه</span>
      </button>

      <button class="tab-btn" onclick="switchTab('currenciesTab', this)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>قیمت روز ارزهای جهان</span>
      </button>

      <button class="tab-btn" onclick="switchTab('jewelryTab', this)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3h12l4 6-10 12L2 9z"></path>
          <path d="M11 3v18"></path>
          <path d="M2 9h20"></path>
        </svg>
        <span>محاسبه‌گر طلا و اجرت</span>
      </button>
    </div>

    <!-- Tab 1: Analysis & Comparison -->
    <div id="analysisTab" class="tab-content">
      <!-- Best Recommendation Box -->
      <div class="rec-box" id="recBox" style="display: none;">
        <div class="rec-info">
          <h3 id="recTitle">🏆 بهترین گزینه برای خرید: -</h3>
          <p id="recReason">در حال بررسی حباب قیمت‌ها...</p>
        </div>
        <div class="rec-badge" id="recBadge">پیشنهادی RealRate</div>
      </div>

      <!-- Items Grid -->
      <div class="cards-grid" id="cardsGrid">
        <!-- Dynamic Cards Inserted via JS -->
      </div>
    </div>

    <!-- Tab 2: World Currencies (COMPACT LIST) -->
    <div id="currenciesTab" class="tab-content" style="display: none;">
      <div class="currency-list" id="currenciesList">
        <!-- Dynamic Compact List Rows Inserted via JS -->
      </div>
    </div>

    <!-- Tab 3: Jewelry Calculator -->
    <div id="jewelryTab" class="tab-content" style="display: none;">
      <div class="calc-box">
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <h3 style="font-size: 15px; font-weight: 700; color: var(--gold-light);">فاکتور خرید طلا</h3>
          
          <div class="input-group">
            <label>وزن طلا (گرم)</label>
            <div class="input-wrapper">
              <input type="number" id="jWeight" value="5.5" step="0.1" oninput="calculateJewelry()">
              <span class="input-suffix">گرم</span>
            </div>
          </div>

          <div class="input-group">
            <label>درصد اجرت ساخت (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jWage" value="15" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">درصد</span>
            </div>
          </div>

          <div class="input-group">
            <label>درصد سود طلافروش (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jProfit" value="7" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">درصد</span>
            </div>
          </div>

          <div class="input-group">
            <label>درصد مالیات (٪)</label>
            <div class="input-wrapper">
              <input type="number" id="jTax" value="9" step="1" oninput="calculateJewelry()">
              <span class="input-suffix">روی اجرت و سود</span>
            </div>
          </div>
        </div>

        <div style="background: rgba(10, 13, 20, 0.8); border: 1px solid var(--border-glow); border-radius: var(--radius-lg); padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <h4 style="font-size: 14px; color: #fff; margin-bottom: 12px; font-weight: 800;">📝 صورت‌حساب پرداختی شما</h4>
            
            <div class="receipt-line">
              <span>قیمت طلا ۱۸ عیار خام:</span>
              <strong id="rec_raw_gram">-</strong>
            </div>
            <div class="receipt-line">
              <span>ارزش کل طلا خام:</span>
              <strong id="rec_raw_total">-</strong>
            </div>
            <div class="receipt-line">
              <span>اجرت ساخت:</span>
              <strong id="rec_wage_val">-</strong>
            </div>
            <div class="receipt-line">
              <span>سود طلافروش:</span>
              <strong id="rec_profit_val">-</strong>
            </div>
            <div class="receipt-line">
              <span>مالیات بر ارزش افزوده:</span>
              <strong id="rec_tax_val">-</strong>
            </div>
          </div>

          <div>
            <div class="receipt-line total">
              <span>مبلغ نهایی پرداختی:</span>
              <span id="rec_final_total">-</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer>
      <p>منبع اطلاعات: قیمت روز بازار طلا و نرخ برابری ارزهای جهان</p>
      <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
        <!-- PWA Install Mobile Icon Button -->
        <button id="pwaInstallFooterBtn" onclick="triggerPwaInstall()" title="نصب اپلیکیشن RealRate روی صفحه اصلی گوشی" style="display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; color: var(--gold-light); transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
            <path d="M12 6v6m-3-3l3 3 3-3"></path>
          </svg>
        </button>

        <a href="https://github.com/nos486/realrate" target="_blank" title="مشاهده سورس در گیت‌هاب" style="display: flex; align-items: center; justify-content: center; color: var(--gold-light); transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
        </a>

        <a href="/admin" target="_blank" title="ورود به پنل مدیریت" style="display: flex; align-items: center; justify-content: center; color: var(--gold-light); transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </a>
      </div>
    </footer>
  </div>

  <script>
    let currentCalcData = null;
    let serverLiveUsdToman = null;
    let serverUsdDatetime = null;
    let serverLastCheckTime = null;
    let deferredPrompt = null;

    function formatNum(num) {
      if (num === null || num === undefined || isNaN(num)) return '-';
      return Math.round(num).toLocaleString('fa-IR');
    }

    function parsePersianNum(str) {
      if (!str) return 0;
      const pers = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
      let s = str.toString();
      for (let i = 0; i < 10; i++) {
        s = s.replace(new RegExp(pers[i], 'g'), i);
      }
      return parseFloat(s.replace(/,/g, '')) || 0;
    }

    function formatRelativeTime(isoStr) {
      if (!isoStr) return 'ثبت نشده';
      try {
        const d = new Date(isoStr);
        const diffMins = Math.floor((new Date() - d) / 60000);
        if (diffMins < 1) return 'چند لحظه پیش';
        if (diffMins < 60) return diffMins.toLocaleString('fa-IR') + ' دقیقه پیش';
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return diffHours.toLocaleString('fa-IR') + ' ساعت پیش';
        return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return 'ثبت نشده';
      }
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      
      document.getElementById(tabId).style.display = 'block';
      btn.classList.add('active');
    }

    function onInputsChanged() {
      const inputEl = document.getElementById('usdToman');
      const usdToman = parsePersianNum(inputEl.value);
      const usdAlert = document.getElementById('usdAlert');
      const recBox = document.getElementById('recBox');
      const tagEl = document.getElementById('usdSourceTag');
      const usdTimeEl = document.getElementById('usdTimeTag');

      if (usdToman <= 0) {
        usdAlert.style.display = 'flex';
        recBox.style.display = 'none';
        document.getElementById('cardsGrid').innerHTML = '';
        document.getElementById('currenciesList').innerHTML = '';
        return;
      }

      usdAlert.style.display = 'none';
      
      // Update label tag indicator & small time tag below inputs
      if (tagEl) {
        if (serverLiveUsdToman && Math.abs(usdToman - serverLiveUsdToman) < 1) {
          tagEl.innerText = '🌐 زنده از بازار';
          tagEl.style.color = 'var(--success)';
          if (usdTimeEl) {
            usdTimeEl.innerHTML = 'آخرین بروزرسانی: <strong>' + formatRelativeTime(serverUsdDatetime) + '</strong>';
          }
        } else {
          tagEl.innerText = '✍️ ورودی دستی شما';
          tagEl.style.color = 'var(--gold-light)';
          if (usdTimeEl) {
            usdTimeEl.innerHTML = 'تنظیم شده توسط <strong>ورودی دستی کاربر</strong>';
          }
        }
      }

      calculateAll();
    }

    async function calculateAll() {
      const usdToman = parsePersianNum(document.getElementById('usdToman').value);
      const goldUsd = parsePersianNum(document.getElementById('goldUsd').value);
      
      if (usdToman <= 0) return;

      const params = new URLSearchParams({
        usd_toman: usdToman,
        gold_usd: goldUsd
      });

      try {
        const res = await fetch('/api/calculate?' + params.toString());
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();

        if (data.success) {
          currentCalcData = data;
          renderQuickCurrencies(data);
          renderAnalysis(data);
          renderCurrencies(data);
          calculateJewelry();
          if (data.analytics) {
            updateAnalyticsUI(data.analytics);
          }
          if (data.globalSettings && data.globalSettings.announcement) {
            const annBox = document.getElementById('sysAnnouncement');
            const annText = document.getElementById('sysAnnouncementText');
            if (annBox && annText) {
              annText.innerText = data.globalSettings.announcement;
              annBox.style.display = 'flex';
            }
          }
        }
      } catch (err) {
        console.error('Calculation error:', err);
      }
    }

    function renderQuickCurrencies(data) {
      if (!data.quick_currencies) return;
      const qc = data.quick_currencies;

      const uEl = document.getElementById('q_usd_val');
      const eEl = document.getElementById('q_eur_val');
      const aEl = document.getElementById('q_aed_val');
      const tEl = document.getElementById('q_try_val');

      if (uEl) uEl.innerText = formatNum(qc.USD) + ' تومان';
      if (eEl) eEl.innerText = formatNum(qc.EUR) + ' تومان';
      if (aEl) aEl.innerText = formatNum(qc.AED) + ' تومان';
      if (tEl) tEl.innerText = formatNum(qc.TRY) + ' تومان';
    }

    function updateAnalyticsUI(analytics) {
      if (!analytics) return;
      const onlineEl = document.getElementById('onlineUsersCount');
      const viewsEl = document.getElementById('totalViewsCount');
      if (onlineEl && analytics.onlineUsers) onlineEl.innerText = analytics.onlineUsers.toLocaleString('fa-IR');
      if (viewsEl && analytics.pageViews) viewsEl.innerText = analytics.pageViews.toLocaleString('fa-IR');
    }

    function renderCurrencies(data) {
      const list = document.getElementById('currenciesList');
      list.innerHTML = '';

      if (!data.currencies || data.currencies.length === 0) return;

      data.currencies.forEach(c => {
        const row = document.createElement('div');
        row.className = 'currency-row';

        row.innerHTML = \`
          <div class="curr-info">
            <span class="curr-flag">\${c.flag}</span>
            <div>
              <div class="curr-name">\${c.name} (\${c.code})</div>
              <div class="curr-note">\${c.note}</div>
            </div>
          </div>
          <div class="curr-price">\${formatNum(c.toman_price)} تومان</div>
        \`;

        list.appendChild(row);
      });
    }

    function renderAnalysis(data) {
      const grid = document.getElementById('cardsGrid');
      grid.innerHTML = '';

      if (!data.analysis || data.analysis.length === 0) return;

      // Show Recommendation Box
      const recBox = document.getElementById('recBox');
      if (data.recommendation) {
        recBox.style.display = 'flex';
        document.getElementById('recTitle').innerText = '🏆 بهترین گزینه برای خرید: ' + data.recommendation.best_name;
        document.getElementById('recReason').innerText = data.recommendation.reason;
        
        const bestPct = data.recommendation.best_bubble_pct;
        document.getElementById('recBadge').innerText = (bestPct < 0 ? 'حباب منفی: ' : 'حباب: ') + bestPct.toLocaleString('fa-IR') + '٪';
      } else {
        recBox.style.display = 'none';
      }

      data.analysis.forEach(item => {
        const isBest = data.recommendation && data.recommendation.best_id === item.id;
        const hasMarket = item.market !== null;
        const isNegative = hasMarket && item.bubble < 0;
        
        const card = document.createElement('div');
        card.className = 'card ' + (isBest ? 'highlight' : '');

        let bubbleClass = 'disabled';
        let badgeText = 'ناموجود در بازار';

        if (hasMarket) {
          if (item.bubble_pct < 0) {
            bubbleClass = 'good'; // Green (< 0%)
            badgeText = 'حباب منفی: ' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          } else if (item.bubble_pct <= 5) {
            bubbleClass = 'blue'; // Blue (0% to 5%)
            badgeText = 'حباب: +' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          } else if (item.bubble_pct <= 15) {
            bubbleClass = 'orange'; // Orange (5% to 15%)
            badgeText = 'حباب: +' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          } else {
            bubbleClass = 'danger'; // Red (> 15%)
            badgeText = 'حباب: +' + item.bubble_pct.toLocaleString('fa-IR') + '٪';
          }
        }

        const timeStr = formatRelativeTime(item.updated_at);
        
        let marketDisplayStr = '<span class="price-val" style="color: var(--text-muted); font-size: 15px;">ناموجود در بازار</span>';
        let rawBubbleDisplayStr = '<span style="color: var(--text-muted); font-size: 12px;">اطلاعات بازار موجود نیست</span>';
        let expectedDiffDisplayStr = '';

        if (hasMarket) {
          marketDisplayStr = '<span class="price-val">' + formatNum(item.market) + ' تومان</span>';
          
          // 1. Raw Bubble Display with Color Palette: Green (<0), Blue (0-5), Orange (5-15), Red (>15)
          let bubbleColor = '#f87171';
          if (item.bubble_pct < 0) {
            bubbleColor = 'var(--success)';
          } else if (item.bubble_pct <= 5) {
            bubbleColor = '#60a5fa';
          } else if (item.bubble_pct <= 15) {
            bubbleColor = 'var(--warning)';
          } else {
            bubbleColor = '#f87171';
          }

          rawBubbleDisplayStr = isNegative ? 
            ('حباب منفی ' + formatNum(Math.abs(item.bubble)) + ' تومان (' + item.bubble_pct.toLocaleString('fa-IR') + '٪)') : 
            ('+' + formatNum(item.bubble) + ' تومان (' + item.bubble_pct.toLocaleString('fa-IR') + '٪)');
          rawBubbleDisplayStr = '<span style="font-weight: 800; font-size: 14px; color: ' + bubbleColor + ';">' + rawBubbleDisplayStr + '</span>';

          // 2. Expected Price Variance Display (for coins with target bubble)
          if (item.target_bubble_pct > 0 && item.diff_from_expected !== null) {
            const isExpNeg = item.diff_from_expected < 0;
            let expDiffColor = '#f87171';
            if (item.diff_from_expected_pct < 0) {
              expDiffColor = 'var(--success)';
            } else if (item.diff_from_expected_pct <= 5) {
              expDiffColor = '#60a5fa';
            } else if (item.diff_from_expected_pct <= 15) {
              expDiffColor = 'var(--warning)';
            } else {
              expDiffColor = '#f87171';
            }

            const expDiffText = isExpNeg ?
              ('اختلاف منفی ' + formatNum(Math.abs(item.diff_from_expected)) + ' تومان (' + item.diff_from_expected_pct.toLocaleString('fa-IR') + '٪)') :
              ('+' + formatNum(item.diff_from_expected) + ' تومان (' + item.diff_from_expected_pct.toLocaleString('fa-IR') + '٪)');
            
            expectedDiffDisplayStr = \`
              <div class="price-row" style="margin-top: 6px;">
                <span class="price-label">انحراف بازار از قیمت محاسباتی:</span>
                <span style="font-weight: 800; font-size: 13px; color: \${expDiffColor};">\${expDiffText}</span>
              </div>
            \`;
          }
        }

        let expectedRowHtml = '';
        if (item.target_bubble_pct > 0) {
          expectedRowHtml = \`
            <div class="price-row">
              <span class="price-label">قیمت محاسباتی (با حباب \${item.target_bubble_pct.toLocaleString('fa-IR')}٪):</span>
              <span class="price-val expected">\${formatNum(item.expected_price)} تومان</span>
            </div>
          \`;
        }

        card.innerHTML = \`
          <div>
            <div class="card-header">
              <div class="card-title">
                <h3>\${item.name}</h3>
                <span>ارزش واقعی vs قیمت روز بازار</span>
              </div>
              <span class="bubble-badge \${bubbleClass}">\${badgeText}</span>
            </div>

            <div class="price-row">
              <span class="price-label">ارزش واقعی (طلا و انس):</span>
              <span class="price-val gold">\${formatNum(item.intrinsic)} تومان</span>
            </div>

            \${expectedRowHtml}

            <div class="price-row">
              <span class="price-label">قیمت روز بازار:</span>
              \${marketDisplayStr}
            </div>

            <div class="price-row" style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
              <span class="price-label">حباب نسبت به ارزش خام طلا:</span>
              \${rawBubbleDisplayStr}
            </div>

            \${expectedDiffDisplayStr}
          </div>

          <div class="timestamp-tag">
            <span>منبع: قیمت روز بازار</span>
            <span>زمان بروزرسانی: <strong>\${timeStr}</strong></span>
          </div>
        \`;

        grid.appendChild(card);
      });
    }

    function calculateJewelry() {
      if (!currentCalcData) return;
      const g18k = currentCalcData.gold.gold_18k_gram;

      const weight = parseFloat(document.getElementById('jWeight').value) || 0;
      const wagePct = parseFloat(document.getElementById('jWage').value) || 0;
      const profitPct = parseFloat(document.getElementById('jProfit').value) || 0;
      const taxPct = parseFloat(document.getElementById('jTax').value) || 0;

      const rawTotal = g18k * weight;
      const wageVal = rawTotal * (wagePct / 100);
      const profitVal = (rawTotal + wageVal) * (profitPct / 100);
      const taxVal = (wageVal + profitVal) * (taxPct / 100);
      const finalTotal = rawTotal + wageVal + profitVal + taxVal;

      document.getElementById('rec_raw_gram').innerText = formatNum(g18k) + ' تومان';
      document.getElementById('rec_raw_total').innerText = formatNum(rawTotal) + ' تومان';
      document.getElementById('rec_wage_val').innerText = formatNum(wageVal) + ' تومان';
      document.getElementById('rec_profit_val').innerText = formatNum(profitVal) + ' تومان';
      document.getElementById('rec_tax_val').innerText = formatNum(taxVal) + ' تومان';
      document.getElementById('rec_final_total').innerText = formatNum(finalTotal) + ' تومان';
    }

    // PWA Add to Home Screen Event Listener
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    async function triggerPwaInstall() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          deferredPrompt = null;
        }
      } else {
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (isIos) {
          alert('جهت نصب اپلیکیشن روی آیفون:\\n۱. دکمه Share 🔗 در پایین مرورگر Safari را بزنید.\\n۲. گزینه "Add to Home Screen" ➕ را انتخاب کنید.');
        } else {
          alert('جهت نصب اپلیکیشن روی گوشی:\\n۱. منوی ۳ نقطه مرورگر را بزنید.\\n۲. گزینه "Add to Home Screen" یا "Install app" را انتخاب کنید.');
        }
      }
    }

    let currentUser = null;
    const googleClientId = "${googleClientId}";

    function renderAuthState(user) {
      const loginBtnWrapper = document.getElementById('googleHeaderBtnContainer');
      const profileWidget = document.getElementById('userProfileWidget');

      if (user) {
        if (loginBtnWrapper) loginBtnWrapper.style.display = 'none';
        if (profileWidget) profileWidget.style.display = 'flex';

        const avatarImg = document.getElementById('userAvatarImg');
        const nameSpan = document.getElementById('userNameSpan');
        const roleBadge = document.getElementById('userRoleBadge');
        const dropdownName = document.getElementById('dropdownUserName');
        const dropdownEmail = document.getElementById('dropdownUserEmail');
        const adminLink = document.getElementById('dropdownAdminLink');

        if (avatarImg) {
          avatarImg.src = user.picture || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fbbf24'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
        }
        if (nameSpan) {
          nameSpan.innerText = user.name || user.email.split('@')[0];
          nameSpan.title = user.name || user.email;
        }
        if (dropdownName) dropdownName.innerText = user.name || user.email;
        if (dropdownEmail) dropdownEmail.innerText = user.email;

        const pillBtn = document.getElementById('userPillBtn');
        if (pillBtn) {
          pillBtn.title = user.name ? (user.name + ' (' + user.email + ')') : user.email;
        }

        if (roleBadge) {
          if (user.role === 'admin') {
            roleBadge.innerText = 'مدیر';
            roleBadge.className = 'user-role-badge admin';
          } else {
            roleBadge.innerText = 'کاربر';
            roleBadge.className = 'user-role-badge user';
          }
        }

        if (adminLink) {
          adminLink.style.display = (user.role === 'admin') ? 'flex' : 'none';
        }
      } else {
        if (loginBtnWrapper) loginBtnWrapper.style.display = 'block';
        if (profileWidget) profileWidget.style.display = 'none';
      }
    }

    async function checkAuthSession() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
          currentUser = data.user;
          renderAuthState(currentUser);
        } else {
          currentUser = null;
          renderAuthState(null);
        }
      } catch (e) {
        currentUser = null;
        renderAuthState(null);
      }
    }

    function toggleUserDropdown(event) {
      if (event) event.stopPropagation();
      const menu = document.getElementById('userDropdownMenu');
      const pill = document.getElementById('userPillBtn');
      if (menu) {
        const isCurrentlyOpen = (menu.style.display === 'flex');
        menu.style.display = isCurrentlyOpen ? 'none' : 'flex';
        if (pill) {
          pill.classList.toggle('active', !isCurrentlyOpen);
        }
      }
    }

    document.addEventListener('click', (e) => {
      const widget = document.getElementById('userProfileWidget');
      const menu = document.getElementById('userDropdownMenu');
      const pill = document.getElementById('userPillBtn');
      if (menu && widget && !widget.contains(e.target)) {
        menu.style.display = 'none';
        if (pill) {
          pill.classList.remove('active');
        }
      }
    });

    async function handleSiteLogout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      currentUser = null;
      renderAuthState(null);
      location.reload();
    }

    async function handleGoogleCredentialResponse(response) {
      if (!response || !response.credential) return;
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (data.success && data.user) {
          currentUser = data.user;
          renderAuthState(currentUser);
        } else {
          alert(data.message || 'خطا در ورود با گوگل');
        }
      } catch (e) {
        console.error('Auth error:', e);
        alert('خطا در ارتباط با سرور جهت احراز هویت با گوگل');
      }
    }

    function initGoogleAuth() {
      if (!googleClientId) return;
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
          });
          const hiddenBtn = document.getElementById('hiddenGsiBtn');
          if (hiddenBtn) {
            google.accounts.id.renderButton(hiddenBtn, {
              type: 'standard',
              theme: 'outline',
              size: 'large'
            });
          }
        } catch (err) {
          console.error('GIS init error:', err);
        }
      } else {
        setTimeout(initGoogleAuth, 400);
      }
    }

    function triggerGoogleLogin() {
      if (!googleClientId) {
        alert('شناسه GOOGLE_CLIENT_ID هنوز در فایل wrangler.toml تنظیم نشده است.\\nلطفاً شناسه کلاینت گوگل را تنظیم کنید.');
        return;
      }
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              const hiddenBtn = document.querySelector('#hiddenGsiBtn div[role="button"]');
              if (hiddenBtn) hiddenBtn.click();
            }
          });
        } catch (e) {
          const hiddenBtn = document.querySelector('#hiddenGsiBtn div[role="button"]');
          if (hiddenBtn) hiddenBtn.click();
        }
      } else {
        alert('کتابخانه گوگل در حال بارگذاری است، لطفاً چند لحظه بعد مجدداً تلاش کنید.');
      }
    }

    async function initPage() {
      // Clear any legacy localStorage values to keep browser clean
      try { localStorage.removeItem('realrate_usd_toman'); } catch (e) {}

      // Register Service Worker for PWA
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      checkAuthSession();
      initGoogleAuth();

      try {
        const res = await fetch('/api/rates');
        const data = await res.json();
        if (data.success) {
          serverLastCheckTime = data.market_prices?.last_channel_check_time || new Date().toISOString();
          
          if (data.gold_usd) {
            document.getElementById('goldUsd').value = data.gold_usd.toLocaleString('en-US');
            document.getElementById('goldTimeTag').innerHTML = 'آخرین بروزرسانی: <strong>' + formatRelativeTime(serverLastCheckTime) + '</strong>';
          }
          if (data.live_usd_toman) {
            serverLiveUsdToman = data.live_usd_toman;
            serverUsdDatetime = data.live_usd_item?.datetime || serverLastCheckTime;
            document.getElementById('usdToman').value = serverLiveUsdToman.toLocaleString('en-US');
            document.getElementById('usdTimeTag').innerHTML = 'آخرین بروزرسانی: <strong>' + formatRelativeTime(serverUsdDatetime) + '</strong>';
          } else if (data.globalSettings && data.globalSettings.default_usd_toman) {
            document.getElementById('usdToman').value = data.globalSettings.default_usd_toman.toLocaleString('en-US');
            document.getElementById('usdTimeTag').innerHTML = 'استفاده از <strong>نرخ پیش‌فرض سیستم</strong>';
          }

          if (data.analytics) {
            updateAnalyticsUI(data.analytics);
          }
        }
      } catch (e) {}

      onInputsChanged();
    }

    window.addEventListener('DOMContentLoaded', initPage);
  </script>
</body>
</html>`;
}

export { getHTMLContent };
