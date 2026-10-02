# Alerts and notifications

Everything in RealRate that wants the user's attention is an **alert**, with one shape, one store,
and one look. The goal: adding a new kind of alert, or a new way to deliver it (email), touches one
place.

## The shape — `api/src/domain/alerts.js` (shared with the web app as `web/src/utils/alerts.js`)

```js
{
  id: 'loan:overdue',          // stable: what it is about
  source: 'loan',              // ALERT_SOURCES: loan, cheque, budget, portfolio, app, system
  severity: 'critical',        // critical | warning | info
  title: '۲ قسط معوق',
  message: '…',                // optional
  items: [{ key, title, detail, amount }],   // optional: what it is made of
  amount: 7000000,             // tomans; the items' sum when not given
  dueDate: '2026-09-28',       // the earliest date it concerns
  action: { label: 'مشاهده و تسویه', path: '/loans/l1' },  // a route, or '#app-update'
  scope: 'pf_1',               // optional: narrows it to one page (a portfolio)
}
```

`createAlert()` validates, `compareAlerts()` orders (most severe, then earliest due),
`alertFingerprint()` is the id plus severity plus item keys: what a dismissal hides and what an
email is sent once for.

## Raising alerts — `web/src/shared/alerts/alertRules.js`

Pure functions from data to alerts: `loanAlerts`, `chequeAlerts`, `portfolioAlerts`. They run in
the browser because the data is end-to-end encrypted (the server cannot read it).

They are published to the store by:
- `AppAlertSources.jsx` (mounted once in `MainPage`): loans, cheques, the app update, the
  announcement
- the page that holds the data: `HoldingsView` publishes its portfolio's drift and deficit
  (`portfolio:<id>`)

## The store — `alertStore.js`

- `setSourceAlerts(key, alerts)` / `useAlertSource(key, alerts)`: a source's latest list replaces
  the previous one, and stays after its page closes (so the bell still shows it).
- `useAlerts({ sources, scope, includeDismissed })`: what the UI reads.
- `dismissAlert(alert)`: hides the alert's fingerprint in this browser. A critical alert is hidden
  until tomorrow, the others for 30 days or until their fingerprint changes.
- `clearAlerts()`: called on sign out.

## Showing alerts

- `AlertCenter.jsx`: the bell in `Header` and in the app's top bar, with a counter and a panel that
  lists every alert (dismissed ones dimmed).
- `AlertStack.jsx`: banners for some sources on the page they concern:
  - home: loans and cheques
  - loans page: loans
  - cheques page: cheques
  - portfolio: its own alerts
  - top of the page: the announcement

Transient feedback ("saved", "failed") is not an alert: it stays a toast (`FeedbackProvider`).

## Delivery channels — `alertChannels.js`

- **In the app**: always. These are the bell and the banners.
- **Email**: prepared, not enabled yet.
  - `selectForEmail(alerts, prefs, sent)` picks the critical alerts whose source may be emailed
    (`ALERT_SOURCES[source].email`: loans, cheques), from the sources the user chose, and not
    already sent.
  - `buildEmailDigest(alerts, { includeAmounts })` writes the subject and text. Amounts are left
    out unless the user allows them.
  - `deliverAlerts()` runs after every change and remembers the fingerprints it sent.

### Enabling email later

1. Add a server endpoint, for example `POST /api/alerts/email`. It should:
   - accept `{ subject, text }` from the signed-in user only
   - rate-limit
   - send to the account's verified email
2. In `alertChannels.js`, set `EMAIL_CHANNEL.available = true` and make `send` call that endpoint.
3. Add the settings UI over `getEmailPrefs()` / `setEmailPrefs()`: on/off, sources, amounts.
   Consider moving the prefs into an encrypted vault record so they follow the account.
4. Reminders while the app is closed need the browser or phone to run the rules. Options:
   - Android: a background job runs the same rules
   - the user opts in to storing a minimal plaintext schedule (due dates only) on the server

   That is a privacy decision to make explicitly.

## Adding a new kind of alert

1. If it is a new source, add it to `ALERT_SOURCES`.
2. Write a pure rule in `alertRules.js`, and test it in `api/tests/unit/alerts.test.jsx`.
3. Publish it with `useAlertSource(key, alerts)` where the data is loaded.
4. Show it on its page with `<AlertStack sources={[...]} />`. The bell lists it automatically.
