# Expenses — data model

Persian: [../EXPENSES.md](../EXPENSES.md)

## Stage 1

Expense sections (a project, …) and each section's expenses, in tomans or dollars.

### Storage

Everything is an encrypted vault record (`vault_records`); no new Postgres table is needed.

| Record kind (`kind`) | `parent_id` | `record_date` | Encrypted content |
|---|---|---|---|
| `expense_group` | — | Day created | `{ id, name, type, notes, archived, createdAt, updatedAt }` |
| `expense` | Section id | Expense date | `{ id, groupId, title, amount, currency, usdRate, date, notes, category, accountId, loanId, source, bankId, smsFingerprint, smsKey, createdAt, updatedAt }` |

- `currency`: `IRT` (toman) or `USD`. `usdRate`: the dollar rate on the expense's day, in tomans (optional, dollars only).
- `source`: `manual` or `sms`; an expense from an SMS carries the transaction's `bankId`, `smsFingerprint` and `smsKey` so it is never recorded twice ([BANK_SMS.md](BANK_SMS.md)).
- An everyday expense without a title takes its category's name (`validateExpense`).
- Validation and totals: `api/src/domain/expenseDocument.js` (shared by the browser and the server, through `web/src/utils/expenseDocument.js`).
- Browser storage: `web/src/shared/vault/vaultExpenses.js`. Page: `web/src/features/expenses/`.
- Availability: the `expenses` feature in `api/src/config/features.js` — now `ga` (every user). `VAULT_KIND_FEATURES` in `vault.repository.js` ties a feature's record kinds to it; a feature that is off for a user gives 404 (accounts, `bank_accounts`, is `ga` too).

## Stage 2 — everyday expenses (done)

- One section of `type: 'daily'` per user ("everyday expenses"), created with the first everyday expense (`ensureDailyGroup`) and not shown among the projects.
- `category` on each everyday expense, from `DAILY_EXPENSE_CATEGORIES` in `expenseDocument.js` (icon and color: `web/src/features/expenses/constants/expenseCategories.js`). An invalid category isn't stored (`''`, "other" in reports).
- Month-by-month loading: `getExpenses({ parent, from, to })` filters on the plaintext metadata (`parent_id`, `record_date`); the everyday view fetches only the shown month and the one before, and the projects view fetches section by section — so the load stays the same as everyday expenses grow.
- Shared calculations: `summarizeByCategory`, `shamsiMonthRange`, `shiftShamsiMonth`, `shamsiMonthOf`.
- Categories (`value` — label): `groceries` groceries, `dining` restaurants and cafés, `transport` transport and fuel, `bills` bills and service charges, `housing` housing and rent, `shopping` shopping and clothing, `health` health, `education` education, `entertainment` leisure and travel, `subscriptions` internet and subscriptions, `gifts` gifts and charity, `installments` installment payments, `investment` investment, `other` other.
- Later: custom categories.

## Accounts and budgets (done)

- **Accounts** (`bank_account`, the `bank_accounts` feature): `{ id, name, type: bank|cash|wallet|other, bankId, bankName, cardLast4, accountNumber, currency, notes, archived }` — `api/src/domain/accountDocument.js`, page `web/src/features/accounts/`.
- Expense: `accountId` (the account it was paid from).
- Expense: `loanId` ("funded by"; empty = the user's own money). A loan is not income; what it pays for is linked to it with this field, and `api/src/domain/loanFunding.js` computes each loan's usage (spent, remaining, over the principal). The loan's details show "loan usage" and count only expenses from the loan's start date. Portfolio holdings have a `loanId` too (`holdingRecord` in `vaultPortfolioItems.js`); `listAccountHoldings` reads the holdings of every portfolio under the account's vault for this report. For those purchases, `loanInvestmentReturn` gives today's value, the gain and a simple annual return over the cost-weighted holding period (from 30 days up), compared with the loan's rate.
- Budgets: `budget` on a project section (tomans), and `budgets` on the everyday section: `{ total, [category]: amount }` per month.

## Stage 3 — bank SMS and the Android app (done)

The Android app reads bank withdrawal and deposit SMS, extracts the amount, date and bank with each bank's template and asks the user only for the category/title — or records small expenses by itself. Everything stays end-to-end encrypted:

1. **Parsing on the phone**: the bank templates in `domain/bankSmsTemplates.js` (and the engine `domain/bankSms.js`), shared with the app; the SMS text never goes to the server and is not stored.
2. **Encryption on the phone**: the app is the web app; the expense is encrypted with the vault key on the phone and sent with `PUT /api/vault/records/expense/:id`, with `source: 'sms'`, `bankId`, `smsKey` and `accountId` (the account whose bank and last four digits match the SMS). No separate device token was needed: the app uses the user's normal session.
3. **The SMS queue**: unrecorded withdrawals and deposits wait on the phone on the "SMS" page (with a notification); "record" fills the form, "quick record" records without a form, and "automatic recording" records small withdrawals by itself.
4. **No duplicates**: `smsKey` (bank, direction, amount, day and time) is inside the encrypted expense/income, so the vault itself decides what is "recorded" — even from another device or after reinstalling.
5. **Deposit as a loan**: a deposit can be a received loan, not income (linked to an existing loan, or a new loan is recorded with the same amount).

Details: [ANDROID.md](ANDROID.md#bank-sms) and [BANK_SMS.md](BANK_SMS.md).

## Next

- Suggest the category automatically from earlier SMS (and record repeats without asking).
