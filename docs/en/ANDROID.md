# Android app

Persian: [../ANDROID.md](../ANDROID.md)

The Android app is the same web app (`web/`) packaged in an Android shell (`web/android`) with [Capacitor](https://capacitorjs.com). Every new website feature is in the app with the next build; only native abilities (like reading SMS) have their own Android code.

## Structure

| Path | What it is |
|---|---|
| `web/capacitor.config.json` | App id (`ir.realrate.app`), name, status bar color and splash |
| `web/android/` | The Android project (Gradle). Icons in `app/src/main/res/mipmap-*` |
| `web/src/shared/native/nativeApp.js` | What differs in the app: no service worker, colors, share links to the website, Google sign-in |
| `api/src/lib/appAuth.js` | Google sign-in from the app (one-time code) |
| `.github/workflows/android.yml` | Automatic APK builds |

- The app's pages load from the phone (not from the website): fast, offline, and the encryption code is exactly what shipped with the app. Their origin is `https://localhost`, which the API accepts.
- A guest in the app doesn't see the landing page and goes straight to sign-in.
- Android's status and navigation bars stay visible and the page sits between them: the app build (`vite build --mode app`) removes `viewport-fit=cover` from `index.html`, otherwise Capacitor draws the page under the status bar (Android 15+).
- **App shell** (`web/src/shared/app/`, styles in `styles/app-shell.css`, app only — class `is-native-app` on `<html>`):
  - Bottom bar: **home · expenses · (+) · incomes · more** (the portfolio is under «بیشتر»). Instead of the website's header and drawer, the app's top bar has the section's title and the hide-amounts and lock buttons. No footer.
  - **+** opens a "quick add" bottom sheet (expense, income, portfolio holding, pending SMS). The form opens on its section's page with `?add=expense|income|holding` (and `cheque` for direct links; `loan` from a deposit SMS) (`useQuickAddParam`).
  - **More**: the other sections (from the same `navItems` as the site, so a section the user doesn't have doesn't appear) and sign-out / lock / hide amounts.
  - **Home** in the app is the user's own dashboard (`features/home/AppHomeDashboard.jsx`): this month's spending and income, pending SMS, the latest expenses, today's rates. The market ("rates and bubble") is at `/rates`, under "more". The dollar-rate bar only shows on home and the market.
  - Touch feel: a short vibration (`@capacitor/haptics`, `shared/native/haptics.js`), buttons that press in on touch, a soft entry for each section, no text selection on buttons.
  - Preview in the browser during development: `?app=1` (only `vite dev`; `?app=0` goes back).
- Android's back button walks the page history (closing dialogs and menus as on the site — `useBackToClose`); on the home page it exits the app.

## Google sign-in in the app

Google doesn't allow sign-in inside a WebView, so sign-in happens in the phone's browser and returns through the app's own link. Because any app can register the same link, what comes back isn't a session but a one-time code that only works with a secret the app holds (PKCE):

1. The app keeps a random `verifier` and sends `app_challenge = base64url(SHA-256(verifier))` to `/api/auth/google/login`.
2. After Google, the server creates a two-minute one-time code (table `auth_tokens`, `purpose = app_signin:<challenge>`) and redirects to `ir.realrate.app://auth?code=…` (or `?auth_error=…`).
3. The app gives the code and the `verifier` to `POST /api/auth/app/signin` and receives a session.

Email and password sign-in works as on the site. Email links (verification, password reset) go to the website, not to the app's `localhost`.

## Building the APK

### Automatic (GitHub Actions)

- Every merge into `main`: a signed release APK (when the signing key is configured) is published in the repository's **Releases** (`v1.0.<run number>`, asset `realrate.apk`), with release notes holding only this release's changes: the lines added to `CHANGELOG.md` since the previous release (or, with none, the commit subjects since then) — `.github/scripts/release-notes.mjs`. The stable link to the latest version, for direct download on a phone: `https://github.com/nos486/realrate/releases/latest/download/realrate.apk`
- Versioning: `versionCode` = the Actions run number, `versionName` = `1.0.<number>`; each build installs over the previous one.

### Signing key (once)

Release APKs must always be signed with **the same key**; otherwise a new version won't install over the old one. Create the key and **keep it safe** (losing it means publishing the app under a new id):

```bash
keytool -genkeypair -v -keystore realrate-release.jks -alias realrate \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 realrate-release.jks   # output = ANDROID_KEYSTORE_BASE64
```

In GitHub: Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The key file, base64 |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | `realrate` |
| `ANDROID_KEY_PASSWORD` | The key password |

### On your own machine

Needs Node 22, JDK 21, Android Studio (or the Android SDK with platform 36).

```bash
npm ci
cd web
npm run android:sync          # web build into dist-app + copy into the Android project
npx cap open android          # open in Android Studio (Run on a phone)
# or without Android Studio:
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

## Distribution

- **Download page**: [realrate.ir/android](https://realrate.ir/android) — a static page of the website (`STATIC_PAGES.android` in `web/src/seo/pages.js`, built by `scripts/build-seo.mjs`, with `MobileApplication` and `FAQPage` JSON-LD): a download button for the latest release, install steps, permissions and an FAQ. On Android, the website footer's phone button goes to this page, and the landing page links it.
- **Google Play Protect**: because the app is distributed outside Google Play and asks for `READ_SMS`, Play Protect may warn when installing ("hasn't seen this app before"). Users install with "more details → install anyway"; to remove the warning, ask Google for a review through the "Play Protect appeals" form (package name `ir.realrate.app`, the APK link and the SHA-256 fingerprint of the signing certificate).
- **Knowing the app's users**: each app request carries `X-RealRate-Client: android/<version>`, and the admin panel shows active app users, each user's version and how many users are on each version ([FEATURES.md](FEATURES.md), section 12). The version is set by `VITE_APP_VERSION` at build time.

- **Automatic updates**: every time the app opens and every time it comes back (even when a newer version is already known, since an even newer one may be out) the app asks `GET /api/app/latest` for the latest release (the server reads GitHub and keeps it in Postgres for 5 minutes; `api/src/handlers/appUpdateRoutes.js`). When the release's version (from its `v<versionName>` tag) is newer than the installed one, a «نسخه‌ی … آماده است» banner shows at the top, and tapping it opens the «نسخه‌ی جدید» prompt with the CHANGELOG notes; «به‌روزرسانی» asks once more and downloads the newest APK inside the app (`AppUpdatePlugin.java`, with progress), checks it is this app and newer, and opens Android's installer. Android asks once for "install unknown apps" (`REQUEST_INSTALL_PACKAGES`) and installs only an APK signed with the same key, over the app (data is kept). the banner's × hides it until the app opens again; in the app settings the automatic check can be turned off, and «بررسی به‌روزرسانی» checks right away. App side: `web/src/shared/native/appUpdate.js`.

## App settings (app only)

The "app settings" page (`/app-settings`, `web/src/features/app-settings/`) appears in the menu only inside the app.

### Bank SMS

| File | What it is |
|---|---|
| `web/android/.../BankSmsPlugin.java` | The `BankSms` plugin: inbox messages that are **withdrawals and deposits from bank senders only** (`rules`) and newer than `since`; `configure` sets up the receiver; the `smsReceived` event |
| `web/android/.../BankSmsRules.java` | Recognizes withdrawals/deposits on the phone itself: the same patterns as `bankSmsTemplates.js` (`nativeSmsRules` in `bankSms.js`) on text normalized like `normalizeSmsText` |
| `web/android/.../BankSmsReceiver.java` | Incoming messages (even with the app closed): only for a **withdrawal or deposit** (`BankSmsRules`), a **notification** "new deposit or withdrawal — tap to record" that opens the app on the "SMS" page (`ir.realrate.app://sms-inbox`) |
| `web/src/shared/native/smsInbox.js` | Reads, parses with `bankSms.js`, and keeps withdrawals and deposits **on the phone** until recorded or dismissed |
| `web/src/features/sms-inbox/` | The separate **"SMS"** page (`/sms`, app only): messages waiting to be recorded, the enable card until permission is granted, and "read earlier SMS" |

- **Fully automatic**, on by default: permission for SMS and notifications is granted once (the "record automatically from bank SMS" card on the SMS page, or the app settings). **Only messages arriving from then on** are read (`startedAt`):
  - each bank SMS → a notification; if the app is open it is read right away (a few seconds later, once the SMS app has stored it)
  - opening the app and each return to it → messages since the last read (with an hour of overlap, but never before `startedAt`)
- **Reading earlier messages** only on the user's request, on the SMS page: 24 hours, 7, 30 or 90 days, at once.
- **No duplicates**: a message is recognized by its text (`fingerprint`) and by its transaction (`key`: bank, direction, amount, day and time). Dismissed ones ("dismiss", or "this deposit is a loan") are remembered on the phone forever (`dismissSms`). Recorded ones keep the key inside the expense/income (`smsKey`), so the vault itself is the source of truth: automatic reads don't bring them back, but "read earlier SMS" (with the vault open) reads them again and sets aside only those whose record still exists — **if an expense or income is deleted, its SMS comes back when read again** (`recheckRecorded`, `features/sms-inbox/recordedCheck.js`). A manual expense/income of the same day, amount and kind also counts as recorded and its SMS leaves the queue.
- **Only withdrawals and deposits**: the phone checks every message from a bank sender against that bank's patterns; others (balance notices, ads, …) neither notify nor reach the app. The patterns come from `configure`/`read`, so adding a bank is still only `bankSmsTemplates.js` — but the pattern must also be valid in Java (named groups, the usual classes and quantifiers).
- **Withdrawals and deposits** reach the inbox. "Record" fills the expense form (withdrawal) or income form (deposit) with the amount, date, account and note (`features/sms-inbox/smsDrafts.js`); "dismiss" sets the message aside. A recorded or dismissed message (by `fingerprint`) doesn't come back.
- **Deposit as a loan**: each deposit has a "loan" button — a loan is not income. Either pick an unsettled loan (the message leaves without recording income), or "record a new loan with this amount" opens the loans page with `?add=loan&amount&date&bank&sms` and the message leaves once the loan is saved (`features/sms-inbox/LoanDepositSheet.jsx`).
- **Quick record**: each withdrawal up to 1,000,000 tomans (`QUICK_RECORD_MAX`) has a "quick record" button that records an everyday expense without a form, in the category chosen in the app settings (`recordCategory`, "other" by default) (`features/sms-inbox/smsRecord.js`).
- **Automatic recording of small expenses** (app settings → SMS, off by default): each pending withdrawal up to `autoRecordMax` (500,000 tomans by default) records itself in the same category — whenever the vault is open and the queue changes (`useSmsAutoRecord`). Before that, recorded ones (by `smsKey`, or a manual one of the same day and amount) leave the queue so nothing is recorded twice.
- There is no manual SMS entry; everything is read from the phone itself.
- **Privacy and one-time passwords**:
  - Dynamic passwords, one-time passwords and verification/sign-in codes — even from the bank's own sender — are dropped in the Android code (`BankSmsPlugin.isSensitive`): they neither notify nor reach the app's pages. The same list in `bankSms.js` (`isSensitiveSms`) is a second layer.
  - Notifications don't show the message text ("new deposit or withdrawal — tap to record", `VISIBILITY_PRIVATE`).
  - The message text isn't stored: the queue keeps only what was read (amount, date, …).
  - The enable card explains all this before permission is asked.
- The SMS text is never sent to the server; the recorded expense or income is encrypted like everything else.
- Permissions: `READ_SMS` and `RECEIVE_SMS`, and `POST_NOTIFICATIONS` (Android 13+). Publishing on Google Play needs the "SMS and Call Log permissions" declaration with the "SMS-based money management" use; Cafe Bazaar and Myket have no such form.

### Fingerprint

| File | What it is |
|---|---|
| `web/android/.../BiometricVaultPlugin.java` | The `BiometricVault` plugin: encrypts a secret with an AES key in the Android Keystore that works **only right after a fingerprint check** (BIOMETRIC_STRONG) and is invalidated when the phone's fingerprints change |
| `web/src/shared/native/biometricUnlock.js` | Enabling/disabling and unlocking the vault |

- After unlocking the vault with the passphrase, turning on the fingerprint gives `BiometricVault` the **unlocked data key** (not the passphrase) (`getVaultUnlockSecret` in `vaultStore.js`).
- The "your data is encrypted" card has a "fingerprint" button and asks for it by itself once per app launch.
- The key is tied to the account and the current wrapping: another account, a passphrase change, or a change to the phone's fingerprints → unlock once with the passphrase and enable it again. Signing out clears it.

## Offline and fast loading

| File | What it is |
|---|---|
| `web/src/shared/offline/localStore.js` | The phone's copy of the encrypted records (IndexedDB, one database per user): records, the queue of offline changes (`outbox`) and `meta` (vault, cursor, epoch) |
| `web/src/shared/offline/offlineSync.js` | Sync: first send the queue, then page through `GET /api/vault/sync` |
| `web/src/shared/vault/vaultApi.js` | Each request: read from the phone's copy, or with no connection keep and queue the change |
| `web/src/shared/offline/OfflineBar.jsx` | The "offline" bar at the top (site and app) with the number of pending changes |

- Only on in the app (`configureOffline({ isEnabled: isNativeApp })` in `vaultStore.js`). The phone keeps only **ciphertext** and simple metadata (date, parent) — the same as the server; the vault key is only in memory.
- **Reads**: after the first sync, lists are read from the phone (same filters and order as the server, `filterRecords`) and synced in the background; when changes arrive, `VAULT_CHANGED_EVENT` makes pages read again.
- **Writes**: go to the server first; only with no connection (network error, 502/503/504) are they saved on the phone and queued. Recording from SMS works offline the same way. Real server errors (validation, …) are shown as before.
- **Sync**: on launch, when the connection returns, on return to the app, after an offline change and every 3 minutes; while offline, the connection is tested every 15 seconds. A queued change the server refuses is dropped and reported, and the phone's copy is rebuilt. A new epoch (account reset) or `reset` rebuilds the copy.
- The vault (salt + wrapped key) is kept too so it opens without internet. Signing out clears the database.

## Next steps

1. Suggest the category automatically from earlier SMS (and record repeats without asking).
2. Update the web part without a new release (OTA), with signature checks on the bundle.
