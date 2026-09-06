/**
 * adminPage.js — Admin panel HTML
 * Contains all HTML/CSS/JS for the RealRate admin dashboard
 */

import { REALRATE_SVG_LOGO, REALRATE_FAVICON_DATA_URI } from "./assets.js";

function getAdminHTMLContent(env, globalSettings) {
  const googleClientId = (env && env.GOOGLE_CLIENT_ID) ? env.GOOGLE_CLIENT_ID.trim() : "";
  const adminEmail = (env && env.ADMIN_EMAIL) ? env.ADMIN_EMAIL.trim() : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>پنل مدیریت RealRate</title>
  <link rel="icon" type="image/svg+xml" href="${REALRATE_FAVICON_DATA_URI}">
  
  <!-- Google Identity Services -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-primary: #0a0d14;
      --bg-glass: rgba(18, 24, 36, 0.88);
      --bg-card: rgba(26, 34, 52, 0.75);
      --border-color: rgba(255, 255, 255, 0.1);
      --gold-primary: #f59e0b;
      --gold-light: #fbbf24;
      --gold-gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --success: #10b981;
      --danger: #ef4444;
      --radius-lg: 16px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Vazirmatn', sans-serif; }

    body {
      background-color: var(--bg-primary);
      background-image: 
        radial-gradient(circle at 15% 15%, rgba(245, 158, 11, 0.08) 0%, transparent 45%),
        radial-gradient(circle at 85% 85%, rgba(16, 185, 129, 0.05) 0%, transparent 45%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 24px 16px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    .admin-container {
      width: 100%;
      max-width: 760px;
      background: var(--bg-glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 28px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6);
      margin: auto;
    }

    .admin-header {
      text-align: center;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .admin-header h2 {
      font-size: 22px;
      font-weight: 800;
      color: var(--gold-light);
    }

    .admin-header p {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Admin Profile Bar */
    .admin-profile-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      background: rgba(10, 13, 20, 0.6);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }

    .admin-user-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .admin-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--gold-light);
    }

    .admin-role-badge {
      background: var(--gold-gradient);
      color: #000;
      font-size: 11px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 10px;
      margin-right: 6px;
    }

    .admin-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: none;
      transition: 0.2s;
    }

    .btn-sm.logout {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .btn-sm.logout:hover {
      background: rgba(239, 68, 68, 0.25);
    }

    .btn-sm.site-link {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .btn-sm.site-link:hover {
      background: rgba(255, 255, 255, 0.14);
      color: var(--gold-light);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    @media (max-width: 600px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .stat-card {
      background: rgba(10, 13, 20, 0.6);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-card-title {
      font-size: 11px;
      color: var(--text-muted);
    }

    .stat-card-val {
      font-size: 16px;
      font-weight: 800;
      color: #fff;
    }

    .stat-card-val.gold { color: var(--gold-light); }
    .stat-card-val.green { color: var(--success); }
    .stat-card-val.blue { color: #60a5fa; }

    .section-title {
      font-size: 14px;
      font-weight: 800;
      color: var(--gold-light);
      margin: 22px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px dashed var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Users Table */
    .users-table-wrap {
      background: rgba(10, 13, 20, 0.6);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow-x: auto;
      margin-bottom: 20px;
    }

    .users-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: right;
    }

    .users-table th {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-muted);
      padding: 10px 14px;
      font-weight: 700;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    .users-table td {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      white-space: nowrap;
    }

    .users-table tr:last-child td {
      border-bottom: none;
    }

    .users-table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .user-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .user-cell img {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      object-fit: cover;
      background: #1f2937;
    }

    .role-tag {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
    }

    .role-tag.admin {
      background: rgba(245, 158, 11, 0.2);
      color: var(--gold-light);
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .role-tag.user {
      background: rgba(255, 255, 255, 0.07);
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Forms */
    .form-group {
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
    }

    .form-group input, .form-group textarea {
      width: 100%;
      background: rgba(10, 13, 20, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 10px 14px;
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: 0.25s;
    }

    .form-group input:focus, .form-group textarea:focus {
      border-color: var(--gold-primary);
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    @media (max-width: 550px) {
      .grid-2 {
        grid-template-columns: 1fr;
      }
    }

    .btn {
      width: 100%;
      background: var(--gold-gradient);
      border: none;
      color: #000;
      font-weight: 800;
      font-size: 14px;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: 0.2s;
      margin-top: 10px;
    }

    .btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .msg-box {
      padding: 12px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 16px;
      display: none;
    }

    .msg-box.success { background: rgba(16, 185, 129, 0.15); border: 1px solid var(--success); color: var(--success); }
    .msg-box.error { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--danger); color: #f87171; }
    .msg-box.info { background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #93c5fd; }

    /* Login View Styles */
    .login-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 16px;
      padding: 20px 0;
    }

    .google-admin-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #ffffff;
      color: #1f2937;
      border: none;
      border-radius: 24px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      transition: all 0.2s ease;
    }

    .google-admin-btn:hover {
      background: #f3f4f6;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>

  <div class="admin-container">
    <div class="admin-header">
      <div style="filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.4));">
        ${REALRATE_SVG_LOGO}
      </div>
      <h2>پنل مدیریت RealRate</h2>
      <p>تنظیمات قیمت، انس و پایش کاربران سیستم</p>
    </div>

    <div class="msg-box" id="msgBox"></div>

    <!-- 1. Login View (Shown when not authenticated) -->
    <div id="loginView" style="display: none;">
      <div class="login-box">
        <p style="font-size: 14px; color: var(--text-muted); max-width: 380px;">
          جهت ورود به پنل مدیریت، لطفاً با حساب گوگل تعیین‌شده برای مدیر وارد شوید.
        </p>

        <div id="adminGoogleContainer">
          <button class="google-admin-btn" onclick="triggerAdminGoogleLogin()" id="adminGoogleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>ورود به مدیریت با گوگل</span>
          </button>
          <div id="hiddenAdminGsiBtn" style="position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; overflow: hidden;"></div>
        </div>

        <p style="font-size: 11px; color: var(--text-muted); margin-top: 10px;">
          🛡️ احراز هویت اختصاصی بر اساس متغیر محیطی <code>ADMIN_EMAIL</code>
        </p>

        <a href="/" class="btn-sm site-link" style="margin-top: 12px;">← بازگشت به صفحه اصلی سایت</a>
      </div>
    </div>

    <!-- 2. Unauthorized View (Logged in via Google, but not admin) -->
    <div id="unauthorizedView" style="display: none;">
      <div class="login-box">
        <div style="font-size: 40px;">⛔</div>
        <h3 style="color: #f87171; font-weight: 800;">عدم دسترسی مدیریت</h3>
        <p style="font-size: 13px; color: var(--text-muted); max-width: 420px; line-height: 1.8;">
          شما با حساب گوگل <strong id="unauthEmailTxt" style="color: #fff; direction: ltr; display: inline-block;"></strong> وارد شده‌اید، اما این حساب در متغیر <code>ADMIN_EMAIL</code> ورکر به عنوان مدیر ثبت نشده است.
        </p>
        <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center;">
          <button class="btn-sm logout" onclick="logoutAdmin()">🔄 خروج و تعویض حساب گوگل</button>
          <a href="/" class="btn-sm site-link">🏠 بازگشت به سایت</a>
        </div>
      </div>
    </div>

    <!-- 3. Dashboard View (Shown after admin authentication) -->
    <div id="dashboardView" style="display: none;">
      <!-- Admin Profile Bar -->
      <div class="admin-profile-bar">
        <div class="admin-user-info">
          <img id="adminAvatarImg" class="admin-avatar" src="" alt="Admin" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'%23fbbf24\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'">
          <div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <strong id="adminNameTxt" style="font-size: 13px; color: #fff;">مدیر</strong>
              <span class="admin-role-badge">مدیر کل</span>
            </div>
            <span id="adminEmailTxt" style="font-size: 11px; color: var(--text-muted); direction: ltr; display: block;"></span>
          </div>
        </div>
        <div class="admin-actions">
          <a href="/" target="_blank" class="btn-sm site-link" title="مشاهده سایت">مشاهده سایت ↗</a>
          <button class="btn-sm logout" onclick="logoutAdmin()">خروج</button>
        </div>
      </div>

      <!-- Live Stats (Cloudflare KV) -->
      <div class="section-title">
        <span>📊 آمار و آنالیتیکس سیستم (Cloudflare KV)</span>
        <button onclick="loadAdminStats()" class="btn-sm site-link" style="padding: 2px 8px; font-size: 11px;">🔄 بروزرسانی</button>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-card-title">🌐 آی‌پی‌های یونیک</span>
          <span class="stat-card-val gold" id="statUniqueIps">...</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-title">👁️ کل صفحات بازدید</span>
          <span class="stat-card-val" id="statTotalViews">...</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-title">🟢 کاربران آنلاین</span>
          <span class="stat-card-val green" id="statOnlineUsers">...</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-title">👥 کاربران ثبت‌نام شده</span>
          <span class="stat-card-val blue" id="statRegisteredUsers">...</span>
        </div>
      </div>

      <!-- Registered Users Table (User Table in KV) -->
      <div class="section-title">
        <span>👥 جدول کاربران ثبت‌نام شده (Google Sign-In)</span>
        <button onclick="loadAdminUsers()" class="btn-sm site-link" style="padding: 2px 8px; font-size: 11px;">🔄 تازه‌سازی کاربران</button>
      </div>

      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>ایمیل</th>
              <th>نقش</th>
              <th>تاریخ عضویت</th>
              <th>آخرین ورود</th>
              <th>دفعات ورود</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
            <tr>
              <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 18px;">
                در حال دریافت اطلاعات کاربران...
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Price & Gold Global Settings -->
      <div class="section-title">⚙️ تنظیمات قیمت و انس عمومی</div>

      <div class="grid-2">
        <div class="form-group">
          <label for="adminUsdToman">قیمت پیش‌فرض دلار (تومان)</label>
          <input type="number" id="adminUsdToman" value="${globalSettings.default_usd_toman || 62000}">
        </div>

        <div class="form-group">
          <label for="adminGoldUsd">پیش‌فرض انس طلا ($)</label>
          <input type="number" id="adminGoldUsd" value="${globalSettings.default_gold_usd || 2450}">
        </div>
      </div>

      <!-- Bubble Percentages -->
      <div class="section-title">🪙 تنظیم درصد حباب مصوب سکه‌ها</div>

      <div class="form-group">
        <label for="adminBubbleFull">درصد حباب مصوب سکه تمام (٪)</label>
        <input type="number" id="adminBubbleFull" value="${globalSettings.bubble_pct_full ?? 15}" step="0.5">
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="adminBubbleHalf">حباب مصوب نیم سکه (٪)</label>
          <input type="number" id="adminBubbleHalf" value="${globalSettings.bubble_pct_half ?? 20}" step="0.5">
        </div>

        <div class="form-group">
          <label for="adminBubbleQuarter">حباب مصوب ربع سکه (٪)</label>
          <input type="number" id="adminBubbleQuarter" value="${globalSettings.bubble_pct_quarter ?? 25}" step="0.5">
        </div>
      </div>

      <!-- System Announcement -->
      <div class="section-title">📢 پیام عمومی سیستم</div>

      <div class="form-group">
        <label for="adminAnnouncement">پیام یا اطلاعیه بالای سایت (در صورت خالی بودن نمایش داده نمی‌شود)</label>
        <textarea id="adminAnnouncement" rows="2" placeholder="متن پیام عمومی را وارد کنید...">${globalSettings.announcement || ''}</textarea>
      </div>

      <button class="btn" onclick="saveSettings()">💾 ذخیره کلیه تغییرات</button>
    </div>
  </div>

  <script>
    const googleClientId = "${googleClientId}";

    function showMsg(text, type) {
      const box = document.getElementById('msgBox');
      box.innerText = text;
      box.className = 'msg-box ' + (type || 'info');
      box.style.display = 'block';
      setTimeout(() => {
        if (type === 'success') box.style.display = 'none';
      }, 5000);
    }

    function formatPersianDate(isoStr) {
      if (!isoStr) return '-';
      try {
        const d = new Date(isoStr);
        return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return isoStr;
      }
    }

    async function loadAdminStats() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.success) {
          document.getElementById('statUniqueIps').innerText = data.uniqueIps.toLocaleString('fa-IR');
          document.getElementById('statTotalViews').innerText = data.pageViews.toLocaleString('fa-IR');
          document.getElementById('statOnlineUsers').innerText = data.onlineUsers.toLocaleString('fa-IR');
        }
      } catch (e) {}
    }

    async function loadAdminUsers() {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          document.getElementById('statRegisteredUsers').innerText = (data.total || data.users.length).toLocaleString('fa-IR');
          const tbody = document.getElementById('usersTableBody');
          if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">هنوز کاربری ثبت نشده است.</td></tr>';
            return;
          }

          let rows = '';
          data.users.forEach(u => {
            const avatar = u.picture || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fbbf24'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
            const roleBadge = u.role === 'admin' ? '<span class="role-tag admin">مدیر کل</span>' : '<span class="role-tag user">کاربر عادی</span>';
            rows += \`
              <tr>
                <td>
                  <div class="user-cell">
                    <img src="\${avatar}" alt="\${u.name || ''}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'%23fbbf24\\'><path d=\\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\\'/></svg>'">
                    <strong>\${u.name || '-'}</strong>
                  </div>
                </td>
                <td style="direction: ltr; text-align: right;">\${u.email}</td>
                <td>\${roleBadge}</td>
                <td>\${formatPersianDate(u.createdAt)}</td>
                <td>\${formatPersianDate(u.lastLogin)}</td>
                <td>\${(u.loginCount || 1).toLocaleString('fa-IR')}</td>
              </tr>
            \`;
          });
          tbody.innerHTML = rows;
        }
      } catch (e) {
        console.error('Error loading users:', e);
      }
    }

    async function saveSettings() {
      const default_usd_toman = parseFloat(document.getElementById('adminUsdToman').value);
      const default_gold_usd = parseFloat(document.getElementById('adminGoldUsd').value);
      const bubble_pct_full = parseFloat(document.getElementById('adminBubbleFull').value);
      const bubble_pct_half = parseFloat(document.getElementById('adminBubbleHalf').value);
      const bubble_pct_quarter = parseFloat(document.getElementById('adminBubbleQuarter').value);
      const announcement = document.getElementById('adminAnnouncement').value;

      try {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            default_usd_toman,
            default_gold_usd,
            bubble_pct_full,
            bubble_pct_half,
            bubble_pct_quarter,
            announcement
          })
        });
        const data = await res.json();
        if (data.success) {
          showMsg(data.message || 'تنظیمات با موفقیت ذخیره شد.', 'success');
        } else {
          showMsg(data.message || 'خطا در ذخیره‌سازی تنظیمات', 'error');
        }
      } catch (e) {
        showMsg('خطا در ذخیره‌سازی تنظیمات: ' + e.message, 'error');
      }
    }

    async function logoutAdmin() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
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
        if (data.success) {
          checkAdminAuth();
        } else {
          showMsg(data.message || 'خطا در احراز هویت با گوگل', 'error');
        }
      } catch (e) {
        showMsg('خطا در ارتباط با سرور', 'error');
      }
    }

    function initAdminGoogleAuth() {
      if (!googleClientId) return;
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
          });
          const hiddenBtn = document.getElementById('hiddenAdminGsiBtn');
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
        setTimeout(initAdminGoogleAuth, 400);
      }
    }

    function triggerAdminGoogleLogin() {
      if (!googleClientId) {
        alert('شناسه GOOGLE_CLIENT_ID در wrangler.toml تنظیم نشده است.\\nلطفاً طبق راهنمای README.md ابتدا شناسه کلاینت گوگل را تنظیم فرمایید.');
        return;
      }
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              const hiddenBtn = document.querySelector('#hiddenAdminGsiBtn div[role="button"]');
              if (hiddenBtn) hiddenBtn.click();
            }
          });
        } catch (e) {
          const hiddenBtn = document.querySelector('#hiddenAdminGsiBtn div[role="button"]');
          if (hiddenBtn) hiddenBtn.click();
        }
      } else {
        alert('کتابخانه گوگل در حال بارگذاری است، لطفاً چند لحظه بعد تلاش کنید.');
      }
    }

    async function checkAdminAuth() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        const loginView = document.getElementById('loginView');
        const unauthView = document.getElementById('unauthorizedView');
        const dashView = document.getElementById('dashboardView');

        if (data.authenticated && data.user) {
          if (data.user.role === 'admin') {
            loginView.style.display = 'none';
            unauthView.style.display = 'none';
            dashView.style.display = 'block';

            document.getElementById('adminAvatarImg').src = data.user.picture || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fbbf24'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
            document.getElementById('adminNameTxt').innerText = data.user.name || 'مدیر سیستم';
            document.getElementById('adminEmailTxt').innerText = data.user.email;

            loadAdminStats();
            loadAdminUsers();
          } else {
            loginView.style.display = 'none';
            unauthView.style.display = 'block';
            dashView.style.display = 'none';
            document.getElementById('unauthEmailTxt').innerText = data.user.email;
          }
        } else {
          loginView.style.display = 'block';
          unauthView.style.display = 'none';
          dashView.style.display = 'none';
          initAdminGoogleAuth();
        }
      } catch (e) {
        document.getElementById('loginView').style.display = 'block';
        initAdminGoogleAuth();
      }
    }

    window.addEventListener('DOMContentLoaded', checkAdminAuth);
  </script>
</body>
</html>`;
}

export { getAdminHTMLContent };
