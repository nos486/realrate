# RealRate features

Every feature in detail. For a summary see the [README](../../README.en.md). Persian: [../FEATURES.md](../FEATURES.md).

---

## 1. Intrinsic value and bubble of gold and coins
- **Raw mathematical value**: the value of a gram of 18k and 24k gold from the world ounce price and the free-market dollar, with the legal weight and standard purity (750 and 999.9).
- **Two bubbles**: against the raw gold value, and against the market's expected price with the union's approved bubble.
- **Official coins**: Emami, Bahar Azadi, half, quarter and gram coins.
- **Smart buy suggestion**: the asset with the lowest bubble is highlighted.
- **Negative bubble and missing prices**: a negative bubble is told apart from items that have no price, without inventing prices.

## 2. Personal home page
- The home page is made of **sections**, and each user decides what they see.
- Any market asset (gold, coin, currency, crypto, stock symbol, fund) can be added to any section.
- Each section has its own card style: **full card** (with bubble and intrinsic value for gold and coins), **compact card** (one list on mobile) or **trend card**.
- Top bar: search, **base rates** (manual dollar and ounce input — opened automatically when there is no dollar rate) and **customize**.
- Sections collapse and expand by clicking their title (remembered in the browser).
- "Customize" mode: move cards and sections by **drag and drop** (mouse, touch and keyboard), add and remove assets and sections, rename and restyle them, and **ready-made presets** (default, gold and coins, currencies and crypto, stocks and funds, summary) from the bottom bar.
- The layout is saved per user on the server and is the same on every device; "default" clears it.
- Overdue and upcoming installments and cheques are summarized in one line (count and total) with expandable details.

## 3. Currency and crypto rates
- Cross rates against the dollar, converted to tomans, for 16 currencies (USD, EUR, AED, TRY, GBP, CAD, AUD, CHF, KWD, QAR, SAR, CNY, RUB, JPY, IQD, AFN).
- Live USDT price and the USDT/dollar spread.
- Ticker at the top switching between 18k gold, dollar and USDT, with the daily change.
- Prices update automatically every 2 minutes, with "last updated" and an offline mode.

## 4. Stocks and funds
- Dynamic processing of the Tehran Stock Exchange board with no hard-coded symbols.
- Cumulative merge: low-volume symbols are not dropped when a new tick arrives.
- A data explorer in the admin panel for symbols and funds (ETFs).

## 5. Multiple cloud portfolios
- Unlimited portfolios with a switcher and item / transaction counters.
- Separate views for "manual holdings" and "holdings from transactions".
- Grouped by category by default (gold, coin, currency, crypto, stocks, …) with a "holdings mix" donut chart.
- **Custom categories**:
  - Create any number of categories with a name and an icon, per portfolio.
  - Rename, delete (its holdings move to "other", nothing is lost) and reorder categories by drag and drop.
  - Move holdings between categories by dragging or with the "move to category…" menu, fully usable on phones and tablets.
  - An automatic "other (uncategorized)" category for new or uncategorized holdings.
  - Totals, profit/loss, return and the mix chart all follow the custom categories.
  - Stored end-to-end encrypted in the vault; the server never sees the plaintext.
  - "Back to default" resets to the system's fixed categories at any time.
- **Two holdings views**: "each purchase" (one editable row per purchase) and "total per asset" — all purchases of an asset (manual and from transactions) in one row: total quantity, weighted average purchase price (only purchases with a price), today's value, profit/loss and the first and last purchase dates; the "N purchases" button shows those purchases in the per-purchase view. The chosen view is remembered in the browser.
- Live profit and loss, Shamsi dates with a "today" button, CSV export and import (keeping the standard category column).
- **Compare with buying another asset**: when recording a holding you can pick another asset (e.g. gold) and its price on the purchase day; next to the profit/loss the app shows what the same money in that asset would be worth today and how much better or worse this purchase did (separate from "pay / swap with another asset", which records the asset actually paid).
- **Funded by («تأمین از»)**: a purchase can say which unsettled loan paid for it (section 7).
- **Public sharing** with a `/p/:slug` link and an optional password (decrypted custom categories are shown when the link carries the key).
- **Privacy mode** (`****`) hides amounts everywhere.

