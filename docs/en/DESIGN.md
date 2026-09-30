# Design standard: colors and layout

Persian: [../DESIGN.md](../DESIGN.md)

Every page uses **one** set of semantic colors, defined in `web/src/styles/tokens.css`. Each color has one meaning and that meaning is the same on every page; pages never write hex colors directly.

## Semantic colors

| Token | Color | Meaning | Example |
| :--- | :--- | :--- | :--- |
| `--color-primary` | Blue | The main action, the active tab, focus, links and informational notes | The "add …" button, the next installment |
| `--color-positive` | Green | Money in, profit, paid / cleared / done | Income, a purchase, a paid installment |
| `--color-negative` | Red | Loss, overdue, errors and destructive actions | Loss, an overdue installment, a sale, delete |
| `--color-warning` | Amber / gold | Remaining debt, due soon, attention — and the brand color for each page's main number | Remaining debt, the portfolio's total value |

Each color has four shades:

- base (`--color-*`): background, icon and border.
- `-text`: text on a dark surface.
- `-soft`: a faint background for badges, chips and alerts.
- `-border`: their border.

Text uses the classes `.text-positive`, `.text-negative`, `.text-warning` and `.text-accent`.

**Everything else is neutral:** amounts that are neither in nor out, labels and descriptions use `--text-primary`, `--text-secondary` and `--text-muted`.

**Categorical colors** (charts, asset categories and income sources) come only from the palette in `web/src/shared/ui/chartColors.js` and don't carry the meanings above. Their only job is to tell one category from another.

## Look: minimal and flat

- **No shadows or glows:** no outer `box-shadow`, no colored glow, no `text-shadow`, no `drop-shadow`. Surfaces are separated by borders. The shadow tokens (`--card-shadow`, `--primary-glow`, `--shadow-*`) are `none`.
- **Card inside a card:** a card inside another (like each loan inside its bank group) uses `--card-inner-bg` and `--card-inner-border`, one step lighter than the outer card, so layers separate without shadows. Its hover only lightens the background and border a little.
- **Exception:** `box-shadow` is used only for rings acting as borders (`inset 0 0 0 1px` or `0 0 0 Npx`) and the focus ring of form fields.
- **No gradients:** buttons and numbers are one color. `--primary-gradient` and `--gold-gradient` are both a plain color, so a page's main number and the other gold values are exactly the same color.

## Layout

- **Each page's main button** (add / create) is always the shared `Button` component and blue, both in the page header and in the empty state.
- **Each view's tools** in the portfolio (search, export, import and holdings settings; the transactions' period) sit in the same row as the "holdings / transactions" tabs.
- **A card around a list:** a list that is itself made of cards (bank groups in loans, holding groups in the portfolio) isn't put inside another card. For that, `portfolio-table-card is-plain` is transparent with no padding. A plain table (incomes, transactions, cheques) stays inside a card.
- **Due-date warnings** appear only where they belong:
  - overdue installments: on home and the loans page.
  - cheques: on home.

  The price update status also appears only on home and the portfolio.
- **In the Android app** (`styles/app-shell.css`): dialogs open as bottom sheets that close by swiping down, forms have even footer buttons, and on phones lists come before the summary cards and charts.
