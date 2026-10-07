# Account-wide end-to-end encryption (E2EE)

Persian: [../E2EE_VAULT.md](../E2EE_VAULT.md)

End-to-end encryption is **mandatory for every account** and encrypts all financial data before it is sent:
portfolios (holdings, transactions and custom categories), loans (with installments and extra payments), incomes (with fixed-income rules), cheques (with their tracking history), expenses and their sections, and accounts.
The Android app encrypts on the phone in the same way, and its offline copy is ciphertext too.
The server stores only ciphertext and the passphrase never leaves the device.

> [!CAUTION]
> **The passphrase cannot be recovered.** If it is forgotten, the encrypted data is lost for good.

**Mandatory** (`api/src/lib/encryptionGate.js`):
- A **new user** (with no data) sees the "one step to start" screen before anything else and must create an encryption passphrase (`VaultSetupScreen`). `GET /api/vault` returns `hasPlaintextData` for an account without encryption.
- An **older user without encryption** sees a banner that can't be closed; until encryption is turned on from the settings, the server refuses every save or edit with `403 ENCRYPTION_REQUIRED`. Reading and deleting existing data still work, and turning encryption on encrypts all of it.
- The plaintext loan, income, fixed-income and cheque routes **never** write (with encryption on: `409 VAULT_ENABLED`).
- Encryption **can't be turned off**: `DELETE /api/vault` and the restore route are refused with `403 ENCRYPTION_MANDATORY`, and a portfolio can't go back to plaintext. Only the passphrase can be changed.

---

## 1. Key hierarchy

```text
passphrase ──PBKDF2 (SHA-256, 100,000 rounds, random salt)──▶ KEK
KEK ──unwraps──▶ account data key (random, 256-bit)           ← on the server only wrapped
account data key ──unwraps──▶ each portfolio's key (random, 256-bit)  ← wrapped on the portfolio
account data key ──encrypts──▶ loan, income, fixed-income, cheque, expense, expense-section and account records
portfolio key ──encrypts──▶ that portfolio's holdings, transactions and categories
```

- Everything is `AES-GCM-256` with a random 12-byte IV, in the format `enc:e2ee:v1:<Base64(IV + CipherText + Tag)>`.
- **Changing the passphrase** only re-wraps the account data key with the new KEK; no data is re-encrypted.
- AES-GCM is authenticated: a wrong passphrase never yields a "wrong but valid" key; unwrapping fails.
- **A separate key per portfolio** lets one portfolio be shared without exposing anything else.

Code: `web/src/lib/e2ee.js` (primitives) and `web/src/shared/vault/` (state, migration, storage).

## 2. What the server stores

| Data | Storage |
| :--- | :--- |
| Salt and the wrapped data key | Table `user_vaults` (a row = encryption on) |
| Loans, incomes, cheques, holdings, transactions, portfolio categories, expense sections, expenses and accounts | Table `vault_records`: the encrypted `payload`, plus `record_date` (the main date, plaintext) and `parent_id` (the portfolio for holdings, transactions and portfolio categories; the section for expenses) |
| Portfolio key | `portfolios.e2ee_wrapped_key` |

**Standard:** everything is encrypted except **one main date** per record, so the server can search and filter by date range:

| Kind | Plaintext date (`record_date`) |
| :--- | :--- |
| Income | Date received |
| Cheque | Due date |
| Loan | Date the loan was received |
| Portfolio holding | Purchase date |
| Portfolio transaction | Transaction date (Shamsi converted to Gregorian) |
| Portfolio categories (`portfolio_layout`) | None (empty) |
| Risk-tolerance result (`risk_profile`, one per portfolio) | None (empty) |
| Expense section (`expense_group`) | Day created |
| Expense (`expense`) | Expense date |
| Account (`bank_account`) | Day created |

