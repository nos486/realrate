# Bank SMS — the template standard and adding a bank

Persian: [../BANK_SMS.md](../BANK_SMS.md)

A bank transaction SMS (withdrawal or deposit) becomes a standard transaction so it can be recorded as an expense (withdrawal) or an income (deposit). The Android app reads the messages automatically; everything happens on the phone and the SMS text is never sent to the server.

| File | What it is |
|---|---|
| `api/src/domain/bankSms.js` | The engine: normalizes the text, runs the templates, converts dates and amounts, matches the account. Knows nothing about any particular bank |
| `api/src/domain/bankSmsTemplates.js` | The data: each bank's SMS templates. **Adding a bank changes only this file** |
| `api/tests/unit/bankSms.test.js` | Real sample messages of each bank (`SAMPLES`) |
| `web/src/shared/native/smsInbox.js` | Android app: reads the bank senders' (`senders`) messages from the phone's inbox — [ANDROID.md](ANDROID.md) |

Both modules are also in `web/src/utils/` through symlinks (like the other domain modules).

## Reading a message

1. **Normalize** (`normalizeSmsText`): Persian/Arabic digits → ASCII, «ي/ك» → «ی/ک», remove invisible direction marks (RLM, …), «٬» → «,», trim each line and drop empty lines; lines are joined with `\n`.
2. **Pick the bank**: when the sender is known (the Android app), the templates of the banks whose `senders` include it; otherwise all banks. Senders are compared normalized (`normalizeSender`, the same in Java): a number without the Iranian prefixes; a name in lower case without spaces, dots, dashes or underscores — «Bank Shahr», «BankShahr» and «BANK-SHAHR» are one sender. The Android app reads only messages from the banks' senders, so this matters there.
3. **Templates in order**: the first `pattern` that matches the whole text wins.
4. **Named groups** of the regex become the transaction.

## Template

```js
{
  bankId: 'parsian',              // the bank's standard id (api/src/config/banks.config.js)
  senders: ['+98...'],            // sender numbers/names (optional; for the Android app)
  templates: [
    {
      id: 'parsian-balance',      // unique, prefixed with the bankId
      unit: 'rial',               // the amount's unit in the SMS: 'rial' (default) or 'toman'
      direction: 'sign',          // the transaction's direction (below)
      pattern: re(String.raw`^...$`),  // on the whole normalized text; ^ and $ required
    },
  ],
}
```

### Named groups

| Group | Required | Meaning |
|---|---|---|
| `amount` | ✅ | The amount with separators; the sign may be before or after (`397,500-`, `-397,500`) |
| `balance` | | The balance after the transaction |
| `account` | | The account number (digits, masked allowed); its last 4 digits match the account |
| `card` | | The card number (usually masked); its last 4 digits are kept |
| `date` | | Shamsi date: `MM/DD`, `YY/MM/DD` or `YYYY/MM/DD` (separators `/` `-` `.`, or none: `MMDD`, `YYMMDD`, `YYYYMMDD`). Without a year: the nearest such day up to today |
| `time` | | `HH:MM` |
| `kind` | | The transaction word (withdrawal/deposit/purchase …) for a word-based `direction` |
| `desc` | | Free text (shop, terminal, …) |

Ready-made pieces in `P` in the same file: `P.amount`, `P.balance`, `P.date`, `P.time`, `P.digits`.

### Direction (`direction`)

- `'sign'` (default): from the amount's sign; `-` withdrawal, `+` deposit. No sign → the message isn't read.
- `'debit'` or `'credit'`: fixed (a template that is only for withdrawals).
- `{ debit: ['برداشت', 'خرید'], credit: ['واریز'] }`: from the word in the `kind` group.

### Output (`BankSmsTransaction`)

`{ bankId, templateId, direction: 'debit'|'credit', amount /* tomans */, balance /* tomans or null */, account, accountLast4, cardLast4, date /* Gregorian YYYY-MM-DD */, time, description, fingerprint }`

- Amounts are always **tomans** (rials ÷ 10).
- `fingerprint`: a hash of the normalized text (the same message).
- `key` (`smsTransactionKey`): "bank|direction|toman amount|day|time" — the same transaction, however it is worded. An expense or income recorded from an SMS keeps it in `smsKey` (encrypted); the SMS page removes a message whose key is recorded (even from another device or after reinstalling), and marks one with a manual expense/income of the same day and amount as "probably recorded".
- `matchSmsAccount(tx, accounts)`: the user's account with the same bank and the same last 4 digits of the account or card number; otherwise, if the user has only one account at that bank, that one.

