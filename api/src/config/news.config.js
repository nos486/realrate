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

/** JSON only, the request's own way (models that take it; the prompt asks for JSON anyway) */
const JSON_ANSWER = { response_format: { type: "json_object" } };

/**
 * The models screening posts, on Workers AI (the `AI` binding in wrangler.toml), tried in order
 * (services/news/workersAi.js): Gemma 4 writes Persian well and is cheap for many small requests
 * (no reasoning: a verdict per post doesn't need it); Llama 3.3 when it fails. The answer is a
 * JSON array, so no `json_object` here.
 */
export const NEWS_AI_MODELS = [
  { id: "@cf/google/gemma-4-26b-a4b-it", options: { chat_template_kwargs: { enable_thinking: false } } },
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
  /** The model when the admin hasn't chosen one (NEWS_ANALYSIS_MODELS), and the ones tried after it */
  defaultModel: "@cf/deepseek-ai/deepseek-v4-flash-0731",
  fallbackModels: ["@cf/google/gemma-4-26b-a4b-it", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
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
  /** Prices shown to the model (price book ids) */
  priceIds: ["usd", "eur", "gold_18k", "full_coin", "mesghal", "ons_gold", "ons_silver", "usdt"],
  /** Their 7- and 30-day trend shown too (from the daily history: KV, no database read) */
  trendIds: ["usd", "ons_gold", "gold_18k", "full_coin"],
  /** A previous outlook younger than this is the starting point of the next one (stability) */
  previousMaxHours: 24,
};
/**
 * The models the analyst's card can use — all on Workers AI (Cloudflare-hosted), compared side by
 * side in the admin's model lab, one of them chosen (services/news/newsAnalysis.service.js). Each
 * request asks for little reasoning (the method is in the prompt) and JSON where the model takes it;
 * price: USD per million tokens, in / out (Cloudflare's list price).
 */
const LOW_REASONING = { reasoning_effort: "low" };
const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };
export const NEWS_ANALYSIS_MODELS = [
  { id: "@cf/deepseek-ai/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash", vendor: "DeepSeek", price: [0.44, 1.32], options: { ...JSON_ANSWER, ...LOW_REASONING } },
  { id: "@cf/deepseek-ai/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", vendor: "DeepSeek", price: [1.32, 3.96], options: { ...JSON_ANSWER, ...LOW_REASONING } },
  { id: "@cf/moonshotai/kimi-k2.6", label: "Kimi K2.6", vendor: "Moonshot", price: [0.95, 4], options: { ...JSON_ANSWER, ...LOW_REASONING } },
  { id: "@cf/zai-org/glm-5.3", label: "GLM 5.3", vendor: "Z.ai", price: [1.4, 4.4], options: { ...JSON_ANSWER, ...LOW_REASONING } },
  { id: "@cf/zai-org/glm-5.3-flash", label: "GLM 5.3 Flash", vendor: "Z.ai", price: [0.15, 0.5], options: { ...JSON_ANSWER, ...LOW_REASONING } },
  { id: "@cf/qwen/qwen3.8-27b", label: "Qwen 3.8 27B", vendor: "Alibaba", price: [0.45, 3.2], options: { ...JSON_ANSWER, ...LOW_REASONING } },
  { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B", vendor: "Google", price: [0.1, 0.3], options: { ...JSON_ANSWER, ...NO_THINKING } },
  { id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B", vendor: "OpenAI", price: [0.35, 0.75], options: { ...JSON_ANSWER, reasoning: { effort: "low" } } },
  { id: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 Super", vendor: "NVIDIA", price: [0.5, 1.5], options: { ...JSON_ANSWER, ...NO_THINKING } },
  { id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout", vendor: "Meta", price: [0.27, 0.85], options: { ...JSON_ANSWER } },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B", vendor: "Meta", price: [0.29, 2.25], options: {} },
];

/** A model of the catalog by id, or null */
export const newsAnalysisModel = (id) => NEWS_ANALYSIS_MODELS.find((m) => m.id === id) || null;

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