Holdings, transactions and custom portfolio categories are encrypted with **that portfolio's key** (not the account key), so a share link that carries the portfolio key in `#k=` still works and shows the decrypted custom categories. Rows still in the old tables (`portfolio_holdings` and `transactions`) move to `vault_records` the first time the portfolio is opened; each move deletes the old row in the same server batch.

`GET /api/vault/records/:kind?from=YYYY-MM-DD&to=YYYY-MM-DD&parent=...&order=desc&limit=20&offset=0` filters, sorts and pages on this metadata only. The incomes and transactions pages make **one** query per period (a year by default), and the same result builds both the 20-row list and the totals and charts; nothing is fetched twice or outside the period. Because amounts are encrypted, totals and charts (including the monthly income chart) are computed in the browser from that period's records, never from more than the period, and search or filters on encrypted fields (like the transaction type) also run in the browser on the same period. Portfolio holdings need the whole transaction history, so the full history is read only for the holdings page and the stock check in the sell form.

Records whose date is empty or not yet Gregorian (`?undated=1`) are found once per tab before the first period query and saved again with the same ciphertext and the right date (no re-encryption); others are fixed whenever they are read.

**Not encrypted:** these dates, portfolio names, custom bank names, record counts and created/updated times.

The server accepts no plaintext data: without encryption `403`, and with encryption on, creating a plaintext loan, income, cheque or portfolio is `409` (so an old version of the app can't leak data).

### Incremental sync (the app's offline copy)

- Deleting a record leaves a "tombstone" in `vault_tombstones` (deleting a portfolio does so for its holdings and transactions too); saving the same record again removes it. Tombstones older than 180 days are deleted.
- `GET /api/vault/sync?cursor=` returns every change after the cursor, ordered by `(updated_at, kind, id)`, a page at a time: saved records (the same ciphertext) and deletions. The index `idx_vault_records_updated` keeps this fast for any number of users and records (only new changes are read, never all the data).
- `epoch` = the vault's creation time; if it changes (e.g. the demo account is reset) or `reset` comes back, the device clears its copy and syncs from scratch.
- The server still only sees and returns ciphertext.

## 3. Loan calculations in the browser

The server can't compute on encrypted data, so for encrypted accounts every loan operation runs in the browser:

- Each loan is a "document": `{ loan, states, extraPayments }`, stored as one encrypted record.
- The engine `api/src/domain/loanDocument.js` (shared with the web app) applies the same rules as `loans.repository.js` to the document.
- `loanApi.js`, `incomeApi.js` and `chequeApi.js` (in `features/`) keep a fixed signature and route to the encrypted stores (`shared/vault/vaultLoans.js`, `vaultIncomes.js`, `vaultCheques.js`; expenses and accounts use `vaultExpenses.js` and `vaultAccounts.js`).
- Cheques validate with the same `api/src/domain/chequeDocument.js` either way.
- **A parity test** (`tests/unit/loanDocument.test.js`) runs the same scenarios on the server and the engine; the results must match installment by installment.

## 4. Turning encryption on

**Enabling** (`encryptAccountData`):
1. A data key is created, wrapped with the passphrase and saved in `user_vaults`.
2. Each plain portfolio gets a new key; the flag and the wrapped key are saved **first**, then its holdings and transactions are encrypted.
3. Each loan (the raw document from `GET /api/loans/:id/document`), income and cheque is encrypted and saved; the server deletes the plaintext row in **the same batch**.

Every step can be repeated; if it stops half-way, running it again finishes the job, and the "unencrypted items" section in the settings shows what is left.

There is no way back once enabled: no data ever returns to the plaintext tables.

## 5. Older portfolios with their own passphrase

Portfolios encrypted earlier with their own passphrase (`e2ee_salt` and `e2ee_verifier`) **keep working unchanged**.
When account encryption is turned on, that portfolio's key (derived from its old passphrase) is wrapped with the account key; **its holdings and transactions are not touched**.
The old passphrase is tried from: the new account passphrase, a passphrase opened in the same tab, or one the user types in the settings.
Until then the portfolio opens with its own passphrase.

## 6. Session and lock

- After unlocking, the data key is kept in the tab's `sessionStorage` so a refresh doesn't ask again; closing the tab, "lock" or signing out clears it.
- **Fingerprint (Android app)**: the unlocked data key (not the passphrase) is encrypted with an Android Keystore key that works only right after a fingerprint check (`BiometricVaultPlugin`, `shared/native/biometricUnlock.js`). Changing the passphrase, another account, or a change to the phone's fingerprints invalidates it — see [ANDROID.md](ANDROID.md#fingerprint).
- While locked, pages show an unlock card and no data is loaded into memory.

### Forgotten passphrase: reset

The encryption passphrase is stored nowhere and can't be recovered. Someone who forgot it starts over from "account settings → end-to-end encryption → forgot your encryption passphrase?" (or "forgot the passphrase?" on the unlock card) (`VaultResetSection.jsx`):

- The list of what will be deleted is shown; the user types «حذف همه اطلاعات» ("delete all data") and, if the account has a sign-in password, enters it too (checked by the server as well, rate limited).
- `POST /api/vault/reset` deletes the vault and **all** of the user's financial data in one batch: portfolios, holdings, transactions, loans (with installments and extra payments), incomes, fixed incomes, cheques, custom banks, encrypted records and tombstones. The account, sign-in and home layout stay. Not allowed for the demo account.
- The browser clears the key, the phone's offline copy and the fingerprint, and starts again at the encryption setup screen with a new passphrase.
- Other devices: each record is saved with `vaultEpoch` (the creation time of the vault whose key encrypted it); after a reset, a save with the old key is refused (`409 VAULT_CHANGED`, or `VAULT_DISABLED` until a new vault exists) and that tab reloads the vault. Devices rebuild their offline copy from the new `epoch`.

## 7. Sharing an encrypted portfolio

The share link carries that portfolio's key in the `#k=...` fragment. Browsers never send the fragment to the server;
the public page `/p/:slug` reads the key from the link and decrypts the data in the viewer's browser.
Without the full link nothing is shown.

## 8. The demo account and public encryption

For the demo account (the public demo for visitors) the E2EE vault is kept intact, so the server's encryption gate, the client layer and the encrypted data model all work with no special or unsafe paths:
- The demo data isn't confidential, so **the demo vault's passphrase is public**.
- The server returns it only in the auth response of demo sessions (`/api/auth/me`), never to regular sessions.
- The frontend opens the demo vault automatically with it (`unlockVault(demoVaultPassphrase)`); no passphrase prompt, and the vault setup or lock banners are hidden for demo users.
- While the admin edits the demo, if the vault doesn't exist yet it is created with the same public passphrase (`createVault(demoVaultPassphrase)`).
- When the admin returns to their own account, the demo vault is reset and locked, and all its keys and encrypted data are cleared from memory and `sessionStorage`.

## 9. API

Details in [API.md](../API.md#end-to-end-encryption-vault-protected).

## 10. AI cheque scanning

- **One-time, unencrypted processing**: cheque scanning sends the cheque image once, unencrypted (`multipart/form-data`), to `POST /api/cheques/scan`, and the server sends it to Gemini (Google) to read. The user is told this before scanning.
- **Explicit exemption in the encryption gate (`encryptionGate.js`)**: the endpoint only processes and is stateless — it **stores nothing on the server or in the database** — so it is explicitly exempted from the ciphertext requirement (`path === '/api/cheques/scan'`).
- **No image or text storage**: the uploaded image and the model's output are never stored in any database, cloud storage or log.
- **The saved cheque stays confidential**: the extracted values only prefill the cheque form in the browser. The user reviews and edits them and chooses the cheque type. On save, the cheque is end-to-end encrypted (AES-GCM-256) with the vault key like any other and its ciphertext goes to `vault_records`. The server has no access to the final cheque data.