## Adding a bank

1. Collect a few real messages from the bank (withdrawal, deposit, card purchase, …); change the digits and names but **don't touch the shape of the text**.
2. Write one template per shape in `bankSmsTemplates.js`. Example — a message like:
   ```
   بانک نمونه
   برداشت: 1,250,000
   کارت: 6037***1234
   1405/07/06-14:49
   ```
   ```js
   {
     bankId: 'sample',
     senders: [],
     templates: [{
       id: 'sample-card',
       direction: { debit: ['برداشت', 'خرید'], credit: ['واریز'] },
       pattern: re(String.raw`^بانک نمونه\n(?<kind>برداشت|واریز|خرید)\s?:\s?(?<amount>${P.amount})\nکارت\s?:\s?(?<card>${P.digits})\n(?<date>${P.date})-(?<time>${P.time})$`),
     }],
   }
   ```
3. Add the samples to `SAMPLES` in `api/tests/unit/bankSms.test.js`, with the fields that must be read. The tests check that each bank has at least one sample, each template has `^…$` and an `amount` group, and ids are unique.
4. `npm test --workspace=api`.

Tips:
- Write the regex for the **normalized** text (ASCII digits, no extra spaces, one line each).
- Put `\s?` where spaces may vary (spacing around `:` differs between phones).
- Put the more specific template first; the first template that matches wins.
- The Android app runs the same patterns in Java too (`BankSmsRules.java`) so only withdrawal/deposit messages notify and reach the app. So use only syntax common to JS and Java (named groups `(?<name>…)`, `\d`, `\s`, `[^\n]`, quantifiers); not `\p{…}` or JS-only flags. A template Java can't compile is ignored on the phone.

## Supported banks

| Bank | Templates |
|---|---|
| Parsian | Sender `PARSIANBANK`; `parsian-balance` — account number, signed amount, balance, date `MM/DD`, time |
| Blu | Sender `+989999987641`; `blu-balance` — «برداشت پول / واریز پول» (direction from the word), amount and balance in rials, time, date `YYYY.MM.DD` |
| Pasargad | Sender `B.Pasargad`; `pasargad-balance` — dotted account number, signed amount (rials), `MM/DD_HH:MM`, «مانده» |
| Shahr | Sender `Bank Shahr` (or `Shahr Bank`, in any spacing); an interest deposit («سود») becomes an income titled «سود …» in «سود سرمایه‌گذاری»; `shahr-balance` — «*بانک شهر*», an optional description (e.g. «سود»), «واریز به / برداشت از:» account, amount and balance in rials, `YYYY/MM/D HH:MM:SS` |
| Mellat | Sender `Bank Mellat`; `mellat-balance` — «حساب…», «واریز/برداشت…» amount (rials), «مانده…», `YY/MM/DD-HH:MM` |
| Resalat | Sender `ResalatBank`; `resalat-balance` — the same shape as Pasargad's (the sender tells them apart): dotted account number, signed amount (rials), `MM/DD_HH:MM`, «مانده» |
| Mehr Iran | Sender `B.QMEHRIRAN`; `mehr-iran-balance` — account number, amount with the sign after it (rials), `YYYY/M/D-HH:MM`, «مانده» |
| Tejarat | Sender `TejaratBank`; `tejarat-balance` — «*بانک تجارت*», «حساب:», «برداشت/واریز:» amount in rials, optional «از طریق:» (the description), «مانده:» in rials, `YYYY/MM/DD` and the time on the next line |
| Melli | Sender `700717`; `melli-balance` — «بانک ملی ایران», the transaction kind (برداشت/انتقال/پایا/خریداینترنتی …, the description) with a signed amount (rials), «حساب:», «مانده:», `MMDD-HH:MM` |
| Khavarmianeh | Sender `KH M BANK`; `khavarmianeh-balance` — «بانک خاورمیانه», account `branch/account`, signed amount (rials), `MM/DD` and the time on the next line, «مانده», optional description on the last line |
