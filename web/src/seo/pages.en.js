/**
 * web/src/seo/pages.en.js
 * English version of the SEO landing pages, metadata, and structured content.
 * Mirrors web/src/seo/pages.js (same slugs, keys, order and counts) with natural English copy.
 * Pure ESM module — zero React or browser dependencies.
 */

import { DEMO_ENABLED } from '../shared/routes.js';

export const SITE = {
  origin: 'https://realrate.geekio.org',
  name: 'RealRate',
  nameFa: 'RealRate',
  slogan: 'Intrinsic value analysis of gold and coins, plus personal finance management',
  description: 'An independent, end-to-end encrypted platform for analyzing the intrinsic value and bubble of gold and coins, and managing multi-asset portfolios, loans and income — completely free and open source.',
  ogImage: 'https://realrate.geekio.org/og/default.png',
};

const ALL_FEATURE_PAGES = [
  {
    slug: 'gold-coin-bubble',
    title: 'Gold and Coin Bubble and Intrinsic Value | RealRate',
    description: 'Calculate the intrinsic value of gold and the bubble on Bahar Azadi and Emami coins from the global ounce and the dollar, free of artificial market pricing.',
    h1: 'Intrinsic Value Analysis and True Bubble Calculation for Gold and Coins',
    intro: 'In volatile markets, the quoted price rarely reflects the pure value of gold. A significant share of what you pay is a psychological bubble, inflation expectations or scarcity of supply. RealRate calculates the mathematical and true value of gold and coins from the global ounce and the standard weight at legal purity, and shows you the positive or negative bubble on every asset.',
    sections: [
      {
        h2: 'What is the intrinsic value of gold and how is it determined?',
        paragraphs: [
          'The intrinsic value of gold is the rial value of the pure gold contained in each piece, regardless of momentary market demand or trading excitement. To calculate the true value of a gram of 18-karat or 24-karat gold, the global price of a troy ounce is multiplied by the free-market dollar exchange rate and scaled by the standard weight factor.',
          'When buying gold or bank-minted coins, many buyers do not realize how much of the money they pay goes to the value of the raw gold and how much goes to the price bubble or minting fees. RealRate separates these two variables so your decisions rest on transparent data.',
        ],
        bullets: [
          'Raw mathematical value calculated from each coin\'s legal weight and official purity',
          'Nominal bubble separated from the value of pure melted gold',
          'Continuous measurement of price against the standard 750 and 999.9 purities',
        ],
      },
      {
        h2: 'How the Emami and Bahar Azadi coin bubble is measured',
        paragraphs: [
          'A coin\'s bubble is the difference between its free-market trading price and the intrinsic value of the gold it contains. In the Iranian market, the Emami coin, half coin and quarter coin usually trade at different bubble percentages because of their high liquidity.',
          'On RealRate, two official bubble formulas are evaluated: the bubble relative to raw gold, and the bubble adjusted for approved minting costs. With this tool you can see which coin currently carries the lower buying risk and which coin\'s bubble is unreasonable.',
        ],
        bullets: [
          'Coverage of all official bank-minted coins: full Emami, Bahar Azadi, half, quarter and gram coins',
          'Automatic highlighting of the lowest-bubble coin to optimize your market entry',
          'Detection of negative bubbles and protection against calculation errors on untraded items',
        ],
      },
      {
        h2: 'Informed decisions and a smarter gold-buying strategy',
        paragraphs: [
          'Knowing the true value of gold lets you avoid spending your capital on unsustainable bubbles when buying excitement peaks. When the bubble on the quarter coin or the Emami coin reaches unusual levels, switching to melted gold or to coins with a smaller bubble can sharply limit the risk of a price drop.',
          'All of these calculations are made without any commercial bias or dependence on particular gold sellers, and their main purpose is to protect investors\' purchasing power.',
        ],
        bullets: [
          'Instant comparison of the bubble ratio across different gold coins',
          'Price simulation with any ounce price and dollar rate you choose, right on the dashboard',
          'Permanent, free access with no ads and no hidden fees',
        ],
      },
    ],
    steps: [
      {
        title: 'Choose a gold or coin asset',
        description: 'Pick the item you want from 18-karat gold, 24-karat gold, or the Bahar Azadi, Emami, half and quarter coins.',
      },
      {
        title: 'Review the calculated intrinsic value',
        description: 'The system plugs the legal weight and standard purity into the mathematical formula and shows the value of the raw gold based on the ounce and the dollar.',
      },
      {
        title: 'Analyze the bubble percentage and the smart suggestion',
        description: 'See the gap between the market price and the intrinsic value as a percentage, and compare the lowest-bubble assets before you decide.',
      },
    ],
    faq: [
      {
        q: 'Is a coin bubble always positive?',
        a: 'No. In a deep slump or a sudden drop in demand, the market price can temporarily fall below the intrinsic value of the raw gold. This is called a negative bubble.',
      },
      {
        q: 'What is the difference between the Emami and Bahar Azadi coins?',
        a: 'In weight and gold purity they are exactly the same (8.133 grams of 900-fineness gold), but the Emami coin usually trades at a larger bubble because of higher market demand.',
      },
      {
        q: 'Are the prices on this page live?',
        a: 'No. This page is an analytical and educational reference for the calculation methods. To monitor the data and use the interactive tools, sign in to your account or open the demo version.',
      },
      {
        q: 'Why does melted gold carry a smaller bubble than coins?',
        a: 'Melted gold carries no bank minting cost, no speculative coin demand and no packaging, so its market value is very close to the intrinsic value of 18-karat gold.',
      },
    ],
    related: ['portfolio', 'transactions', 'personal-dashboard'],
    ogImage: 'https://realrate.geekio.org/og/gold-coin-bubble.png',
  },

  {
    slug: 'portfolio',
    title: 'Cloud Multi-Asset Portfolio Management | RealRate',
    description: 'Manage gold, coins, currencies, stocks and crypto in one place with custom categories, an allocation chart, comparison with other assets, and secure sharing.',
    h1: 'Manage Your Personal Asset Portfolio and Investment Basket',
    intro: 'Scattering your assets across Excel files and paper notebooks often blocks a holistic view of your capital and real returns. The RealRate portfolio section lets you record all your gold, coins, foreign currencies, stock symbols and crypto in one centralized cloud dashboard, and evaluate your returns, profit and loss, and investment mix.',
    sections: [
      {
        h2: 'Several separate portfolios for different financial goals',
        paragraphs: [
          'You can create unlimited portfolios, for example a family savings fund, a long-term gold investment portfolio, or a short-term trading basket. A smooth switcher lets you move between these baskets in a fraction of a second.',
          'Each portfolio has an item counter, total value in rials, realized and unrealized profit and loss, and a pie chart of the asset mix that gives you a complete view of how your risk is distributed.',
        ],
        bullets: [
          'Support for unlimited portfolios with no limit on the number of records',
          'Manual assets kept separate from assets recorded from transaction history',
          'A visual chart of each asset group\'s share to keep your capital diversified',
        ],
      },
      {
        h2: 'Custom categories with your own names and icons',
        paragraphs: [
          'Unlike traditional software that imposes a fixed structure, RealRate lets you create custom categories with your own names and icons. For example, create a category called "Dowry fund" or "Instantly liquid assets".',
          'Assets move between categories easily by drag and drop on desktop or through a quick menu on mobile. If you delete a category, its assets are never lost; they move to the automatic "Other" category.',
        ],
        bullets: [
          'Define, edit and reorder categories however you like',
          'Full drag-and-drop support with mouse, touch and keyboard',
          'Categories preserved in standard CSV import and export',
        ],
      },
      {
        h2: 'Compare your purchase with alternative assets',
        paragraphs: [
          'A constant challenge for investors is answering this question: "If I had bought gold on the day I bought this stock or currency, where would I stand now?" RealRate offers a unique tool for comparing the opportunity you missed.',
          'Alongside each asset\'s profit or loss in tomans, you can measure what return you would have today if the same budget had gone into another base asset, and by what percentage your choice performed better or worse.',
        ],
        bullets: [
          'Comparative profit and loss against a base asset',
          'Secure portfolio sharing with a dedicated link and an optional password',
          'Privacy mode to hide cash values in public places',
        ],
      },
    ],
    steps: [
      {
        title: 'Create a new portfolio',
        description: 'Name your portfolio and create the categories you want, or use the standard ones.',
      },
      {
        title: 'Record items and assets',
        description: 'Add your gold, coins, currency or stocks by entering the amount and cost basis, or upload your earlier CSV file.',
      },
      {
        title: 'Monitor returns and optimize your basket',
        description: 'See current profit and loss, each asset\'s share in the pie chart and the comparative performance report at a glance.',
      },
    ],
    faq: [
      {
        q: 'Can my portfolio data be seen on the server?',
        a: 'No. All asset data, balances and notes are end-to-end encrypted in the browser with your own key, and the server never receives them in plain text.',
      },
      {
        q: 'Can I back up my portfolio data?',
        a: 'Yes. At any time you can download a standard CSV export of all assets with their categories in one click, or restore from it.',
      },
      {
        q: 'How does public portfolio sharing work?',
        a: 'You can create a public link with a dedicated ID. If you set a password for it, only people who hold the decryption key will be able to see the portfolio.',
      },
      {
        q: 'What is the difference between a manual asset and an asset from transactions?',
        a: 'A manual asset is entered directly with a given amount and price, whereas in the transactions section the balance is calculated from the chain of successive purchases and the weighted average.',
      },
    ],
    related: ['transactions', 'gold-coin-bubble', 'encryption'],
    ogImage: 'https://realrate.geekio.org/og/portfolio.png',
  },

  {
    slug: 'transactions',
    title: 'Weighted Average Cost and Transaction Profit | RealRate',
    description: 'Record asset buys and sells with the Persian calendar, calculate weighted average cost (WAC) and realized profit automatically, and prevent balance errors.',
    h1: 'Record Your Transaction History and Calculate Average Purchase Price',
    intro: 'When you buy in steps at different prices, calculating the weighted average cost and the real profit from later sales by hand becomes complex and error-prone. The RealRate transactions module calculates weighted average cost (WAC) automatically and gives you a clear picture of realized profit and loss.',
    sections: [
      {
        h2: 'Weighted average cost (WAC) calculation',
        paragraphs: [
          'Weighted Average Cost is the standard accounting approach for investors in gold, currency and financial markets. With every new purchase, the weighted average is re-evaluated from the purchase price and the added quantity.',
          'The system manages the chronological order of purchases and sales automatically. You do not need to build complex Excel formulas or worry about cost basis shifting after staged sales.',
        ],
        bullets: [
          'Instant, accurate cost basis after every purchase',
          'Realized profit from sales kept separate from the nominal profit on remaining holdings',
          'Smart warning if you record a sale larger than your accumulated balance',
        ],
      },
      {
        h2: 'Record trade details with the Persian calendar',
        paragraphs: [
          'Every trade is recorded with its Shamsi date, exact time, the currency or gold rate at the moment of the trade and detailed notes. A quick "Today" button speeds up daily purchase entry.',
          'For each transaction you can specify whether it was a cash trade, a swap against another asset, or which bank account it was settled from, so your financial chain stays unambiguous.',
        ],
        bullets: [
          'Persian calendar with a smooth date picker and a current-day shortcut',
          'Filter and search trade history by asset and time range',
          'CSV export (opens in Excel) for archiving financial records',
        ],
      },
      {
        h2: 'Realized profit and loss reports',
        paragraphs: [
          'When you record a sale, RealRate calculates the cost basis of the quantity sold from the average on that day and records the difference from the sale price as final profit or loss.',
          'This precise analysis shows which trades were most profitable and how your staged strategy has played out over time.',
        ],
        bullets: [
          'A clear view of investment performance with no human calculation errors',
          'Edit past transactions and the whole chain updates automatically',
          'Full encryption of transaction history in your data vault',
        ],
      },
    ],
    steps: [
      {
        title: 'Record staged purchases',
        description: 'Enter the asset type, quantity, purchase price per unit and trade date to calculate the average cost basis.',
      },
      {
        title: 'Record sales',
        description: 'When you record a sale of part of an asset, realized profit is evaluated against the current average cost.',
      },
      {
        title: 'View the consolidated report',
        description: 'See the remaining balance and a summary of realized profit in an organized table and the portfolio analytics reports.',
      },
    ],
    faq: [
      {
        q: 'How is weighted average cost calculated?',
        a: 'The total amount paid across all valid purchases is divided by the total number of units bought, giving the average cost per unit.',
      },
      {
        q: 'If I record a transaction with a past date, will the calculations break?',
        a: 'No. RealRate sorts transactions by their real date and automatically rebuilds every average after that date.',
      },
      {
        q: 'Can I record fees on trades?',
        a: 'Yes. You can enter the final price paid including fees so the average cost reflects your real expenses.',
      },
      {
        q: 'Does recording trades require a constant internet connection?',
        a: 'Thanks to its advanced PWA design, you can view your data offline too, and it syncs when you reconnect.',
      },
    ],
    related: ['portfolio', 'gold-coin-bubble', 'income'],
    ogImage: 'https://realrate.geekio.org/og/transactions.png',
  },

  {
    slug: 'loans',
    title: 'Loans, Amortization Schedule and Reminders | RealRate',
    description: 'Calculate bank installment schedules from interest rate and fees, sort loans by bank with official logos, record payments and get due-date reminders.',
    h1: 'Complete Management of Loans, Bank Installments and Debt Amortization',
    intro: 'Taking several loans from banks and interest-free loan funds is a common way to raise financing, but forgetting an installment due date leads to late penalties, a lower bank credit rating and chaos in managing monthly cash flow. RealRate calculates the full amortization schedule of every loan and reminds you when installments fall due.',
    sections: [
      {
        h2: 'Automatic amortization schedule and installment calculation',
        paragraphs: [
          'Just enter the loan principal, annual interest rate, fees and repayment term, and the complete monthly installment schedule is calculated, with the principal and interest portions of each installment. Interest-free (qarz al-hasanah) loans with an annual fee are also supported.',
          'If you want to fix the total repayment amount, the system distributes each installment evenly so there is the least possible mismatch with the bank contract.',
        ],
        bullets: [
          'Accurate installments using the Central Bank standard formula and the interest-free loan method',
          'Remaining debt and amortization ratio calculated as payments progress',
          'Monthly, quarterly or custom payment intervals',
        ],
      },
      {
        h2: 'Iran\'s standard banks and recording installment payments',
        paragraphs: [
          'The list of the country\'s official banks, with their own logos, is built in so you can assign each loan to its bank, such as Bank Melli, Saderat, Tejarat, Maskan and others. For family loans, you can also enter the name of a custom bank or fund.',
          'As you pay each installment, one click changes its status to "Paid", and earlier installments can be settled too if needed. If you settle early, you can record either a reduced amount or a reduced number of installments.',
        ],
        bullets: [
          'Loans sorted by bank logo with a pie chart of each bank\'s share',
          'Quick payment entry with a Shamsi date, with the option to cancel or overpay',
          'Bulk editing of dates and amounts to keep up with changes to the installment plan',
        ],
      },
      {
        h2: 'Installment due reminders on your personal dashboard',
        paragraphs: [
          'You no longer need paper notes or a separate calendar. At the top of the main RealRate page, a summary line shows overdue installments and installments due soon (within the next 7 days), with their count and total amount.',
          'This early warning gives you time to top up the account tied to an installment before it is due and avoid bank penalties.',
        ],
        bullets: [
          'Immediate alert for overdue installments in a distinct color to catch your attention',
          'Monthly cash-outflow forecast for planning the family budget',
          'Full encryption of debt and installment figures with the vault security standard',
        ],
      },
    ],
    steps: [
      {
        title: 'Enter the loan\'s basic details',
        description: 'Enter the total amount, the lending bank, the interest rate or fee and the date of the first installment.',
      },
      {
        title: 'Review the amortization schedule',
        description: 'See the full schedule of due dates and installment amounts, and customize it if you wish.',
      },
      {
        title: 'Record payments and track the remaining debt',
        description: 'After paying each installment, press the pay button to update the remaining debt and the amortization percentage.',
      },
    ],
    faq: [
      {
        q: 'Are 4 percent interest-free loans supported too?',
        a: 'Yes. The system has a dedicated mode for interest-free loans with an annual fee, which sets the first-month or annual installments according to banking rules.',
      },
      {
        q: 'What happens if I pay an installment extra or early?',
        a: 'You can choose the extra payment option and decide whether the amount should reduce the number of final installments or lower the amount of future installments.',
      },
      {
        q: 'Does the installment reminder send text messages?',
        a: 'Out of respect for your privacy, and because phone numbers are not stored on the server, reminders are shown on the app\'s own main page.',
      },
      {
        q: 'Can I also record personal loans between individuals?',
        a: 'Yes. You can define custom banks with any name you like (for example a family fund or a colleague\'s loan) with complete flexibility.',
      },
    ],
    related: ['cheques', 'income', 'personal-dashboard'],
    ogImage: 'https://realrate.geekio.org/og/loans.png',
  },

  {
    slug: 'income',
    title: 'Income, Monthly Salary and Cash Flow Tracking | RealRate',
    description: 'Record and track monthly income, categorize sources, and see salary and bonus breakdowns with analytical cash flow trend charts in RealRate.',
    h1: 'Manage Your Monthly Income and Cash Flow',
    intro: 'Knowing exactly how much money comes in, and from where, is the first step toward financial discipline and purposeful saving. The RealRate income module lets you record income such as salary, projects, rent and investment returns, and evaluate your cash flow trend with comprehensive charts.',
    sections: [
      {
        h2: 'Income source categories and chart analysis',
        paragraphs: [
          'Income can be sorted into many categories such as salary, benefits, bonus, freelance, business, investment, rent, gift and other. This structure helps you see how much of your income is active and how much is passive.',
          'A stacked bar chart over different periods (current month, 3 months, 6 months, one year and all records) shows the inflow from each source alongside the monthly average line.',
        ],
        bullets: [
          'A comparative bar chart showing the percentage change from last month',
          'A pie chart of sources to measure how diversified your inflows are',
          'Fast data loading matched to the selected period',
        ],
      },
      {
        h2: 'Excel export and sync with your portfolio',
        paragraphs: [
          'You can export all recorded income as a standard CSV file in one click, for your personal archives or tax filings.',
          'Seeing how your recorded income relates to your investment portfolio and loan installments gives you a complete picture of your true savings capacity each month.',
        ],
        bullets: [
          'Full CSV import and export that preserves category and date details',
          'Instant search by source title, income category or note',
          'End-to-end encryption of income amounts before they leave the browser',
        ],
      },
    ],
    steps: [
      {
        title: 'Record new income',
        description: 'Specify the title, amount in tomans, income category and date received. Bank deposits can also be recorded from SMS.',
      },
      {
        title: 'Categorize your sources',
        description: 'Put each income in its own category (salary, project, rent, …) or create a category of your own.',
      },
      {
        title: 'Review monthly reports',
        description: 'Use the analytical charts to see how monthly income is growing and each source\'s share across the seasons.',
      },
    ],
    faq: [
      {
        q: 'How can I record income in dollars or another currency?',
        a: 'You can enter its toman equivalent at the day\'s exchange rate, and put the foreign-currency amount and the conversion rate in the note field.',
      },
      {
        q: 'Where is my salary and income information kept?',
        a: 'Your data is encrypted in your browser with your own vault password, and even RealRate\'s creators cannot see your income amounts.',
      },
    ],
    related: ['loans', 'portfolio', 'transactions'],
    ogImage: 'https://realrate.geekio.org/og/income.png',
  },

  {
    slug: 'cheques',
    title: 'Sayad Cheque Management and Due Reminders | RealRate',
    description: 'Record received and issued cheques with the 16-digit Sayad ID, track clearing and bounce history, and get automatic due-date alerts on your dashboard.',
    h1: 'Smart Management of Sayad Cheques, Due Dates and Clearing Status',
    intro: 'The cheque is one of the most widely used commercial and credit instruments in everyday dealings, but managing many cheques with different due dates can be a stressful chore. The RealRate cheques section lets you keep an orderly record of issued and received Sayad cheques, change their status with one click and get due-date reminders in a secure environment.',
    sections: [
      {
        h2: 'Complete details of issued and received cheques',
        paragraphs: [
          'You can store every key detail of a cheque in a structured form: the amount in tomans, the Shamsi due date, the issuer or recipient, the bank name with its standard logo, the cheque serial number and the 16-digit Sayad ID.',
          'Separating received cheques (receivables) from issued cheques (payment obligations) helps you assess, at any moment, your upcoming obligations and the cash you expect.',
        ],
        bullets: [
          'Record received and issued cheques with 16-digit Sayad ID validation',
          'Choose issuing banks with official logos, or custom banks',
          'A summary of amounts in progress, obligations over the next 30 days and bounced cheques',
        ],
      },
      {
        h2: 'Tracking history and changing the clearing status',
        paragraphs: [
          'A cheque\'s status changes from the moment it is recorded until final settlement. In RealRate you can set each cheque to statuses such as "Awaiting due date", "In collection", "Cleared", "Bounced", "Transferred" or "Voided".',
          'The quick "Cleared" button lets you settle a cheque with one click right in the cheque list. Every status change is recorded in the cheque\'s history together with its date and a note, which makes legal document tracking easy.',
        ],
        bullets: [
          'One-click change to Cleared, recording the settlement date',
          'Bank follow-up notes without touching the main fields',
          'Advanced filters by cheque type, clearing status and issuing bank',
        ],
      },
      {
        h2: 'Due-date alerts on your dashboard and Excel export',
        paragraphs: [
          'The main dashboard has a dedicated cheque reminder line that flags overdue cheques and cheques due in less than 7 days, with separate amounts, so you never forget the date to pay or collect a cheque.',
          'The CSV export (opens in Excel) also makes it quick to report to your accountant or business partners.',
        ],
        bullets: [
          'Early notice of due dates to keep your account from bouncing a cheque',
          'Quick search by counterparty name, Sayad ID or note',
          'End-to-end encryption of cheque records to protect confidential commercial documents',
        ],
      },
    ],
    steps: [
      {
        title: 'Record a cheque with full details',
        description: 'Record the cheque type (issued or received), the amount, the due date, the counterparty name and the Sayad ID.',
      },
      {
        title: 'Monitor due dates on the dashboard',
        description: 'As the due date approaches, see the automatic alerts on the main page and manage your account accordingly.',
      },
      {
        title: 'Update the status and collection',
        description: 'Once the money is received or the cheque clears, press the "Cleared" button to save the document\'s final status.',
      },
    ],
    faq: [
      {
        q: 'Is the Sayad ID of cheques validated?',
        a: 'Yes. The 16-digit structure of the Sayad ID is checked to prevent human error when entering the digits.',
      },
      {
        q: 'How do I record a bounced cheque?',
        a: 'You can change the cheque\'s status to "Bounced" and attach a note on the reason for the bounce or any legal action taken to its history.',
      },
      {
        q: 'Can I scan an image to record a cheque?',
        a: 'Yes. The RealRate AI smart scan feature lets you take a photo of a cheque and extract its details without typing them by hand.',
      },
      {
        q: 'Is the security of recorded cheques guaranteed?',
        a: 'All amounts, IDs and names entered in the cheques section are encrypted in the browser with your local vault key and stay completely confidential.',
      },
    ],
    related: ['ai-cheque-scan', 'loans', 'encryption'],
    ogImage: 'https://realrate.geekio.org/og/cheques.png',
  },

  {
    slug: 'ai-cheque-scan',
    title: 'AI Sayad Cheque Scanner | RealRate',
    description: 'Extract cheque details instantly from a camera photo or file, with automatic rial-to-toman conversion, validation and form filling, and no image ever stored.',
    h1: 'Scan a Bank Cheque and Extract Its Details Automatically with AI',
    intro: 'Typing long Sayad IDs and due dates and converting rial amounts to tomans is slow and prone to visual errors. The RealRate smart scanner lets you simply photograph a bank cheque, extract its details with advanced AI and fill in the cheque form with high accuracy.',
    sections: [
      {
        h2: 'Photograph with your phone and process the image in the browser',
        paragraphs: [
          'To scan a cheque, just press the "Scan cheque" button on the cheques page. On a smartphone you can open the camera directly and photograph the cheque; on a computer you can upload a file or drag and drop a photo.',
          'Before it is sent to the AI engine, the image is optimized locally in your browser: camera rotation is corrected, the image size is reduced intelligently and unnecessary metadata is removed to save bandwidth.',
        ],
        bullets: [
          'Direct support for mobile cameras and the photo gallery',
          'Automatic image optimization and compression in the browser with no loss of legibility',
          'Fast processing, with the result shown in a few seconds',
        ],
      },
      {
        h2: 'Converting rial amounts to tomans and validating the numbers',
        paragraphs: [
          'Bank cheques state the amount in rials, in both digits and words, while RealRate\'s official unit for money management is the toman. The smart model converts amounts to tomans automatically and checks that the digits match the written Persian words.',
          'The 16-digit Sayad ID, the Shamsi due date and the issuing bank name are also checked against the country\'s list of banks so that the data you enter is fully standardized and reliable.',
        ],
        bullets: [
          'Smart conversion of the rial amount on the cheque to tomans in the app',
          'Checking that the numeric amount agrees with the amount written in words',
          'A confidence level for each field, and a yellow warning when it needs review',
        ],
      },
      {
        h2: 'Secure form prefill and full privacy protection',
        paragraphs: [
          'When the scan finishes, the results are shown to you, and pressing the "Fill form" button places the details into the form fields automatically. You stay in full control: you choose the cheque type and can change any value if needed.',
          'Very important: the cheque image and the raw extracted values are never stored in a database, persistent storage or server logs, and are erased from temporary memory immediately after processing. The final cheque is also stored with end-to-end encryption.',
        ],
        bullets: [
          'No cheque image or text is stored on any server or database',
          'A daily quota of 10 free scans per user account',
          'The final details are saved in your personal encrypted vault',
        ],
      },
    ],
    steps: [
      {
        title: 'Photograph the Sayad cheque',
        description: 'Click the scan cheque button and provide a clear image of the cheque with your phone camera or by uploading a photo.',
      },
      {
        title: 'Process and extract the details',
        description: 'The AI extracts the Sayad ID, date, amounts in tomans and bank, and validates them.',
      },
      {
        title: 'Confirm and save in the form',
        description: 'Review the extracted details in the form and press save to record the cheque in your encrypted vault.',
      },
    ],
    faq: [
      {
        q: 'Is my cheque image stored on RealRate servers?',
        a: 'No, never. The cheque image is processed only to extract its text and is deleted immediately, and no file is recorded on a server or in a database.',
      },
      {
        q: 'Can handwritten cheques be read too?',
        a: 'The AI model is very capable of reading clear Persian handwriting, but you should always review the amounts and dates yourself.',
      },
      {
        q: 'What is the daily cheque scan limit?',
        a: 'Every user gets up to 10 free scans a day, which is plenty for managing everyday personal and business cheques.',
      },
      {
        q: 'Why does the cheque amount unit change after scanning?',
        a: 'Bank cheques are written in rials, but for ease of use RealRate automatically converts the amounts to tomans and records them that way.',
      },
    ],
    related: ['cheques', 'encryption', 'personal-dashboard'],
    ogImage: 'https://realrate.geekio.org/og/ai-cheque-scan.png',
  },

  {
    slug: 'encryption',
    title: 'Financial Data Security and E2E Encryption | RealRate',
    description: 'Uncompromising protection of your financial data with end-to-end encryption in the browser; the key stays on your device and the server cannot read your data.',
    h1: 'Maximum Financial Data Security with End-to-End Encryption (E2EE)',
    intro: 'A person\'s assets, account balances, loans and cheques are among the most sensitive private data there is. Most accounting software keeps user data as plain text on its servers. With a zero-knowledge architecture and end-to-end encryption (E2EE), RealRate takes the security of financial data to the highest possible level.',
    sections: [
      {
        h2: 'What is zero-knowledge architecture and why does it matter?',
        paragraphs: [
          'In a zero-knowledge architecture, the server has no knowledge of the content of the data it stores. All encryption, using an advanced industry standard, happens in your device\'s browser with your own private key.',
          'The plain text of your financial vault password is never sent over the internet or to the server. As a result, even if servers are breached or equipment is seized, no third party can see your portfolio figures, loan amounts or cheques.',
        ],
        bullets: [
          'Encryption in the browser before a single bit of data is sent to the server',
          'Data that server administrators or hackers cannot reach',
          'Standard web encryption algorithms (Web Crypto API)',
        ],
      },
      {
        h2: 'Easy locking and unlocking with a secure vault',
        paragraphs: [
          'The first time you sign in, you set a strong password for your encryption vault. After that, just entering this password decrypts your data in the browser and makes it ready to use.',
          'Whenever you finish using the app, you can lock the vault with a single click, which hides the figures on screen and clears the encrypted keys from the browser\'s temporary memory.',
        ],
        bullets: [
          'Change the vault password without re-encrypting your data',
          'Automatic and manual locking to protect the screen from onlookers',
          'Encryption is mandatory for every active user account',
        ],
      },
      {
        h2: 'Privacy when sharing a portfolio',
        paragraphs: [
          'If you want to share your portfolio with a partner, financial advisor or friend, the generated link carries the decryption key in the URL hash, which is never sent to the server.',
          'The privacy mode button on every page also lets you mask sensitive figures with asterisks in a single tap, so you can use the app with peace of mind in public places.',
        ],
        bullets: [
          'Secure sharing without revealing your main account password',
          'Instantly mask amounts with privacy mode in public places',
          'Full respect for user rights and no ad tracking',
        ],
      },
    ],
    steps: [
      {
        title: 'Set the vault password',
        description: 'When setting up your account, choose a secure passphrase known only to you.',
      },
      {
        title: 'Encrypt data locally',
        description: 'Every asset, transaction or loan you record is encrypted in the browser and only then sent for storage.',
      },
      {
        title: 'Unlock transparently on later visits',
        description: 'When you enter the password, your data is decrypted quickly with no intermediary and no public exposure.',
      },
    ],
    faq: [
      {
        q: 'What happens if I forget my vault password?',
        a: 'Because of the zero-knowledge structure, there is no backup key on the server and your data cannot be recovered without the password, so write it down somewhere safe.',
      },
      {
        q: 'Can RealRate administrators see my portfolio figures?',
        a: 'No, never. The server stores only scrambled encrypted text, and even the system\'s creators have no access to your amounts.',
      },
      {
        q: 'Does encryption slow the software down?',
        a: 'No. The operations run on the browser\'s high-speed Web Crypto engine and finish in a few milliseconds with no perceptible delay.',
      },
      {
        q: 'Does sharing a portfolio publicly defeat the encryption?',
        a: 'No. The unlock key sits in the link\'s hash, and only the holder of the link can read that version of the portfolio.',
      },
    ],
    related: ['portfolio', 'personal-dashboard', 'cheques'],
    ogImage: 'https://realrate.geekio.org/og/encryption.png',
  },

  {
    slug: 'personal-dashboard',
    title: 'Personal Finance Dashboard, Layout and PWA | RealRate',
    description: 'A customizable financial dashboard with drag-and-drop sections, sync across devices and installation as a progressive web app (PWA) on your phone.',
    h1: 'A Personalized Financial Dashboard and a Mobile Web App (PWA)',
    intro: 'Everyone\'s tastes and financial priorities are unique: one person follows the gold and coin market, while another focuses on loans, installments or stock symbols. With full customization, drag-and-drop layouts and installation as a PWA, the RealRate dashboard offers a modern, flexible experience for daily monitoring.',
    sections: [
      {
        h2: 'Customize your layout with drag and drop',
        paragraphs: [
          'The RealRate dashboard is made of separate sections. You can create your own sections, move asset cards with drag and drop, and arrange the display order entirely to suit your needs.',
          'Each section can have its own display style, such as a full card with intrinsic value and bubble percentage, or a compact card that is extremely handy for showing long lists quickly on mobile.',
        ],
        bullets: [
          'Free arrangement of cards and sections with mouse, touch or keyboard',
          'Ready-made layout templates: Default, Gold and Coins, Currency and Crypto, Stocks and Summary',
          'Cloud storage of layout settings with seamless sync across all devices',
        ],
      },
      {
        h2: 'Progressive web app (PWA) and offline use',
        paragraphs: [
          'RealRate is built to the PWA standard, so you can install it straight onto the home screen of your Android phone or iPhone without downloading it from any app store.',
          'The app has offline storage, so even when the internet is down it shows the latest data it received and your portfolio information without interruption.',
        ],
        bullets: [
          'Installable on Android, iOS, Windows and Mac with no extra storage use',
          'Quick access and smooth, fast performance like native apps',
          'Smart caching to view your information when you have no internet access',
        ],
      },
    ],
    steps: [
      {
        title: 'Turn on customization mode',
        description: 'Click the customization icon on the dashboard to switch on layout editing mode.',
      },
      {
        title: 'Arrange sections and cards',
        description: 'Drag and drop cards, try the ready-made templates and choose the display style of each section.',
      },
      {
        title: 'Install the PWA on your phone',
        description: 'Choose Add to Home Screen from your browser menu to install the app on your phone.',
      },
    ],
    faq: [
      {
        q: 'How do I install the app on an iPhone?',
        a: 'Open the site in Safari, tap the Share button and then choose Add to Home Screen.',
      },
      {
        q: 'Do layout changes I make on my computer apply on my phone too?',
        a: 'Yes. Layout settings are saved to your account and are available exactly as you left them when you sign in on another device.',
      },
      {
        q: 'Can I reset the layout if I mess it up?',
        a: 'Yes. The customization toolbar has a "Default" option that instantly restores the standard original layout.',
      },
      {
        q: 'Can I see portfolio changes in offline mode?',
        a: 'Yes. The PWA keeps the latest data it loaded and shows it to you without a network connection.',
      },
    ],
    related: ['portfolio', 'gold-coin-bubble', 'loans'],
    ogImage: 'https://realrate.geekio.org/og/personal-dashboard.png',
  },

  {
    slug: 'demo',
    title: 'Demo Version and Free Trial, No Sign-Up | RealRate',
    description: 'Explore every RealRate feature instantly with realistic sample data and no email required, in a completely safe, read-only environment.',
    h1: 'Try It Out and Explore the Features Live, No Sign-Up Needed',
    intro: 'Before deciding to create an account, you have every right to try all the app\'s sections and features in practice. The RealRate demo lets you enter the real environment as a guest with a single click, without entering an email or username, and explore the app\'s many features.',
    sections: [
      {
        h2: 'Instant entry with no password or email',
        paragraphs: [
          'To enter the trial version, just press the "View demo" button. In a fraction of a second, a dedicated session with realistic sample data is prepared for you.',
          'In this environment, you can look at and evaluate a sample portfolio of gold and currency assets, a transaction history with weighted averages, loans with an amortization schedule, Sayad cheques and monthly income.',
        ],
        bullets: [
          'Instant one-click access with no sign-up or contact details',
          'A real, live environment where you can interact with the menus and different sections',
          'Try your own layout and move cards around the dashboard',
        ],
      },
      {
        h2: 'Security and read-only mode in the demo',
        paragraphs: [
          'To keep the sample data tidy for every visitor, the trial account works in read-only mode. You can play with all the filters, formulas and charts, but no new data will be saved.',
          'End-to-end encryption is also in place even in the demo account; the demo vault is unlocked automatically and unobtrusively in the browser so you can see how the encryption works first-hand.',
        ],
        bullets: [
          'Server-level read-only protection to keep the sample data stable',
          'Automatic, transparent unlocking of the encrypted vault in the browser',
          'A guide banner with an easy path to signing up for a personal account',
        ],
      },
      {
        h2: 'An informed decision about signing up for free',
        paragraphs: [
          'Once you have explored the features and are sure RealRate fits your financial goals, you can go to the sign-up page with one click at any time and set up your free personal account.',
          'Every RealRate feature is offered to all users 100% free, with no paid subscription and no hidden fees.',
        ],
        bullets: [
          'A seamless move from the demo to sign-up with Google or email',
          'Free, lifelong access to every feature of the platform',
          'No requirement for a premium subscription or any payment',
        ],
      },
    ],
    steps: [
      {
        title: 'Click View demo',
        description: 'Click the demo button and a guest session is created directly and instantly.',
      },
      {
        title: 'Explore the sample data in each section',
        description: 'Look through the portfolio, loans, installments, cheques and income charts with ready-made data.',
      },
      {
        title: 'Sign up and start managing your personal finances',
        description: 'Press the sign-up button in the banner at the top of the page to create your own secure, encrypted account.',
      },
    ],
    faq: [
      {
        q: 'Do I need a phone number or email to enter the demo?',
        a: 'No. Entering the demo is completely as a guest and no identifying data is requested from you.',
      },
      {
        q: 'Can I save a new asset in the demo?',
        a: 'The demo is read-only so the sample data is preserved. To save your own assets, you can sign up for free in a few seconds.',
      },
      {
        q: 'Is the demo data stored on my phone?',
        a: 'Demo data lives only in the browser session\'s temporary memory, and no trace of it remains after you leave.',
      },
      {
        q: 'Does using the trial version cost anything?',
        a: 'No. The demo and every part of RealRate are completely free and open source.',
      },
    ],
    related: ['portfolio', 'gold-coin-bubble', 'personal-dashboard'],
    ogImage: 'https://realrate.geekio.org/og/demo.png',
  },
];

