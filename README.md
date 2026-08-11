# RealRate 🪙
### Iranian Gold & Currency Price Calculator (Cloudflare Worker)

**RealRate** is a full-stack, edge-computing application built for Cloudflare Workers that calculates real-time prices for Iranian gold items, coins, and foreign currencies based on manual USD/Toman input and automatic global gold spot price fetching.

---

## ✨ Key Features

- **⚡ Edge Computation**: Single-file Cloudflare Worker architecture running on edge nodes worldwide.
- **🌐 Automatic Global Gold Spot Price**: Auto-fetches live XAU/USD gold spot price from public APIs while keeping the field 100% manually editable.
- **💵 Manual USD/Toman Input**: Enter the daily free-market dollar rate in Toman.
- **✨ Complete Iranian Gold Suite**:
  - **طلا ۱۸ عیار** (18K Gold per gram)
  - **طلا ۲۴ عیار** (24K Gold per gram)
  - **مثقال طلا (مظنه ۱۷ عیار)** (Standard Tehran retail benchmark)
  - **مثقال ۲۴ عیار**
- **🪙 Bahar Azadi Coins with Intrinsic vs Bubble Analysis**:
  - **تمام سکه امامی** (Full Coin - 8.133g 22K)
  - **نیم سکه** (Half Coin - 4.066g 22K)
  - **ربع سکه** (Quarter Coin - 2.033g 22K)
  - Calculates pure gold intrinsic value (ارزش ذاتی) vs market price (قیمت روز با حباب).
- **💶 Foreign Currencies via USD Cross-Rates**:
  - Euro (EUR), Emirates Dirham (AED), Turkish Lira (TRY), British Pound (GBP), Canadian Dollar (CAD).
- **💎 Jewelry Purchasing Calculator (محاسبه‌گر اجرت و خرید طلا)**:
  - Calculate total payable price including weight, labor wage %, shop profit %, and VAT tax on wage/profit.
- **🎈 Coin Bubble Estimator**:
  - Interactive sliders to adjust daily market bubble % (0% to 50%).
- **🔄 Reverse Budget Calculator (محاسبه‌گر معکوس)**:
  - Input budget in Toman to calculate equivalent gold grams, coins, or USD.
- **📲 Telegram/WhatsApp Announcement Copying**:
  - One-click copy formatted text report ready to post to financial channels.

---

## 🛠️ Project Structure

```
realrate/
├── src/
│   └── index.js         # Main Cloudflare Worker API & Embedded UI
├── wrangler.toml        # Cloudflare Worker deployment config
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Local Development
```bash
npm install
npm run dev
```
Open `http://localhost:8787` in your browser.

### Deployment to Cloudflare Workers
```bash
npm run deploy
```

---

## 🌐 API Endpoints

- `GET /` — Serves the glassmorphic Persian web interface.
- `GET /api/calculate` — JSON calculation endpoint.
  - Parameters: `usd_toman`, `gold_usd`, `bubble_full`, `bubble_half`, `bubble_quarter`.
- `GET /api/rates` — Fetches live gold spot price and currency cross-rates.

---

## 📄 License
MIT License.
