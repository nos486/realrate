/**
 * news.config.js — The news section: the Telegram channels and the international (English) RSS/Atom
 * feeds it reads, the keywords that pick a post for a closer look, and the Workers AI model that
 * makes the final call and writes the (Persian) headline and summary
 *
 * Only news that can move the dollar, gold, coins, precious metals or the economy as a whole is
 * published; a single exchange symbol's or company's news is not. The admin can change both lists
 * (admin panel → اخبار); until then DEFAULT_NEWS_CHANNELS and DEFAULT_NEWS_FEEDS are read.
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

/**
 * International news feeds (RSS 2.0 or Atom), read when the admin has not saved a list of their
 * own: `id` names the feed in the news ids ("<id>/<number>") and must stay the same, `title` is the
 * source shown on every item. English articles: the model translates and summarizes them.
 */
export const DEFAULT_NEWS_FEEDS = [
  { id: "cnbc_economy", title: "CNBC", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { id: "cnbc_world", title: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  { id: "bbc_business", title: "BBC", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "bbc_middle_east", title: "BBC", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { id: "aljazeera", title: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "fxstreet", title: "FXStreet", url: "https://www.fxstreet.com/rss/news" },
  { id: "oilprice", title: "OilPrice.com", url: "https://oilprice.com/rss/main" },
  { id: "guardian_world", title: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { id: "guardian_business", title: "The Guardian", url: "https://www.theguardian.com/business/rss" },
  { id: "nyt_world", title: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "nyt_business", title: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { id: "wsj_markets", title: "WSJ", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  { id: "marketwatch", title: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { id: "france24", title: "France 24", url: "https://www.france24.com/en/rss" },
  { id: "skynews_world", title: "Sky News", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { id: "middle_east_eye", title: "Middle East Eye", url: "https://www.middleeasteye.net/rss" },
  { id: "cointelegraph", title: "Cointelegraph", url: "https://cointelegraph.com/rss" },
];

/**
 * The default feeds that existed before the admin's saved list started to remember which defaults
 * it has seen (see getNewsFeeds): a saved list without that memory has seen exactly these, so a
 * feed added to the defaults since then reaches it, and one the admin removed stays removed
 */
export const LEGACY_DEFAULT_FEED_IDS = ["cnbc_economy", "cnbc_world", "bbc_business", "bbc_middle_east", "aljazeera", "fxstreet", "oilprice"];

/** Where a news item came from (the `source` column; the news page's «بین‌الملل» filter is `world`) */
export const NEWS_SOURCES = ["telegram", "world"];

export const NEWS_LIMITS = {
  /** A channel read for the first time: its latest posts, so the page starts with some news */
  firstReadPosts: 10,
  /** Posts waiting for the model (its budget, or a failure): at most this many, for this long */
  pendingMax: 60,
  pendingMaxHours: 6,
  /** Channels in the list (each one is a fetch every minute) */
  maxChannels: 30,
  /** Feeds in the list (each one is a fetch every minute) */
  maxFeeds: 20,
  /** A feed's article older than this is never sent (a feed read for the first time, a late item) */
  feedMaxAgeHours: 12,
  /** A feed's items remembered as seen (the feed's own window; an item is decided once) */
  feedSeenMax: 200,
  /** Posts sent to the model in one request (one prompt for several posts) */
  aiBatchSize: 8,
  /**
   * A post whose request failed is tried again on its own (so it never holds others back), at most
   * this many times in all; then it is set aside and logged, so one post the model can't take
   * never blocks the queue
   */
  aiMaxTries: 3,
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

/** The news section's model, on Workers AI (the `AI` binding in wrangler.toml): GLM 5.3 Flash */
const GLM_FLASH = { id: "@cf/zai-org/glm-5.3-flash", label: "GLM 5.3 Flash" };

/**
 * The model screening and summarizing posts, and only it: when it fails no other model is tried
 * and nothing is published; the posts wait for the next run, and the error is logged and shown in
 * the admin's panel. GLM 5.3 Flash always reasons (it can't be turned off: `enable_thinking` must
 * stay true, and is not sent); the least of it is asked, and `reasoningTokens` more output tokens
 * are allowed for it on top of the answer's. The answer is a JSON array, so no `json_object` here.
 */
export const NEWS_AI_MODEL = { ...GLM_FLASH, options: { reasoning_effort: "low" }, reasoningTokens: 4000 };

/** What a news item is about (the page's filters) */
export const NEWS_CATEGORIES = {
  currency: "ارز",
  gold: "طلا و سکه",
  metals: "فلزات",
  oil: "نفت و انرژی",
  bourse: "بورس و شاخص",
  economy: "اقتصاد",
  crypto: "رمزارز",
  politics: "سیاسی و امنیتی",
};

/**
 * Keywords (Persian text is normalized first: ي→ی, ك→ک, no half-spaces). A post needs a score of
 * NEWS_KEYWORD_MIN_SCORE to reach the model, and at least one economic word (strong or weak): a
 * strong word is 2, a weak one 1, a political or security word (context) 1, a word that marks a
 * single symbol's news or an ad takes 2 off.
 */
export const NEWS_KEYWORDS = {
  strong: [
    "دلار", "یورو", "درهم", "ارز", "نرخ ارز", "بازار ارز", "حواله", "مرکز مبادله", "نیما",
    "طلا", "سکه", "انس", "اونس", "مثقال", "آبشده", "نقره", "پلاتین", "پالادیوم", "مس", "فلزات گرانبها",
    "تورم", "نرخ بهره", "بانک مرکزی", "فدرال رزرو", "فدرال", "نقدینگی", "رکود", "ارزش پول", "پول ملی",
    "تحریم", "مذاکره", "برجام", "اسنپ بک",
    "نفت", "برنت", "اوپک", "بیت کوین", "بیتکوین", "تتر",
    // The stock market as a whole (one symbol's news is not wanted: see negative)
    "شاخص کل", "شاخص بورس", "شاخص هم وزن", "بورس تهران", "ارزش معاملات", "پول حقیقی", "صندوق تثبیت",
  ],
  weak: [
    "قیمت", "بازار", "اقتصاد", "اقتصادی", "بانک", "بودجه", "مالیات", "یارانه", "بنزین", "صادرات",
    "واردات", "گمرک", "کسری", "رشد", "سقوط", "جهش", "افزایش", "کاهش", "رکورد", "ریال", "تومان",
    "بورس", "فرابورس", "وزیر اقتصاد",
    "مسکن", "خودرو", "حقوق", "دستمزد", "سود بانکی", "اوراق",
  ],
  // Politics and security: they count, but never alone — a post needs an economic word too
  // (a statement about a war is not market news by itself)
  context: [
    "جنگ", "حمله", "آتش بس", "ترامپ", "آمریکا", "اسرائیل", "نظامی", "موشک",
    "آژانس", "شورای امنیت", "هسته ای", "بازرسان", "غنی سازی",
  ],
  negative: [
    "نماد", "عرضه اولیه", "صف خرید", "صف فروش", "مجمع عمومی", "افزایش سرمایه", "سود تقسیمی",
    "تبلیغ", "عضو شوید", "عضویت", "کد تخفیف", "سیگنال", "vip", "ثبت نام", "لینک ورود", "پیج",
  ],
};

/**
 * The same kinds of keywords for the international (English) feeds, matched lowercase as whole
 * words; they are added to NEWS_KEYWORDS' lists, so one score works for both languages
 */
export const NEWS_KEYWORDS_EN = {
  strong: [
    "dollar", "dollars", "dxy", "dollar index", "euro", "yuan", "currency", "currencies", "forex", "exchange rate",
    "gold", "bullion", "silver", "platinum", "palladium", "copper", "precious metals",
    "inflation", "cpi", "pce", "interest rate", "interest rates", "rate cut", "rate cuts", "rate hike", "rate hikes",
    "central bank", "federal reserve", "fed", "fomc", "powell", "ecb", "treasury yields", "bond yields", "recession",
    "gdp", "payrolls", "sanctions", "sanction",
    "oil", "crude", "brent", "wti", "opec", "natural gas", "lng", "hormuz",
    "bitcoin", "crypto", "cryptocurrency", "ethereum", "stablecoin", "tether",
  ],
  weak: [
    "price", "prices", "market", "markets", "economy", "economic", "stocks", "stock market", "wall street",
    "bonds", "treasury", "trade", "tariff", "tariffs", "exports", "imports", "budget", "debt", "deficit",
    "growth", "jobs", "unemployment", "surge", "surges", "plunge", "plunges", "rally", "slump", "record",
    "nasdaq", "dow", "shipping", "tanker", "tankers", "imf", "world bank",
  ],
  context: [
    "war", "attack", "strike", "strikes", "ceasefire", "missile", "missiles", "military", "israel", "iran",
    "iranian", "tehran", "trump", "white house", "nuclear", "iaea", "security council", "houthi", "houthis",
    "red sea", "gulf", "russia", "ukraine", "china", "hezbollah", "gaza",
  ],
  // The wider words an international article may pass the gate with (read by isWorldCandidate only):
  // business and economy beyond the market words above — the model then judges the article
  world: [
    "economy", "economic", "economist", "economists", "business", "businesses", "company", "companies", "corporate", "industry", "industrial",
    "bank", "banks", "banking", "lender", "loan", "loans", "credit", "mortgage", "housing", "property", "real estate", "rent",
    "sales", "retail", "consumer", "consumers", "spending", "demand", "supply", "shortage", "shortages", "factory", "manufacturing", "production",
    "earnings", "profit", "profits", "revenue", "shares", "investor", "investors", "investment", "fund", "funds", "merger", "acquisition", "ipo", "bankruptcy",
    "tax", "taxes", "fiscal", "monetary", "stimulus", "subsidy", "subsidies", "wage", "wages", "layoffs", "labor", "employment", "pension",
    "energy", "gasoline", "fuel", "electricity", "power grid", "pipeline", "refinery", "mining", "steel", "aluminium", "aluminum", "grain", "wheat", "food prices",
    "export", "exports", "import", "imports", "customs", "embargo", "blockade", "port", "ports", "freight", "supply chain", "chip", "chips", "semiconductor",
    "default", "devaluation", "currency crisis", "capital", "capital flight", "remittance", "remittances", "g7", "g20", "brics", "opec+", "summit",
    "election", "elections", "parliament", "government", "minister", "ministers", "policy", "ban", "deal", "talks", "negotiations", "agreement",
  ],
  negative: [
    "sponsored", "advertisement", "podcast", "watch live", "newsletter", "quiz", "webinar", "subscribe",
    "earnings call", "shares of", "ipo", "price target", "buy rating", "stock pick", "stocks to buy",
  ],
};

export const NEWS_KEYWORD_MIN_SCORE = 2;

/** Words of Iran (English): an international article that has one reaches the model even without an economic word */
export const NEWS_IRAN_WORDS = ["iran", "iranian", "iranians", "tehran", "persian gulf", "islamic republic", "khamenei", "pezeshkian"];

/** Vulgar words: a post with one is never published (dropped before the model) */
export const NEWS_PROFANITY = [
  "کیر", "کیری", "کیرم", "کون", "کونی", "جنده", "مادرجنده", "کسکش", "کس کش", "کصکش", "کسخل", "کس خل",
  "کس ننت", "حرومزاده", "حرامزاده", "پدرسگ", "پدر سگ", "گاییدن", "گاییدم", "گایید", "بگا", "گوه", "گه خوری",
  "تخمی", "لاشی", "جاکش",
];

/**
 * The analyst's card: the model reads the day's news (headlines and summaries) and explains it —
 * no forecast of any market (the day's news alone can't call one). Written again when new news
 * came in, at most every `minIntervalMinutes`.
 */
export const NEWS_ANALYSIS = {
  /**
   * The model, and only it (no other is tried when it fails): a little reasoning (the method is in
   * the prompt) and a JSON object as the answer
   */
  model: { ...GLM_FLASH, options: { response_format: { type: "json_object" }, reasoning_effort: "low" } },
  /** 0: the same news gives the same view (as far as the model allows) */
  temperature: 0,
  minIntervalMinutes: 30,
  /** The day's first analysis waits for this much news */
  minNews: 3,
  /** News read for one analysis (the most important and the newest) */
  maxNews: 30,
  /** Characters of each item's summary sent */
  summaryChars: 220,
  perDay: 30,
  /** Output tokens, with the reasoning's */
  maxTokens: 4000,
};

/** Pushes for important news (services/news/newsPush.service.js) */
export const NEWS_PUSH = {
  /** Only news published this recently (not a new channel's backlog) */
  freshMinutes: 30,
  /** One notification at most this often */
  minIntervalMinutes: 10,
  /** Browsers reached in one run (each is a request) */
  maxDevices: 200,
};
