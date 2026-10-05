/**
 * news.config.js — The news section: the Telegram channels it reads, the keywords that pick a post
 * for a closer look, and the Workers AI model that makes the final call and writes the summary
 *
 * Only news that can move the dollar, gold, coins, precious metals or the economy as a whole is
 * published; a single exchange symbol's news is not. The admin can change the channel list
 * (admin panel → اخبار); until then DEFAULT_NEWS_CHANNELS is read.
 */

/** Read when the admin has not saved a list of their own */
export const DEFAULT_NEWS_CHANNELS = [
  "khabari",
  "bourse24ir",
  "digital_khabar",
  "twitter_bourse",
  "eghtesadonline",
  "jaryane_eghtesad",
];

export const NEWS_LIMITS = {
  /** A channel read for the first time: its latest posts, so the page starts with some news */
  firstReadPosts: 10,
  /** Channels in the list (each one is a fetch every minute) */
  maxChannels: 30,
  /** Posts sent to the model in one request (one prompt for several posts) */
  aiBatchSize: 8,
  /** Model requests in one run (posts beyond this wait for the next minute) */
  aiCallsPerRun: 3,
  /** Model requests in one (UTC) day; past it the keywords alone decide */
  aiCallsPerDay: 600,
  /** A post's text sent to the model, in characters (the rest rarely changes the verdict) */
  aiTextChars: 700,
  /** A post's text kept, in characters */
  storedTextChars: 2000,
  /** News older than this is deleted (hourly) */
  retentionDays: 30,
  /** A post this close to one already published (shared words) is the same news */
  duplicateSimilarity: 0.6,
  /** Hours of published news a new post is compared with */
  duplicateWindowHours: 36,
};

/**
 * The model, on Workers AI (the `AI` binding in wrangler.toml). Gemma 3 reads and writes Persian
 * well at a small size; the second one is tried when the first fails.
 */
export const NEWS_AI_MODELS = [
  "@cf/google/gemma-3-12b-it",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
];

/** What a news item is about (the page's filters) */
export const NEWS_CATEGORIES = {
  currency: "ارز",
  gold: "طلا و سکه",
  metals: "فلزات",
  oil: "نفت و انرژی",
  bourse: "بورس و شاخص",
  economy: "اقتصاد",
  crypto: "رمزارز",
};

/**
 * Keywords (Persian text is normalized first: ي→ی, ك→ک, no half-spaces). A post needs a score of
 * NEWS_KEYWORD_MIN_SCORE to reach the model: a strong word is 2, a weak one 1, a word that marks
 * a single symbol's news or an ad takes 2 off.
 */
export const NEWS_KEYWORDS = {
  strong: [
    "دلار", "یورو", "درهم", "ارز", "نرخ ارز", "بازار ارز", "حواله", "مرکز مبادله", "نیما",
    "طلا", "سکه", "انس", "اونس", "مثقال", "آبشده", "نقره", "پلاتین", "پالادیوم", "مس", "فلزات گرانبها",
    "تورم", "نرخ بهره", "بانک مرکزی", "فدرال رزرو", "فدرال", "نقدینگی", "رکود", "ارزش پول", "پول ملی",
    "تحریم", "مذاکره", "برجام", "اسنپ بک", "آژانس", "شورای امنیت",
    "نفت", "برنت", "اوپک", "بیت کوین", "بیتکوین", "تتر",
    // The stock market as a whole (one symbol's news is not wanted: see negative)
    "شاخص کل", "شاخص بورس", "شاخص هم وزن", "بورس تهران", "ارزش معاملات", "پول حقیقی", "صندوق تثبیت",
  ],
  weak: [
    "قیمت", "بازار", "اقتصاد", "اقتصادی", "بانک", "بودجه", "مالیات", "یارانه", "بنزین", "صادرات",
    "واردات", "گمرک", "کسری", "رشد", "سقوط", "جهش", "افزایش", "کاهش", "رکورد", "ریال", "تومان",
    "جنگ", "حمله", "آتش بس", "ترامپ", "آمریکا", "اسرائیل", "بورس", "فرابورس", "وزیر اقتصاد",
    "مسکن", "خودرو", "حقوق", "دستمزد", "سود بانکی", "اوراق",
  ],
  negative: [
    "نماد", "عرضه اولیه", "صف خرید", "صف فروش", "مجمع عمومی", "افزایش سرمایه", "سود تقسیمی",
    "تبلیغ", "عضو شوید", "عضویت", "کد تخفیف", "سیگنال", "vip", "ثبت نام", "لینک ورود", "پیج",
  ],
};

export const NEWS_KEYWORD_MIN_SCORE = 2;

/**
 * The analyst's card: the model reads the day's news (headlines and summaries, with today's main
 * prices) and writes its view of where the dollar, gold, coins, the stock index and oil are going.
 * Written again when new news came in, at most every `minIntervalMinutes`.
 */
export const NEWS_ANALYSIS = {
  /** A larger model: one request now and then, where reasoning matters more than cost */
  models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-3-12b-it"],
  minIntervalMinutes: 30,
  /** The day's first analysis waits for this much news */
  minNews: 3,
  /** News read for one analysis (the most important and the newest) */
  maxNews: 30,
  /** Characters of each item's summary sent */
  summaryChars: 220,
  perDay: 30,
  maxTokens: 900,
  /** Prices shown to the model (price book ids) */
  priceIds: ["usd", "eur", "gold_18k", "full_coin", "mesghal", "ons_gold", "ons_silver", "usdt"],
};
/** Without the model (not bound, out of budget, failing), a post needs this score to publish */
export const NEWS_KEYWORD_ONLY_SCORE = 5;

/** Pushes for important news (services/news/newsPush.service.js) */
export const NEWS_PUSH = {
  /** Only news published this recently (not a new channel's backlog) */
  freshMinutes: 30,
  /** One notification at most this often */
  minIntervalMinutes: 10,
  /** Browsers reached in one run (each is a request) */
  maxDevices: 200,
};