/** The feature pages built; the demo's only while the demo is on (shared/routes.js) */
export const FEATURE_PAGES = ALL_FEATURE_PAGES.filter((page) => DEMO_ENABLED || page.slug !== 'demo');

export const STATIC_PAGES = {
  features: {
    slug: 'features',
    title: 'Features and Personal Finance Tools | RealRate',
    description: 'The complete toolkit for gold and coin valuation, multi-asset portfolio management, loans, cheques and income in the RealRate personal finance software.',
    h1: 'Features and Capabilities of the RealRate Finance Platform',
    intro: 'RealRate is independent, open-source, encrypted personal finance software that puts an integrated set of tools at your disposal: analytics, multi-asset portfolio monitoring, loan installment management, Sayad cheque control and cash flow evaluation. All of these features are offered free, with no ads and with your privacy fully protected.',
    ogImage: 'https://realrate.geekio.org/og/default.png',
  },

  about: {
    slug: 'about',
    title: 'About RealRate, Our Mission and Open Source | RealRate',
    description: 'Learn the philosophy and goals behind RealRate, an independent, free and open-source platform for financial transparency and discipline, privacy first.',
    h1: 'About RealRate: Transparency, Security and Financial Independence',
    intro: 'RealRate is a response to society\'s growing need for a free, independent and secure tool for assessing the true value of assets and organizing personal finances. We believe that access to accurate calculation tools and the confidentiality of financial information are the basic right of every citizen and investor.',
    sections: [
      {
        h2: 'Why was RealRate born?',
        paragraphs: [
          'Amid inflation and constant swings in currency and gold rates, gauging the real value of assets and protecting purchasing power has become one of the biggest challenges for families and economic actors. Meanwhile, most existing platforms either depend on particular sellers and exchanges, or keep users\' confidential data unencrypted on their servers.',
          'RealRate was designed as a completely independent, non-profit project that offers an accurate, bubble-free mathematical assessment of the market, with no conflict of interest, and makes monitoring finances easier for everyone.',
        ],
        bullets: [
          '100% independent of any exchange, guild or gold and currency trading firm',
          'No intrusive ads and no commercial trackers or analytics tools',
          'A design focused on ease of use, visual beauty and current UI standards',
        ],
      },
      {
        h2: 'Our commitment to open source',
        paragraphs: [
          'RealRate\'s source code is publicly available to everyone on GitHub under the MIT license. This means any user can examine how the formulas work, how the encryption is done and the code line by line.',
          'Being open source is the clearest guarantee of security, because no backdoor, suspicious code or hidden tracking can be planted in a public project. We welcome contributions from developers, financial analysts and web enthusiasts.',
        ],
        bullets: [
          'A public GitHub repository for reporting bugs, reviewing code and suggesting improvements',
          'The option to set up your own independent instance on dedicated servers',
          'Use of up-to-date technical frameworks such as React, Vite and Cloudflare',
        ],
      },
      {
        h2: 'Uncompromising privacy',
        paragraphs: [
          'At RealRate, our founding principle is complete respect for the ownership of user data. We use a zero-knowledge, end-to-end encrypted architecture, so even RealRate\'s administrators cannot see your asset, cheque or income figures.',
          'Your information belongs only to you and is kept in the safest form possible.',
        ],
        bullets: [
          'End-to-end encryption using the Web Crypto standard in the user\'s browser',
          'No mobile phone number or sensitive identity information required to sign up',
          'Backups and full CSV exports available at any moment',
        ],
      },
    ],
    ogImage: 'https://realrate.geekio.org/og/default.png',
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy | RealRate',
    description: 'RealRate privacy policy: what data we keep, why your financial data is unreadable to us, which services we work with, and how to delete your account.',
    h1: 'RealRate Privacy Policy',
    intro: 'RealRate works with no ads, no trackers and no selling of your data. Your financial data is encrypted in your own browser or phone, and the server keeps only the encrypted text; even we cannot read it. This page tells you exactly what is kept and why.',
    updated: 'October 13, 2026',
    sections: [
      {
        h2: 'Information we keep',
        paragraphs: ['When you sign up for and use RealRate, the following information is stored on the server:'],
        bullets: [
          'Your email and name, and your profile photo if you sign in with Google',
          'A hash of your password (the password itself is not stored), and your sign-in sessions',
          'Your sign-up date, number of sign-ins, days of use, and the app version and type (web or Android), for overall usage statistics',
          'Your financial records (portfolio, loans, cheques, income, expenses, accounts and budgets) only in encrypted form; next to each record, only its type and date remain in plain text so that lists open quickly',
          'If you turn on email reminders: the date and type of the due item (without the title, amount or counterparty name)',
        ],
      },
      {
        h2: 'End-to-end encryption',
        paragraphs: [
          'Financial records are encrypted in your browser or phone with a key derived from your "encryption password". This password and key never reach the server, so neither administrators nor the server can see your amounts, titles or names. Reports and totals are also calculated on your own device. If you forget the encryption password, the data cannot be recovered.',
        ],
      },
      {
        h2: 'Services we work with',
        paragraphs: ['The following services are used to run the app, and no readable financial data is given to any of them:'],
        bullets: [
          'Cloudflare: hosting of the website, the server and your encrypted database',
          'Google: signing in with a Google account (we receive your name, email and profile photo)',
          'Email delivery service (Resend): verification emails, password recovery and due-date reminders',
          'Cheque scanning (optional): only when you yourself provide a cheque photo, that photo is sent to Google\'s Gemini to read the text, and it is not stored',
          'The daily news and AI analysis (Workers AI) is built only from public news and contains no user information',
        ],
      },
      {
        h2: 'Android app permissions',
        paragraphs: [
          'The store version (without SMS) has no access to your text messages. It requests these permissions: internet; notifications (for due-date reminders and important news); and fingerprint (only to unlock the encryption on this same phone; the app never sees your fingerprint and it goes nowhere).',
          'Android reminders and the home-screen widget are created on the phone itself. In the full version installed from GitHub (not from the store), and only with your own permission, bank text messages are read and processed on the phone itself; the text of the message is not stored and does not leave the phone.',
        ],
      },
      {
        h2: 'Selling and sharing',
        paragraphs: ['Your information is not sold, is not used for advertising or tracking, and is not shared with any third party other than the services above that are needed to run the app. Portfolio sharing happens only when you turn it on yourself.'],
      },
      {
        h2: 'Account deletion and data retention',
        paragraphs: [
          'At any time, from the "Settings" tab in the app or on the website, you can permanently delete your account and all your data; the details are on the account deletion page. Data that does not require deleting the account can also be exported beforehand with "Backup".',
        ],
      },
      {
        h2: 'Children and changes to this policy',
        paragraphs: [
          'RealRate is not built for children under 13 and does not knowingly collect information from them. If this policy changes, the date at the top of this page will be updated. The app\'s code is public, and anyone can verify in it what we have said.',
        ],
      },
      {
        h2: 'Contact',
        paragraphs: ['Do you have a question or request about your data? Write on GitHub (github.com/nos486/realrate/issues); please do not put any personal or financial information in it.'],
      },
    ],
    ogImage: 'https://realrate.geekio.org/og/default.png',
  },

  deleteAccount: {
    slug: 'delete-account',
    title: 'Delete Your Account and Data | RealRate',
    description: 'How to delete your RealRate account from the app and the website: the steps, what is permanently erased from the server, and what is kept for a limited time.',
    h1: 'Deleting Your Account and Data on RealRate',
    intro: 'At any time you can delete your RealRate account and all of its data permanently, yourself and within seconds, without having to ask us.',
    updated: 'October 13, 2026',
    sections: [
      {
        h2: 'Steps to delete your account',
        paragraphs: ['Sign in to your account in the Android app or on the website and follow these steps:'],
        bullets: [
          'The "Settings" tab (account settings)',
          'At the bottom of that page, the "Delete account" section → "Delete account and all data"',
          'Type the phrase "Delete account" (and, if your account has a password, enter it) and confirm',
        ],
      },
      {
        h2: 'What is deleted',
        paragraphs: ['Once you confirm, the following data is erased from the server immediately and permanently, and cannot be restored:'],
        bullets: [
          'Your user account, email, name, profile photo, password and all sign-in sessions',
          'All encrypted financial records: portfolio, loans, cheques, income, expenses, accounts and budgets, and the encryption key',
          'Reminders, notification subscriptions, email settings and group memberships',
          'Portfolio sharing links',
        ],
      },
      {
        h2: 'What is kept',
        paragraphs: [
          'Aggregate, anonymous statistics (for example, the number of active users) and the automatic backups of the Cloudflare database, which are kept for at most 30 days and then erased. If you uninstall the app from your phone but do not delete your account, your data stays on the server.',
        ],
      },
      {
        h2: 'Can\'t sign in?',
        paragraphs: ['If you have lost access to your account, write on GitHub (github.com/nos486/realrate/issues) with your account email and we will tell you how to verify ownership and delete it. Please do not put any financial information in it.'],
      },
    ],
    ogImage: 'https://realrate.geekio.org/og/default.png',
  },

  android: {
    slug: 'android',
    title: 'RealRate Android App Download and Install Guide | RealRate',
    description: 'Download the officially signed RealRate Android app for free; step-by-step install guide, the Google Play Protect warning explained, and how to update.',
    h1: 'RealRate Android App: Download and Install Guide',
    intro: 'The RealRate Android app gives you all the website\'s features in a smoother phone experience, and in addition prepares expenses and deposits from bank text messages for recording automatically and unlocks with your fingerprint. The install file comes straight from the project\'s official open-source repository and is always the latest signed version.',
    downloadUrl: 'https://github.com/nos486/realrate/releases/latest/download/⁨realrate.apk⁩',
    releasesUrl: 'https://github.com/nos486/realrate/releases',
    // SHA-256 of the signing certificate: every official build carries it
    certificateSha256: 'A7:57:AC:C9:5D:6A:1F:F2:F3:6B:63:15:0F:75:15:D0:44:E6:BC:FD:67:43:D0:7A:C7:5E:FA:4E:43:2E:26:18',
    steps: [
      {
        title: 'Download the install file',
        description: 'Press the "Download Android app" button. The realrate.apk file (about 8 MB) will download.',
      },
      {
        title: 'Allow installation from your browser',
        description: 'Open the file. If your phone asks, turn on "Install unknown apps" for your browser and go back.',
      },
      {
        title: 'Get past the Play Protect warning',
        description: 'If the "App blocked to protect your device" window appears, tap the small "Install anyway" text (above the OK button). We explain the reason for this warning below.',
      },
      {
        title: 'Sign in and unlock the vault',
        description: 'Open the app, sign in with the same account you use on the website and enter your vault password; from then on you can hand unlocking over to your fingerprint.',
      },
    ],
    sections: [
      {
        h2: 'Why does Google Play Protect show a warning?',
        paragraphs: [
          'Play Protect shows this warning for any app installed from outside Google Play whose developer is not yet known to Google. RealRate is not currently published on Google Play because developer registration is not possible from Iran.',
          'The text message permission adds to the sensitivity: it is needed to record bank withdrawals and deposits automatically, and Google reviews it more strictly for unknown apps. The warning does not mean the app has a problem.',
        ],
        bullets: [
          'Only withdrawal and deposit messages from bank senders are read; other messages never reach the app',
          'One-time password and verification code messages, even from the bank itself, are discarded on the spot',
          'The text of a message never leaves the phone; only the amount and date that you yourself record are stored, encrypted',
          'The full code of the app is open source and anyone can review it',
        ],
      },
      {
        h2: 'How can I be sure the file is genuine?',
        paragraphs: [
          'The install file is published only from the Releases section of RealRate\'s official GitHub repository, and is built and signed automatically from that same open-source code. All official versions are signed with one key; if you see an app with a different signature, it is not from RealRate.',
          'The SHA-256 fingerprint of the signing certificate, for verification (for example with the apksigner tool or APK inspection apps): A7:57:AC:C9:5D:6A:1F:F2:F3:6B:63:15:0F:75:15:D0:44:E6:BC:FD:67:43:D0:7A:C7:5E:FA:4E:43:2E:26:18',
        ],
        bullets: [
          'Automatic, transparent builds in GitHub Actions from the public code',
          'The same signature on every version; an update installs over the previous one',
        ],
      },
      {
        h2: 'Updating the app',
        paragraphs: [
          'To update, open this page and download and install the file again; the new version installs over the previous one and your data and settings stay where they are. The download link always gives you the latest version.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is it safe to install the RealRate app?',
        a: 'Yes. The app\'s code is open source, the install file is built and signed from that same code on GitHub, and the text of your messages never leaves your phone. The Play Protect warning appears only because the app is not published on Google Play.',
      },
      {
        q: 'Can I use the app without granting the text message permission?',
        a: 'Yes. Reading text messages is optional and you can decline it. Every other feature works without it, and you record expenses manually.',
      },
      {
        q: 'Is there an app for iPhone too?',
        a: 'Not for now. On iPhone, you can add the website to your home screen from Safari with the Add to Home Screen option and use it like an app.',
      },
      {
        q: 'Why isn\'t the app on Google Play or Cafe Bazaar?',
        a: 'Publishing on Google Play is not possible for Iranian developers, and publishing on domestic app stores is under review. Until then, downloading directly from this page is the official way.',
      },
    ],
    ogImage: 'https://realrate.geekio.org/og/default.png',
  },

  faq: {
    slug: 'faq',
    title: 'FAQ on Features and Security | RealRate',
    description: 'Answers to the most common questions about how the coin bubble is calculated, how end-to-end encryption works, and using RealRate, which is completely free.',
    h1: 'Frequently Asked Questions About RealRate',
    intro: 'Here we answer users\' most common questions about how the different parts of RealRate work, how values are calculated, data security and how to use the app. If you have another question, raise it with us through GitHub.',
    faqs: [
      {
        q: 'What exactly is RealRate and what is it for?',
        a: 'RealRate is personal finance management software and a tool for analyzing the true value of gold, coins, currencies and your investment portfolio, offered free, secure and open source.',
      },
      {
        q: 'Is RealRate free to use?',
        a: 'Yes. Every feature of the app, including unlimited portfolios, loan and installment management, cheques, smart scanning and the personal dashboard, is completely free, and there is no paid version.',
      },
      {
        q: 'How is the bubble on gold and coins calculated?',
        a: 'The intrinsic value of each piece of gold or each coin is calculated from its standard purity and legal weight, as the global gold ounce price multiplied by the dollar rate, and the gap between that and the market price is called the bubble.',
      },
      {
        q: 'Can RealRate\'s creators see my financial data?',
        a: 'No. All portfolios, loans, cheques and income are end-to-end encrypted in the browser with your vault key, and the server stores only the encrypted text.',
      },
      {
        q: 'How can I try the app without signing up?',
        a: 'Click "View demo" to enter the app\'s real environment as a guest with sample data and explore every section.',
      },
      {
        q: 'Can RealRate be installed on a mobile phone?',
        a: 'Yes. For Android, the official signed app can be downloaded from the "Android app" page (realrate.geekio.org/android), and it also records expenses automatically from bank text messages and unlocks with your fingerprint. On iPhone, you can add the website to your home screen from the browser as a PWA.',
      },
      {
        q: 'How does AI cheque scanning work?',
        a: 'When you take a photo of a Sayad cheque, the AI extracts the ID, date, amounts in tomans and bank, and the cheque image is never stored on any server.',
      },
      {
        q: 'How can I back up my data?',
        a: 'The portfolio and income sections have a CSV export button that, with one click, gives you an Excel file containing all your financial records.',
      },
      {
        q: 'Do I need a mobile number to sign up?',
        a: 'No. Signing up needs only an email address, or one click through a Google account, and no phone number is collected.',
      },
      {
        q: 'What happens if I forget my vault password?',
        a: 'Because of the zero-knowledge structure, there is no second key on the server, so keeping the vault password safe is the user\'s own responsibility.',
      },
      {
        q: 'Does RealRate show live market prices?',
        a: 'Once you sign in, the dashboard shows reference market prices, but the public introduction pages are purely analytical and educational and have no live prices.',
      },
      {
        q: 'How can I contribute to RealRate\'s development?',
        a: 'The project is open source on GitHub; you can take part by starring it, reporting bugs, suggesting new features or sending a pull request.',
      },
    ],
    ogImage: 'https://realrate.geekio.org/og/default.png',
  },
};
