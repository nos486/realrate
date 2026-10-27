# Design standard: colors and layout

Persian: [../DESIGN.md](../DESIGN.md)

Every page uses **one** set of semantic colors, defined in `web/src/styles/tokens.css`. Each color has one meaning and that meaning is the same on every page; pages never write hex colors directly.

## Semantic colors

| Token | Color | Meaning | Example |
| :--- | :--- | :--- | :--- |
| `--color-primary` | Blue | The main action, the active tab, focus, links and informational notes | The "add …" button, the next installment |
| `--color-positive` | Green | Money in, profit, paid / cleared / done | Income, a purchase, a paid installment |
| `--color-negative` | Red | Loss, overdue, errors and destructive actions | Loss, an overdue installment, a sale, delete |
| `--color-warning` | Amber | Due soon, attention | An installment due in a few days |
| `--color-brand` | Gold | Never a state: each page's main number, the logo and Pro | The portfolio's total value |

Each color has these shades:

- base (`--color-*`): icon and border. A filled control (a button) uses `--color-primary-fill`, which carries white text at 5.9:1.
- `-text`: text on a dark surface.
- tints by strength: `-faint` (6%), `-soft` (12%, badges, chips and alerts), `-tint` (20%, their hover or selected state), `-border` (30%) and `-border-strong` (45%).

A state is never told by color alone: a change carries ▲ / ▼ or + / −, and a due date a clock (soon) or a warning (overdue) icon. An amount owed stays neutral; its badge says how urgent it is.

Text uses the classes `.text-positive`, `.text-negative`, `.text-warning` and `.text-accent`.

**Everything else is neutral:** amounts that are neither in nor out, labels and descriptions use `--text-primary`, `--text-secondary` and `--text-muted`.

**Categorical colors** (charts, asset categories and income sources) come only from the palette in `web/src/shared/ui/chartColors.js` (`CHART_COLORS`, eight hues and a gray "Other"; in CSS `--cat-1` … `--cat-8`, `--cat-other`) and don't carry the meanings above. Their only job is to tell one category from another, so they keep away from green, red, amber and gold, and every pair stays apart for color-blind readers. A chart whose series mean money in / out (income vs. expense) uses `CHART_SEMANTIC` instead. Users' own expense and income category colors are their choice and stay as they are.

## Scales

Every size comes from a token, and `api/tests/unit/designTokens.test.js` fails on a raw value:

- **Surfaces:** four opaque steps, `--surface-0` (the page) to `--surface-3` (hover, the selected row); a card is `--surface-1`, a card inside it `--surface-2`.
- **Type:** `--fs-xs` 11 · `--fs-sm` 12 · `--fs-base` 13 · `--fs-md` 14 · `--fs-lg` 16 · `--fs-xl` 19 · `--fs-2xl` 24 · `--fs-3xl` 30. Three weights: 400 text, 600 labels and titles, 700 numbers that matter.
- **Radii:** `--radius-xs` 4 (bars) · `--radius-sm` 8 (chips, icons) · `--radius-md` 12 (buttons, inputs, rows) · `--radius-lg` 16 (cards, modals) · `--radius-xl` 20 (sheets). Inside a padded box the inner radius is the outer one minus the padding.
- **Colors:** no hex outside `tokens.css`; the raw `rgba()` left in each file may only go down.
- **States:** one keyboard focus ring (`--focus-ring`) on every control; hover changes color only, never lifts an element; disabled is 45% opacity.

## Look: minimal and flat

- **No shadows or glows:** no outer `box-shadow`, no colored glow, no `text-shadow`, no `drop-shadow`. Surfaces are separated by borders. There are no shadow tokens.
- **Card inside a card:** a card inside another (like each loan inside its bank group) uses `--card-inner-bg` and `--card-inner-border`, one step lighter than the outer card, so layers separate without shadows. Its hover only lightens the background and border a little.
- **Row cards:** a record that runs over time (a loan, a subscription) is one full-width row, `RowCard` (`shared/ui/RowCard.jsx`, `styles/row-card.css`): icon, title, a line under it and a badge (`RowCardBadge`); then columns of figures (`RowCardBlock`), one a growing progress bar (`RowCardProgress`); then the icon actions (`RowCardAction`, the rest in a «⋮» `ActionMenu`). Tones are the semantic ones (`warning`, `positive`, `negative`, `primary`, `muted`). A new list of such records uses it rather than a card of its own.
- **Entry forms (expense, income, portfolio, loan, cheque, subscription and account):** one order and one set of parts in `shared/form/` (`styles/entry-form.css`): the amount first and large, its currency beside it and the amount in words under it (`AmountField`); the categories as icon tiles in the category's own color (`CategoryGrid`, recently used first); the day with «امروز / دیروز / روز دیگر» (`DateField`); choices that rarely change (account, project, cheque, loan) as a row showing what is chosen that opens when tapped (`PickerRow`); two- or three-way choices as `FilterPills` with `variant="segmented"`; and the rarely needed under «جزئیات بیشتر» (`MoreDetails`). The footer is «ثبت و بعدی» on a new entry and «انصراف» on an edit (`EntryFormActions`). An amount that isn't money (an asset's quantity in grams, coins or shares) is an `AmountField` with its own `unit`. A new entry form is built from these parts, not from rows of pill buttons.
- **Buttons:** the shared `Button` (`primary`, `secondary`, `ghost`, `danger`; `sm` 32px, `md` 40px, `lg` 44px). Every confirm button is the blue primary, never green or gold: green means money in, not "press".
- **Exception:** `box-shadow` is used only for rings acting as borders (`inset 0 0 0 1px` or `0 0 0 Npx`) and the focus ring of form fields.
- **No gradients:** buttons and numbers are one color.

## Layout

- **Each page's main button** (add / create) is always the shared `Button` component and blue, both in the page header and in the empty state.
- **Each view's tools** in the portfolio (search, export, import and holdings settings; the transactions' period) sit in the same row as the "holdings / transactions" tabs.
- **A card around a list:** a list that is itself made of cards (bank groups in loans, holding groups in the portfolio) isn't put inside another card. For that, `portfolio-table-card is-plain` is transparent with no padding. A plain table (incomes, transactions, cheques) stays inside a card.
- **Due-date warnings** appear only where they belong:
  - overdue installments: on home and the loans page.
  - cheques: on home.

  The price update status also appears only on home and the portfolio.
- **Waiting on the server:** a write on its way (`FullscreenLoader`) and a newly opened tab still waiting for its data (`TabLoadingGate`) show the same `BlockingOverlay` (`shared/ui/BlockingOverlay.jsx`, `styles/loading.css`): a loader in the middle of the screen that takes every tap, key and scroll, so nothing behind it can be opened or sent again. The tab's loader shows only when its data takes longer than 300 ms; a read with no answer gives up after 20 s (`READ_TIMEOUT_MS`), which lets it go.
- **In the Android app** (`styles/app-shell.css`): dialogs open as bottom sheets that close by swiping down, forms have even footer buttons, and on phones lists come before the summary cards and charts.
