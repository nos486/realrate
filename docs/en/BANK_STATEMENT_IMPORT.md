# Mobile-bank statement import — file format and adding a bank

On the Accounts page, a bank account's "import from mobile bank" button reads the bank's Excel statement and, after the user reviews and fixes it, records the rows as expenses, incomes and transfers. Parsian only for now. The feature `statement_import` is Pro. Everything runs on the device: the file never goes to the server and the records are encrypted like any other.

| File | What it is |
|---|---|
| `api/src/domain/bankStatementTemplates.js` | Data: each bank's columns and rules, the transaction kinds with their default categories, keywords. **Adding a bank only changes this file** |
| `api/src/domain/bankStatement.js` | Engine: row reading, kind detection, grouping, questions, the final plan, record building |
| `api/src/domain/statementLinks.js` | Suggests links of a row to a cheque, a loan installment or a subscription |
| `web/src/shared/import/xlsxReader.js` | Dependency-free xlsx reader |
| `web/src/features/accounts/statement-import/` | UI: questions, review, saving, undo |

## Steps

1. **Read**: amounts are rials (÷10 = tomans), dates are Shamsi with a time. The first matching rule gives a row its kind (purchase, bill, card transfer, Paya, Satna, loan installment, fee, ...). Running balances are checked and mismatches reported.
2. **Group**: rows with the same counterparty (e.g. 10 deposits from one account) become one group asked once: "what are these? salary? which category?". Expenses under the threshold (default 2,000,000 toman) are proposed together as "running costs"; large ones are asked separately. Leaving a question unanswered accepts the guess from the description.
3. **Category priority**: single-row fix, group answer, confident suggestion, small-expense rule, "other".
4. **Review**: every row with its category and amount is shown before saving and can be edited or excluded. Duplicates (import key, SMS key, or same day and amount) are skipped; reversed purchases are not recorded. The user's own name, card and account are learned so transfers between their accounts become transfers.
5. **Links**: a cheque by number, a loan installment by amount and due date, a subscription by unique amount are suggested and act like a manual record (`recordLinks`).
6. **Save**: in chunks of 100 with progress; "undo" right after the import deletes everything that import saved.

## Record origin

Imported expenses and incomes carry `source: 'import'` and an `importKey`, and show an "imported" badge in the tables (`shared/ui/recordOrigin.js`: manual, import, SMS, system, linked to loan/subscription/cheque).

## Adding a bank

Add a row to `STATEMENT_BANKS`: `columns`, `directionWords`, `unit`, `howTo` and ordered `rules`. The engine and UI stay unchanged. Synthetic sample rows: `api/tests/helpers/parsianRows.js`.