## 6. Transactions and weighted average cost (WAC)
- Buy and sell records with a Shamsi date and a note.
- Holdings and average cost are computed automatically in date order.
- Realized profit/loss on a sale, and a warning when selling more than is held.
- **One ledger per asset**: manual holdings are the asset's opening buys; sales and spends take from the whole balance (manual and transactions), so manual holdings can be sold too. The «تراکنش‌ها» row is what the transactions changed on top of the manual rows (negative when they took from them), and together they are the real position. A holding without a buy price is unknown cost: counted in the quantity, not in the average or P&L. (`calculationEngine.js`)
- **Paying an expense from a portfolio**: a dollar expense is paid from a portfolio's dollars («پرداخت از» in the expense form, with each portfolio's balance); that day's dollar rate is filled in from the price history and the portfolio gets a «پرداخت هزینه» transaction (P&L against cost, like a sale). Editing or deleting the expense updates or removes its transaction; a spend isn't edited from the portfolio. Toman accounts and loans aren't offered for dollar expenses. (`shared/vault/portfolioFunds.js`)

## 7. Loans and installments
- Automatic amortization schedule (interest rate, annual fee, installment interval).
- Record a payment (earlier installments are paid automatically), undo a payment, extra payments (reduce the amount or the number of installments).
- Bulk-edit installments, and a "based on total repayment" mode.
- Warnings for overdue and upcoming installments.
- **Standard banks with logos** (one list in `api/src/config/banks.config.js`) and the user's **custom banks**.
- Loans grouped by bank, with a donut of each bank's share (by loan amount or remaining debt).
- **Loan usage («مصرف وام»)**: in a loan's details, the expenses and portfolio purchases funded by it: spent, unspent remainder, and for portfolio purchases today's value, profit/loss and the annual return against the loan's interest rate (section 15).
- A received loan can also be recorded from a deposit SMS (section 17).

## 8. Incomes
- Incomes with a category (salary, benefits, bonus, freelance, business, investment, rent, gift, other).
- **Fixed incomes**: recurring incomes (salary, rent) are recorded once and added automatically every month, every 2, 3 or 6 months or every year (labelled "fixed"); missed periods are filled in, a deleted entry is not recreated, and a rule can be paused, resumed, edited or deleted (the list lives in the income form under "fixed income").
- Report: a stacked monthly bar chart for the chosen period (e.g. the last 6 months) by source (with an average line and the change against the previous month) and a donut by source; CSV export and import.
- Period picker at the top (last month, 3 months, 6 months, a year, all — a year by default) that fetches only that period from the server; one query per period feeds the 20-row list (sorted by date), the search, the totals and the charts. Portfolio transactions have the same period, paging and sorting.

