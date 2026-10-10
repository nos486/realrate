# RealRate features

Every feature in detail. For a summary see the [README](../../README.en.md). Persian: [../FEATURES.md](../FEATURES.md).

---

## 1. Intrinsic value and bubble of gold and coins
- **Raw mathematical value**: the value of a gram of 18k and 24k gold from the world ounce price and the free-market dollar, with the legal weight and standard purity (750 and 999.9).
- **Two bubbles**: against the raw gold value, and against the market's expected price with the union's approved bubble.
- **Official coins**: Emami, Bahar Azadi, half, quarter and gram coins.
- **Smart buy suggestion**: the asset with the lowest bubble is highlighted.
- **Negative bubble and missing prices**: a negative bubble is told apart from items that have no price, without inventing prices.

## 2. Personal home page (rates and bubble — Pro users)
- This page (prices, candle charts and customization) is open only to members of the **Pro** group and to admins (section 21). Anyone else sees what it offers and a «درخواست عضویت در Pro» (request to join Pro) button instead, and the website opens on their portfolio. Prices keep working for everyone in portfolio values, forms and every other section.
- The home page is made of **sections**, and each user decides what they see.
- Any market asset (gold, coin, currency, crypto, stock symbol, fund) can be added to any section.
- Each section uses one of two card styles: **full card** (front: price, change, bubble and intrinsic value for gold and coins, and today's low and high — from the price book, no query; tapped, it turns over to only the candles, with 1 month / 6 months / 1 year buttons — each window fetched when picked, the card locked until it arrives; a tap on the back, the chart included, turns it back) or **compact card** (one list on mobile). Sections saved as «trend» show as full cards.
- **Gold and coin prices from tgju**: 18k gold, the mesghal, the Emami, half, quarter and gerami coins and the coins' bubbles are all read from tgju, every 10 minutes, in one multi-output source («طلا، سکه و حباب (tgju)», `src_def_tgju`) — one request per series, all together — so a coin's price and its tgju bubble come from one place.
- Top bar: search and **customize**. Intrinsic value and bubble always use the live dollar and ounce rates.
- Sections collapse and expand by clicking their title (remembered in the browser).
- **Each card's main figure**: its last price, or its **30-day** or **one-year average** (the mean of the past complete days' closes; a dollar-priced asset's in dollars). The averages are computed once a day on the server and kept in the price book: cards send no request for them. A newer asset says how many recorded days its average is of.
- **A full card's slots**: up to 3 small figures under the price, the user's choice — the asset's own values (averages, day change, intrinsic value, standard price, deviation, bubble percent) or a **linked asset's**: a coin is linked to its bubble (and the bubble to its coin), so a coin's card can show its bubble's price, percent or average. Links are read from the asset specs (`bubbleOf`); a new kind of link is one entry in `ITEM_LINKS`. Until chosen, gold and coins show the bubble analysis (intrinsic value, standard price, deviation). (`utils/cardMetrics.js`)
- **Combined card**: in customize mode, «کارت ترکیبی» (next to adding an asset) builds a card from several assets with a formula. The assets are named x, y, z, w and the formula uses + - * / and parentheses (e.g. a coin's bubble percent `x / (y - x)`, x = the coin's bubble, y = the coin — ready samples for each coin's bubble percent (Emami, half, quarter, gerami) fill it all in; Persian digits and × ÷ − are read too). The value shows as a number or a percent, and the card can show the formula's **highest, lowest and average** over 30 days or a year in its slots (from the chart's series, one request); turned, the card draws the formula's daily chart (the formula of each day's closes, one request for all its assets). The formula is parsed and evaluated, never run as code; prices are the book's toman prices, and the card is kept in the user's own layout. (`utils/cardFormula.js`)
- **Last update**: a full card says when its price was last updated («۳۰ دقیقه پیش», «۱ روز پیش»).
- "Customize" mode: move cards and sections by **drag and drop** (mouse, touch and keyboard), add and remove assets and sections, rename and restyle them, set what a card shows (**card settings**, the gear on each card: its main figure and slots, with each option's current value; «پیش‌فرض» restores the default), and **ready-made presets** (default, gold and coins, currencies and crypto, stocks and funds, summary) from the bottom bar.
- The layout is saved per user on the server and is the same on every device; "default" clears it.
- Overdue and upcoming installments and cheques are summarized in one line (count and total) with expandable details.

## 3. Currency and crypto rates
- Cross rates against the dollar, converted to tomans, for 16 currencies (USD, EUR, AED, TRY, GBP, CAD, AUD, CHF, KWD, QAR, SAR, CNY, RUB, JPY, IQD, AFN).
- Live USDT price and the USDT/dollar spread.
- Ticker at the top switching between 18k gold, dollar and USDT, with the daily change.
- The refresh button at the top (next to the hide-amounts button) reads again only what the open tab shows — the prices on the market tab, the news on the news tab, the records on a records tab; the open tab also updates every time you come back to the app (reopening the Android app after minimizing it, or returning to the browser tab), and on the window getting focus again at most once every 30 seconds. Going back to a tab (from expenses to home, say) also reads its prices and news again (each at most once every 30 seconds; a tab's records load when it opens). Nothing refreshes in the background; a warning with a retry button when a refresh fails or the connection is down. Exchange prices (updated about hourly) are loaded apart, and again only when they changed.

## 4. Stocks and funds
- Dynamic processing of the Tehran Stock Exchange board with no hard-coded symbols.
- Cumulative merge: low-volume symbols are not dropped when a new tick arrives.
- A data explorer in the admin panel for symbols and funds (ETFs).

## 5. Multiple cloud portfolios
- Unlimited portfolios with a switcher and item / transaction counters.
- Grouped by category by default (gold, coin, currency, crypto, stocks, …) with a "holdings mix" donut chart.
- **Custom categories**:
  - Create any number of categories with a name and an icon, per portfolio.
  - Rename, delete (its holdings move to "other", nothing is lost) and reorder categories by drag and drop.
  - Move holdings between categories by dragging or with the "move to category…" menu, fully usable on phones and tablets.
  - An automatic "other (uncategorized)" category for new or uncategorized holdings.
  - Totals, profit/loss, return and the mix chart all follow the custom categories.
  - Stored end-to-end encrypted in the vault; the server never sees the plaintext.
  - "Back to default" resets to the system's fixed categories at any time.
- **Allocation targets**: a target share (%) per category, adding up to 100 («از ترکیب فعلی» starts from today's mix). The «هدف ترکیب پورتفو» card shows a pie of today's mix (targets as an outer ring) and, per category, today's share, the target and the gap (in points and in tomans above or below the target); a category more than 5 points from its target raises a warning (on the page and in the alert center). Targets are stored in the portfolio's encrypted layout and survive custom categories. (`utils/allocationTargets.js`)
- **Risk-tolerance test**: the «آزمون ریسک‌پذیری» card beside the allocation targets (after a test it also shows the profile and the suggested-mix pie) opens a modal: amount at risk (the portfolio's value by default; editable, and typed in when the portfolio is empty) → instructions → 6 questions → result. Each question has a slider from 0 to the amount, with a 50/50 chance and a reward-to-risk ratio of 1.25 to 5, showing the loss accepted and the gain hoped for live. The score is the mean share of the amount the answers risk (0–100); the result is a gauge, one of 5 profiles with a description, and a pie of a suggested mix (fixed income, gold, stocks, crypto) — educational, not investment advice. It is taken per portfolio; only the latest result (no history) is stored, encrypted with that portfolio's key, and «از نو» replaces it. (`utils/riskProfile.js`, record kind `risk_profile`)
- **One list**: each asset is one row with its total quantity, the average buy price of what is left, today's value and profit/loss (open and realized). Tapping a row opens everything recorded for it: manual records and buys with what is left of each, sales and spends with which purchases they took from and their profit/loss; «خرید» and «فروش» for that asset and each entry's edit right there; each entry's notes show in its own row (shortened, the whole text on hover; under it on phones). «+» opens one entry form: «خرید / موجودی» (price and date optional; no price = holding without P&L, no date = opening balance) and «فروش», switching to each other for the same asset. (`utils/assetLedger.js`, `AssetLedgerDetails.jsx`)
- Live profit and loss, Shamsi dates with a "today" button. **CSV export and import**: one row per entry (purchase, holding, sale, expense payment) with what is left of each purchase and each entry's own P&L; import rebuilds purchases and sales (expense payments come from their expenses). Files of older versions still import. (`utils/holdingsCsv.js`)
- **Compare with buying another asset**: when recording a holding you can pick another asset (e.g. gold) and its price on the purchase day; next to the profit/loss the app shows what the same money in that asset would be worth today and how much better or worse this purchase did (separate from "pay / swap with another asset", which records the asset actually paid).
- **Funded by («تأمین از»)**: a purchase can say which unsettled loan paid for it (section 7).
- **Public sharing** with a `/p/:slug` link and an optional password (decrypted custom categories are shown when the link carries the key).
- **Privacy mode** (`****`) hides amounts everywhere.

## 6. Transactions and cost (FIFO)
- There is no separate transactions screen: every entry of an asset (buy/holding, sale, spend) is under that asset, one line each with its date, quantity × price, what is left or «از N خرید», and **its own profit/loss** (a buy: open plus realized from it; a sale or spend: realized). Old `/transactions` links open the portfolio.
- **FIFO**: a sale or spend takes from the oldest entry first (an undated manual record is the opening balance, first in line). From a priced entry it realizes profit/loss; from an unpriced one it only takes the quantity.
- Realized profit/loss on a sale, and a warning when selling more than is held.
- **One ledger per asset**: manual records and transactions are one ledger (per asset and unit). A holding without a buy price counts in the quantity, not in the average or P&L.
- **Paying an expense from a portfolio**: a dollar expense is paid from a portfolio's dollars («پرداخت از» in the expense form, with each portfolio's balance); that day's dollar rate is filled in from the price history and the portfolio gets a «پرداخت هزینه» transaction (P&L against cost, like a sale). Editing or deleting the expense updates or removes its transaction; a spend isn't edited from the portfolio. Toman accounts and loans aren't offered for dollar expenses. (`shared/vault/portfolioFunds.js`)
- **Investing from expenses**: an everyday expense in «سرمایه‌گذاری» can be added to a portfolio («افزودن به پورتفو» in the expense form): the portfolio, the asset (searched among every market asset) and the quantity; the portfolio gets a «buy» at the expense's tomans ÷ quantity (a dollar expense at its day's rate). Editing or deleting the expense moves or removes that buy (`investedIn`).
- **Selling from incomes**: an income in the new «فروش دارایی» category (left out of the totals by default) can be taken out of a portfolio («کم کردن از پورتفو»): the portfolio, one of the assets it holds (with its balance, searchable) and the quantity; the portfolio gets a «sell» at the income's tomans ÷ quantity, taken from the oldest purchases (realized P&L). More than the balance raises a warning. Editing or deleting the income changes or removes that sale (`soldFrom`, `utils/portfolioLink.js`).
- **Paying a credit's debt**: a deposit that pays a bank credit's debt (say an employer's deposit for a company credit) is recorded in the «تسویه بدهی اعتباری» category (left out of the income totals by default), which asks «برای کدام اعتبار»; that much comes off the credit's debt (`creditAccountId`, `api/src/domain/creditAccount.js`).
- In the portfolio these entries read «از هزینه‌ها» / «از درآمدها» and are only edited there; the expense's or income's title is never stored in the portfolio (a share link does not show it).

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
- Incomes and everyday expenses share one design: «monthly / yearly» at the top, with the Shamsi month or year shown (previous, next, back to now).
  - **Monthly**: the month's total, the change against the same days of last month, the daily average and the largest category; a stacked bar chart from the start of the year by category with each month's change against the month before (the month shown highlighted; tapping another month opens it); a donut of the month's categories; the month's list with a category filter above it, search and CSV.
  - **Yearly**: the year's total, monthly average, best month and largest category; the year month by month with the change; a month-by-month table (total, change, share of the year, count — a row opens that month); a donut of the year's categories.
  - Each year is fetched once (the year and the month before it); moving between its months makes no new query.

## 9. Cheques
- **Received** and **issued** cheques: amount, Shamsi due date, drawer or payee, bank (with logo or a custom bank), cheque number, the 16-digit Sayad id and a note.
- One-click **"cleared"** in the list (today's date, undoable).
- **Status tracking** with dated history: pending, in collection, cleared, bounced, transferred and void/returned; add a follow-up note without changing the status.
- Summary: totals of received and issued cheques in progress, the amount due in the next 30 days, the nearest due date and bounced cheques.
- Filter by type and status, search (name, number, Sayad id, note) and CSV export.
- **Home page reminder** for overdue cheques and those due in 7 days.
- Cheques and their tracking history are end-to-end encrypted.

## 10. Account-wide end-to-end encryption (E2EE)
- **Mandatory for every account**: all portfolios, transactions, loans, incomes, cheques, expenses and accounts are encrypted on the user's device (browser or app).
- A new user creates an encryption passphrase first; an older account without encryption sees a banner and cannot save anything until it turns encryption on.
- The passphrase is never sent to the server; the server only keeps ciphertext.
- Lock/unlock in one place and change the passphrase without re-encrypting data; encryption cannot be turned off. The Android app also unlocks with a fingerprint.
- **Forgotten passphrase**: it cannot be recovered; "forgot your encryption passphrase?" deletes all financial data after a confirmation (typing «حذف همه اطلاعات» and the sign-in password) so the user can start over with a new passphrase. The account and the home layout stay.
- A shared encrypted portfolio's link carries that portfolio's key in the `#k=` fragment.
- Technical details: [E2EE_VAULT.md](E2EE_VAULT.md)

## 11. Price sources (code-first)
- Every adapter returns the same shape: `{ items: [{ id, name, price }], datetime }`.
- A display engine shared by server and client (`displayEngine.js`) for names, units, categories and icons.
- Each source's items are stored under one key (Workers KV), with one price book, and one polling tick without duplicate requests.
- Three kinds of source, read from the config alone: single, multi-output (`outputs: "multi"`) and catalog (`isCatalog`); a symbol a catalog fetch leaves out keeps its last price.
- Each source is fetched on its own interval (`fetchIntervalSec`), one interval after its last try — a failing source isn't retried every minute; the endpoint's real error is recorded.
- The admin's price sources page: a status summary, two groups ("base rates: gold, currency, coins" and "multi-output feeds"), and for each source its status and last error, fetch interval, last and next fetch, when it turns stale, quote, kind, adapter, category, jump guard, endpoint and its price or a preview of its items.
- Actions: on/off, choosing the primary source, "test" (a dry run, nothing kept), "fetch now", and a feed's full item list with search (no manual editing).

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
> Switched off for now (`DEMO_ENABLED` in `api/src/config/constants.js` and `web/src/shared/routes.js`): no way in is shown, the demo sign-in is refused and open demo sessions end. Set both to `true` to turn it back on.

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
  - **Privacy**: the image, the extracted values and the model's output are **never** stored in the database, disk or logs; the log records only the image size, the duration and success.

## 15. Expenses
- **Two separate sections**: "expenses" (`/expenses`, everyday spending) and "projects" with its own menu entry and page (`/projects` and `/projects/:id`); old `/expenses/projects` and `/expenses/:id` links move to the new address.
- **Everyday expenses**: quick entry by category (groceries, restaurants and cafés, transport and fuel, bills and service charges, housing and rent, shopping and clothing, health, education, leisure and travel, internet and subscriptions, gifts and charity, installment payments, investment, other); the title is optional (empty: the category's name).
  - Month-by-month view (Shamsi) with previous/next month; only that month and the one before are fetched from the server.
  - The month's total, a comparison with the previous month (for the current month: the same number of days), the daily average, the top category and a donut by category; filter the list by category.
  - On mobile the list and the add button come before the summary and the chart.
- **Budgets**: a monthly budget for the whole month and for each everyday category (progress bar; yellow from 80%, red with the overspend past 100%), and a total budget for each project.
- **A project's expenses in dollars**: a toman expense in a project asks for the dollar's rate on its day (optional; filled in from the price history). Under each expense «≈ X dollars · today Y tomans (±%)», and the project's «به دلار» card with the dollar total and what it all costs today; expenses without a rate are counted apart. (`expenseDollarValue`, `summarizeDollarValue` in `expenseDocument.js`)
- **Tags on project expenses**: several tags per expense (e.g. «مصالح», «دستمزد»), the project's earlier tags offered. The «برچسب‌ها» card beside the list sums each tag (the user's share, in tomans) and, for its expenses with a day rate, their dollars and what they cost today; tapping a tag shows only its expenses. Tags are searchable and in the CSV. (`normalizeTags`, `summarizeByTag`)
- **Paid from («پرداخت از»)**: each expense can name the account it was paid from (the last account used is remembered); filter and total per account for the month.
- **Funded by («تأمین از»)**: each expense (everyday or project) can say whether it came from the user's own money or from which unsettled loan; "from loan …" appears next to its title, and each loan's details show "loan usage" (spent, unspent remainder and the latest expenses and purchases). Portfolio purchases also have "funded by", and their cost (quantity × purchase price) is deducted from the loan. For portfolio purchases, today's value, profit/loss and the annual return (simple, over the cost-weighted average holding period; from 30 days up) are shown against the loan's interest rate. A received loan is not counted as income.
- **Custom categories**: «دسته‌ها» on everyday expenses and incomes (and «ویرایش و افزودن دسته» in the forms): new categories with a name, icon and color; rename, recolor, reorder or hide the built-in ones from the pickers. All in one encrypted record (`category_settings`, `api/src/domain/categoryDocument.js`). A removed category isn't wiped from records: they show under «سایر».
- **Categories left out of the totals**: any category can be left out of the totals (Σ in «دسته‌ها»): its records stay listed with a «خارج از جمع» badge but are not counted in the month's total, the comparison, the average, the total budget, the charts or the home page; their sums show separately. «مدیریت نقدینگی» (expense and income: moving money between your own accounts) and expense «سرمایه‌گذاری» are left out by default; investment returns still count as income. The «خارج از جمع» button beside the list hides or shows them (remembered in this browser). Transfers between accounts are still recorded on their own. (`splitByExclusion`, `splitCounted`)
- **Shared expenses («دنگ»)**: when the user paid for everyone, «سهم من» makes only their share an expense; the rest is owed back, and what comes back (in pieces, into different accounts, or from a deposit SMS with «دنگ») is recorded on the expense, never as income. «طلب‌های دنگ» shows what is still owed.
- **CSV export** of a month's everyday expenses and of each project: amount paid and the user's share, what others paid back and still owe, currency and rate, toman equivalent, the account, what funded it (a loan or a portfolio's dollars), recorded from SMS, and the note. (`features/expenses/utils/expenseCsv.js`)
- **Bank SMS (Android app)**: summary in section 17; a withdrawal SMS becomes an expense, and a deposit SMS an income or a received loan.
- **Expense sections**: each project, trip or job with costs gets a section (name and description); sections appear at the top as cards with their totals, and the selected section stays in the URL (`/expenses/:id`).
- **Tomans or dollars**: title, amount, currency, Shamsi date and note. A dollar expense can carry that day's dollar rate; if left empty, its toman equivalent is computed at today's rate and marked as such.
- **Totals**: the grand total in tomans, the toman and dollar totals separately, the count and the date range; search in title and note; deleting a section with all its expenses (with confirmation).
- **End-to-end encrypted**: sections and expenses are stored only as encrypted vault records (`expense_group` and `expense`); the server sees only each expense's date and section.
- **Availability**: every user (the `expenses` feature). "Paid from" appears once the user has created an account.
- Data model: [EXPENSES.md](EXPENSES.md)

## 16. Accounts
- Bank accounts (bank, logo, last four digits of the card and the account number), bank credits, cash, e-wallets and other; in tomans or dollars.
- Each account is a card with its everyday spending this month; edit, archive (hidden from the expense form) and delete.
- The source of each expense (everyday or project) is one of these accounts; bank SMS are matched to the right account by bank and the last four digits of the account or card number.
- **Transfers between accounts (cash management)**: moving money between your own accounts (card to card to your other account, a cash withdrawal, topping up a wallet) is neither spending nor income and is kept out of their totals. From the accounts page (or the app's +): from, to, amount, an optional fee, day and note; each month's transfers, and each account's money in and out on its card. In the SMS inbox, «انتقال بین حساب‌های خودم» on a withdrawal or a deposit: the other side's message (same amount, within a day) is found and dropped too. In a new income or everyday expense, choosing «مدیریت نقدینگی» offers «ثبت به‌صورت انتقال» (the amount, day and note carry over to the transfer form, which asks for the from and to accounts); when the other account isn't in the app, the excluded income or expense is still recorded. (`api/src/domain/transferDocument.js`)
- **Bank credit** (account type «اعتبار بانکی», e.g. a 100M purchase credit): credits follow different rules (a fixed pay day, a period from the first purchase, a fee or none), so the app assumes none and everything is entered by hand: only the limit, the debt already owed when it is added and the date to count from.
  - **A deposit that pays it**: an income in «تسویه بدهی اعتباری» that names this credit comes off its debt.
  - **Spending from the credit**: an expense paid from it — counted as an expense on the day of the purchase, and owed. Cash taken out of it (a transfer from it) is owed too.
  - **«تسویه بدهی»**: the debt settled and what was actually paid (say 10M and 10.2M); the settlement fee is worked out and shown as you type (200,000 tomans, 2%). The payment is a transfer into the credit with that fee on it (never a second expense), and the fee an expense of its own, category «کارمزد و سود اعتبار».
  - **«تبدیل به قسط»**: an amount of the debt and its installments, each with its own day and amount — as the bank set them; «ساخت ردیف‌ها» fills monthly rows from a count, the first due day and one amount, then each row can be changed, removed or added. The installments' fee (their total less the amount, with its percent) is shown as you type and recorded with the plan (an expense charged to the credit itself, so the debt equals the installments' total). Each installment is paid with «پرداخت» on its row and marked paid; a plan (with its fee) can be undone.
  - **The credit's card**: the debt, a bar of the limit used (free and limit), the debt outside installments with «تسویه بدهی» and «تبدیل به قسط», overdue installments, each plan with its amount, total and fee and each installment's status, the next installment, and the fees paid. (`api/src/domain/creditAccount.js`)
- Encrypted vault records (`bank_account`, `transfer`), the `bank_accounts` feature (every user).

## 17. Android app
- The same web app in an Android shell (Capacitor); every website feature is in the app with the next build. App id `ir.realrate.app`.
- **Download**: the page [realrate.geekio.org/android](https://realrate.geekio.org/android) (install guide and FAQ) and the stable link to the latest version `https://github.com/nos486/realrate/releases/latest/download/realrate.apk`. Each merge into `main` publishes an APK signed with the same key, which installs over the previous one. On Android, the website footer's phone button goes to this page.
- **App shell**: bottom navigation (home · expenses · + · incomes · more; the portfolio is under «بیشتر»), a + button for "quick add" (expense, income, holding, pending SMS), and "more" for the other sections. The app's home is a personal dashboard: this month's spending and income, the remainder, pending SMS, the latest expenses and today's rates; the market lives under "rates and bubble".
- **Bank SMS**: after one permission grant, every **withdrawal or deposit** SMS from the bank senders (for now Parsian and Blu) notifies and waits on the "SMS" page; "record" fills the expense or income form with the amount (rials → tomans), date, account and note. Older messages are read only on request (24 hours, 7, 30 or 90 days).
  - **Record into a project**: from a withdrawal's «⋮» menu, pick an expense project; that project's expense form opens titled «برداشت <bank>» with the SMS's amount and date.
  - **Choosing banks**: in the app settings each bank has an on/off switch (all on by default); a bank turned off is neither read nor notified, and its waiting messages leave the inbox.
  - **«رد»** sits beside each message's main button (not in the «⋮» menu).
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

## 19. Alerts and notifications
- **One system for all**: overdue and upcoming installments, past-due and upcoming cheques, portfolio drift from targets, selling more than held, a new app version and the site announcement share one shape (source, severity critical / warning / info, title, items, amount, due date, action). (`api/src/domain/alerts.js`, `web/src/shared/alerts`)
- **The «هشدارها» bell** in the header (site and app) with a counter (red when something is critical) and the list of every alert; each page also shows its own section's alerts, with one look.
- **Dismissing**: a critical alert hides until tomorrow, the others until something new joins them (another overdue installment).
- **Daily email reminders**: a minimal plaintext reminder index (`vault_reminders`) on the server for loan installments, cheques and subscription renewals without exposing titles, amounts or counterparties. Automated digest sent daily at 08:00 Asia/Tehran according to user-selected lead days (7, 3, 1, or due date; each sent on its own) and overdue installments and cheques. Per-item mute toggle supported.
- **Android local notifications**: on-device local notifications scheduled inexactly at 09:00 morning of chosen lead days and due date, with full details (title, counterparty, and optional amount) without sending notification content to the server.
- **Sealed Web Push (PWA & Desktop)**: zero-knowledge browser push notifications for web/PWA users. Payloads are encrypted on the device using a non-extractable 256-bit AES-GCM key stored in IndexedDB, and forwarded opaque to push services at 09:00 Asia/Tehran. Decrypted locally by the service worker (`sw.js`). See [ALERTS.md](../ALERTS.md).
- **Logout** cancels the phone's scheduled due notifications and this browser's push subscription (with its key), so a shared device gets nothing of the previous account.

## 20. Full backup and files
- **Full backup** (account settings): everything in one file — portfolios with all their entries, categories and targets; loans with paid installments and extra payments; incomes, cheques, expense sections and expenses with their shares, accounts and transfers, the user's categories, custom banks and the home page.
- An optional password encrypts the whole file; without one it is readable.
- **Restore** (the same account or another): each record comes back with its id (existing ones replaced, others added; nothing deleted). A portfolio or custom bank that is missing is created and the records that point at it follow. (`shared/vault/fullBackup.js`)
- In the Android app exported files (CSV and backups) go to Android's share sheet to save or send (`FileExportPlugin.java`).

## 21. User groups and feature access
- The admin puts users in **groups**, and a feature can be open only to the members of some groups. The **Pro** group exists from the start (a system group, can't be deleted), and the **rates and bubble** page (feature `market`) is open only to it by default.
- **Join requests**: a user without the feature sees what it offers and the groups that open it instead; when a group accepts requests, they ask to join with one button (and can take it back). Once the admin approves, the feature opens when they come back to the app or reload the page.
- **Admin panel → groups and access** (`/admin/groups`):
  - Pending requests, with approve (adds the member) or reject.
  - Create, edit and delete groups (a fixed English key, name, description, whether it accepts requests). A system group, or one a feature's access depends on, can't be deleted.
  - Each group's members: search, add by email, remove.
  - **Feature access**: for each feature off, admins only, or users — all of them or only the chosen groups — and back to the code's default. A change takes effect on the server at once.
  - Each user's details also add them to or take them out of groups with one tap.
- **Enforced on the server**: the server checks each feature's rule itself (`404` for someone without it). For `market`: the home page's layout (`/api/user/home-layout`) and the cards' charts (`/api/sparklines`). Admins have everything; so does the demo account, to show everything.
- Any section (cheques or loans, say) can later be given to some groups only by declaring a feature in `api/src/config/features.js` and using this panel — [ARCHITECTURE.md](../ARCHITECTURE.md#3-feature-flags-and-user-groups).

## 22. Subscriptions
- **Every subscription on one page** (`/subscriptions`): Netflix, ChatGPT, Filimo, internet, the gym… with a name, a category (video, music, software and AI, cloud, internet and SIM, gaming, education, fitness, membership, other), the cost of each period in **tomans or dollars**, how often it renews (monthly, quarterly, half-yearly, yearly), its start (the first payment), an optional end, the account it is paid from, a site and a note.
- **Renewing by itself or by hand**: one that renews by itself always has the first renewal on or after today as its next one (every cycle on the same Shamsi day of the month, clamped to shorter months). One renewed by hand has a «valid until» day; recording its payment moves it a cycle on (paid after it ran out, the new period starts on the payment day), and once that day passes it shows as run out.
- **Monthly total**: every running subscription counts as its monthly equivalent (cost ÷ months in its cycle), dollar ones in tomans at today's dollar rate (their dollar part shown apart); plus a year of it, what renews this Shamsi month, the nearest renewal and a breakdown by category. Paused, cancelled, ended or run-out subscriptions are not counted.
- **Record a payment**: an everyday expense in «اینترنت و اشتراک‌ها», in the subscription's currency and from its account, linked to it (`subscriptionId`); the last payment shows on its card.
- **Pause, cancel and reactivate**; cancelled and ended ones are hidden until shown.
- **Reminders before each renewal** (can be turned off per subscription): alerts in the bell and on the page for renewals in the next 7 days and for subscriptions that ran out, Android notifications and browser push (on the lead days in the settings), and the daily email (the «تمدید اشتراک‌ها» source in the email reminder settings). One that renews by itself is never overdue.
- Subscriptions are end-to-end encrypted like the other financial data (kind `subscription` in `vault_records`); for reminders the server sees only the next renewal day and the cycle, never the name or the amount. They are in the full backup too. (`api/src/domain/subscriptionDocument.js`, `web/src/features/subscriptions`)