## 9. Cheques
- **Received** and **issued** cheques: amount, Shamsi due date, drawer or payee, bank (with logo or a custom bank), cheque number, the 16-digit Sayad id and a note.
- One-click **"cleared"** in the list (today's date, undoable).
- **Status tracking** with dated history: pending, in collection, cleared, bounced, transferred and void/returned; add a follow-up note without changing the status.
- Summary: totals of received and issued cheques in progress, the amount due in the next 30 days, the nearest due date and bounced cheques.
- Filter by type and status, search (name, number, Sayad id, note) and CSV export.
- **Home page reminder** for overdue cheques and those due in 7 days.
- Cheques and their tracking history are end-to-end encrypted.

## 10. Account-wide end-to-end encryption (E2EE)
- **Mandatory for every account**: all portfolios, transactions, loans, incomes (with fixed incomes), cheques, expenses and accounts are encrypted on the user's device (browser or app).
- A new user creates an encryption passphrase first; an older account without encryption sees a banner and cannot save anything until it turns encryption on.
- The passphrase is never sent to the server; the server only keeps ciphertext.
- Lock/unlock in one place and change the passphrase without re-encrypting data; encryption cannot be turned off. The Android app also unlocks with a fingerprint.
- **Forgotten passphrase**: it cannot be recovered; "forgot your encryption passphrase?" deletes all financial data after a confirmation (typing «حذف همه اطلاعات» and the sign-in password) so the user can start over with a new passphrase. The account and the home layout stay.
- A shared encrypted portfolio's link carries that portfolio's key in the `#k=` fragment.
- Technical details: [E2EE_VAULT.md](E2EE_VAULT.md)

## 11. Price sources (code-first)
- Every adapter returns the same shape: `{ items: [{ id, name, price }], datetime }`.
- A display engine shared by server and client (`displayEngine.js`) for names, units, categories and icons.
- Each source's items are stored under one KV key, with one price book, and one polling tick without duplicate requests.
- In the admin panel: "live test", turning a source on or off, and choosing the primary source (no manual editing).

## 12. Security, PWA and the admin panel
- Google sign-in, or **email and password registration** with email verification (a single-use link valid for 24 hours); 30-day sessions.
- Google users can also set a password from the account settings (or "forgot password") and sign in by email.
- Password reset by a one-hour email link; changing or resetting the password signs out other sessions.
- Passwords are hashed with PBKDF2, links are stored only as hashes, attempts are rate-limited, and answers never reveal whether an email is registered.
- An unverified registration with someone else's email can't be abused: the owner signing in with Google removes the unverified password.
- The share-link password is stored as a hash.
- CSRF protection: data-changing requests are accepted only from the app's own origins.
- **Mobile side menu** (website): every section, the user, hide amounts, lock the encrypted data and sign out in one drawer.
- **PWA**: installable, with an offline cache that shows the last saved prices without internet.
- **Admin panel** in the same layout as the other pages:
  - A paged user list (10 per page) with search, sorting by registration or last sign-in, and quick filters (registered this week, inactive 30 days, unverified email, Google sign-in, blocked, Android app users) with a count for each.
  - Each user's details: sign-in method, email verification, sign-in count, active days, active sessions, encryption, their devices, and **only the counts** of portfolios, holdings, transactions, loans, cheques and incomes (never their content).
  - User management: block/unblock (with sign-out everywhere; the admin account can't be blocked), sign out everywhere, and resend the verification email.
  - Statistics: users, active today, registered this week, public portfolios, and a 30-day chart of daily active users, registrations and app users.
  - **Android app users**: every signed-in request carries `X-RealRate-Client` (`android/<version>` from the app, `web` from the site; `api/src/domain/clientInfo.js`). With `/api/auth/me` (every time the app opens) the server records it in `user_clients` (first/last time and latest version of each client) and `client_activity` (each client's daily use). In the panel: an "app users" card (active today and in 30 days), an "app users" filter, an "app" badge with the version in the list, an "active in the app" series in the chart, an "app versions" card (how many users are on each version — who needs to update) and a "devices" section in each user's details. The app's version is set by the APK build (`VITE_APP_VERSION`); versions from before this change send no header and are not counted until updated.
  - Site settings: the approved coin bubbles and the site-wide notice; fetching all sources at once in the sources section.
- **Maintenance mode**: with one switch in the admin panel only admins can sign in and use the site; everyone else (guest or signed in) sees an "updating" page with a configurable message and the server rejects their requests. While it is on, a banner reminds the admin.

## 13. Demo account and trial visit
- **Quick entry without registering**: visitors can click "view the demo" on the landing page, enter the app directly and try every section (portfolio, transactions, loans, incomes, cheques and home customization) with realistic sample data.
- **Read-only on the server**: a demo visitor's session (`demo_view`) is strictly read-only in the server's gate (`demoGate`); every create, edit, delete or sign-out-elsewhere request is refused with a structured `403 DEMO_READ_ONLY`. The frontend disables the add and edit buttons with a hint.
- **Fully compatible with E2EE**: the demo account's data lives in the encrypted vault like any other; the server sends the demo vault's public passphrase to demo clients and the browser opens the vault automatically, with no passphrase prompt or setup banners.
- **Demo banner**: a fixed banner at the top, with "register" for visitors and "back to the admin account" while the admin edits.
- **Managed by the admin**:
  - Admins have a "demo account" card in the admin panel with its statistics and state.
  - "Edit demo data" lets the admin add or edit the demo's loans, cheques, incomes or portfolios in the normal app pages, then return to the admin account without any key or encrypted data left behind.
  - Creating the demo data and resetting it completely (with a confirmation) are available in the admin panel.

## 14. Beta features, usage limits and AI cheque scanning
- **Usage limits per user tier**: each costly feature has a daily limit per tier (for now "user", and the unlimited "admin"; `api/src/config/usageLimits.js`). Days are counted in Tehran time.
- **Feature flags**:
  - Three stages: `off`, `beta` (admin only) and `ga` (every user).
  - Enforced on the server: when a feature is off for a user, its route answers `404 Not Found`, so its existence isn't revealed.
  - The client decides with the `useFeature` hook and the `<Feature>` component; regular users see no change.
- **AI scanning of bank cheques**:
  - Any user can use "scan cheque" on the cheques page (10 scans a day; the admin is unlimited) with the phone camera (`capture="environment"`), a file from the gallery, or drag and drop on desktop.
  - **Client-side optimization (`imageResize`)**: before upload the image is resized in the browser to at most 1600 px on its longer side, EXIF rotation is fixed with `createImageBitmap`, location metadata is removed and the size is brought under 1.5 MB by adaptive compression (typically from 4 MB to under 300 KB).
  - **Gemini**: the server sends the image to Google's Gemini 3.8 Flash and extracts the fields with a precise Persian prompt. The user is told before scanning that the image is sent to Google for processing. The remaining scans for today are shown.
  - **Amounts and validation**: amounts printed in rials are converted to tomans. The 16-digit Sayad id, the Shamsi due date and the match between the numeric and the written amount are checked, and the bank is matched to the app's bank list.
  - **Accuracy tools (admin only)**: every field's confidence and mismatch warnings are shown to everyone; the per-field accuracy check (tick/cross), the response time and the model's raw output are for the admin only (the `cheque_scan_debug` beta feature).
  - **Safe prefill**: "fill the cheque form" puts the values into the cheque form and marks low-confidence fields with a yellow border. The cheque's type (received or issued) is always chosen by the user, and the final cheque is saved end-to-end encrypted as usual.
  - **Privacy**: the image, the extracted values and the model's output are **never** stored in the database, KV, disk or logs; the log records only the image size, the duration and success.

## 15. Expenses
- **Two views on one page**: "everyday" (`/expenses`) and "projects" (`/expenses/projects` and `/expenses/:id`).
- **Everyday expenses**: quick entry by category (groceries, restaurants and cafés, transport and fuel, bills and service charges, housing and rent, shopping and clothing, health, education, leisure and travel, internet and subscriptions, gifts and charity, installment payments, investment, other); the title is optional (empty: the category's name).
  - Month-by-month view (Shamsi) with previous/next month; only that month and the one before are fetched from the server.
  - The month's total, a comparison with the previous month (for the current month: the same number of days), the daily average, the top category and a donut by category; filter the list by category.
  - On mobile the list and the add button come before the summary and the chart.
- **Budgets**: a monthly budget for the whole month and for each everyday category (progress bar; yellow from 80%, red with the overspend past 100%), and a total budget for each project.
- **Paid from («پرداخت از»)**: each expense can name the account it was paid from (the last account used is remembered); filter and total per account for the month.
- **Funded by («تأمین از»)**: each expense (everyday or project) can say whether it came from the user's own money or from which unsettled loan; "from loan …" appears next to its title, and each loan's details show "loan usage" (spent, unspent remainder and the latest expenses and purchases). Portfolio purchases also have "funded by", and their cost (quantity × purchase price) is deducted from the loan. For portfolio purchases, today's value, profit/loss and the annual return (simple, over the cost-weighted average holding period; from 30 days up) are shown against the loan's interest rate. A received loan is not counted as income.
- **Custom categories**: «دسته‌ها» on everyday expenses and incomes (and «ویرایش و افزودن دسته» in the forms): new categories with a name, icon and color; rename, recolor, reorder or hide the built-in ones from the pickers. All in one encrypted record (`category_settings`, `api/src/domain/categoryDocument.js`). A removed category isn't wiped from records: they show under «سایر».
- **Shared expenses («دنگ»)**: when the user paid for everyone, «سهم من» makes only their share an expense; the rest is owed back, and what comes back (in pieces, into different accounts, or from a deposit SMS with «دنگ») is recorded on the expense, never as income. «طلب‌های دنگ» shows what is still owed.
- **CSV export** of a month's everyday expenses and of each project (with the user's share, the toman equivalent and the account name).
- **Bank SMS (Android app)**: summary in section 17; a withdrawal SMS becomes an expense, and a deposit SMS an income or a received loan.
- **Expense sections**: each project, trip or job with costs gets a section (name and description); sections appear at the top as cards with their totals, and the selected section stays in the URL (`/expenses/:id`).
- **Tomans or dollars**: title, amount, currency, Shamsi date and note. A dollar expense can carry that day's dollar rate; if left empty, its toman equivalent is computed at today's rate and marked as such.
- **Totals**: the grand total in tomans, the toman and dollar totals separately, the count and the date range; search in title and note; deleting a section with all its expenses (with confirmation).
- **End-to-end encrypted**: sections and expenses are stored only as encrypted vault records (`expense_group` and `expense`); the server sees only each expense's date and section.
- **Availability**: every user (the `expenses` feature). "Paid from" appears once the user has created an account.
- Data model: [EXPENSES.md](EXPENSES.md)

## 16. Accounts
- Bank accounts (bank, logo, last four digits of the card and the account number), cash, e-wallets and other; in tomans or dollars.
- Each account is a card with its everyday spending this month; edit, archive (hidden from the expense form) and delete.
- The source of each expense (everyday or project) is one of these accounts; bank SMS are matched to the right account by bank and the last four digits of the account or card number.
- Encrypted vault record (`bank_account`), the `bank_accounts` feature (every user).

## 17. Android app
- The same web app in an Android shell (Capacitor); every website feature is in the app with the next build. App id `ir.realrate.app`.
- **Download**: the page [realrate.ir/android](https://realrate.ir/android) (install guide and FAQ) and the stable link to the latest version `https://github.com/nos486/realrate/releases/latest/download/realrate.apk`. Each merge into `main` publishes an APK signed with the same key, which installs over the previous one. On Android, the website footer's phone button goes to this page.
- **App shell**: bottom navigation (home · expenses · + · portfolio · more), a + button for "quick add" (expense, income, holding, pending SMS), and "more" for the other sections. The app's home is a personal dashboard: this month's spending and income, the remainder, pending SMS, the latest expenses and today's rates; the market lives under "rates and bubble".
- **Bank SMS**: after one permission grant, every **withdrawal or deposit** SMS from the bank senders (for now Parsian and Blu) notifies and waits on the "SMS" page; "record" fills the expense or income form with the amount (rials → tomans), date, account and note. Older messages are read only on request (24 hours, 7, 30 or 90 days).
  - **Quick record**: a withdrawal up to 1,000,000 tomans is recorded in one tap, without a form, in the category chosen in the app settings.
  - **Automatic recording of small expenses** (optional): withdrawals up to a set limit (500,000 tomans by default) record themselves.
  - **Deposit as a loan**: a deposit can be a received loan (not income): link it to an existing loan, or open the new-loan form with the same amount and date.
  - No SMS is recorded twice; if a recorded expense or income is deleted, "read earlier SMS" brings its message back. "Dismiss" sets a message aside for good.
  - **Privacy**: other messages (one-time passwords, verification codes, ads, balance notices) are dropped on the phone itself; the SMS text is neither stored nor sent off the phone; notifications don't show it.
- **Fingerprint**: unlock the vault with a fingerprint (key in the Android Keystore).
- **Google sign-in** in the phone's browser, with a secure return to the app through a one-time code (PKCE).
- **App feel**: short haptic feedback, dialogs as bottom sheets that close by swiping down, the Android back button.
- Technical details: [ANDROID.md](ANDROID.md); bank SMS templates: [BANK_SMS.md](BANK_SMS.md).

## 18. Offline use and sync
- The Android app keeps an **encrypted** copy of the data on the phone (IndexedDB): lists open instantly from the phone and sync with the server in the background.
- Viewing and recording work without internet: changes wait in a queue and are sent when the connection returns. The "offline" bar shows how many changes are pending.
- Sync is incremental (`GET /api/vault/sync`): only changes since the last sync are fetched, deletions included.
- The phone stores only ciphertext too; the key is only in memory. Signing out clears the phone's copy.
- The website (PWA) also shows the last prices without internet.
