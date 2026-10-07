/**
 * riskProfile.js — The risk-tolerance test («آزمون ریسک‌پذیری»): questions, scoring and profiles
 *
 * The user fixes the amount they would put at risk (`totalAsset`, the portfolio's value by
 * default) and then answers one question per ratio in RISK_RATIOS: "with a 50/50 chance, how
 * much would you risk to win `ratio` times as much?". Each answer is an amount between 0 and
 * `totalAsset`. The score is the mean of the answers as a share of `totalAsset` (0–100); the
 * profile is the band the score falls in (RISK_PROFILES), which also carries the suggested mix.
 *
 * The result is kept per portfolio as one end-to-end encrypted vault record (kind
 * "risk_profile", parent = the portfolio, encrypted with the portfolio's key); only the latest
 * result is kept. Pure and shared with the web app through a symlink
 * (web/src/utils/riskProfile.js), so it must not touch Worker bindings.
 */

export const RISK_RECORD_KIND = 'risk_profile';

/** Reward-to-risk ratio of each question, in order */
export const RISK_RATIOS = [1.25, 2, 2.75, 3.5, 4.25, 5];

/** The slider moves in this many steps between 0 and the amount at risk */
export const RISK_SLIDER_STEPS = 1000;

/**
 * Profiles by score band [from, to): to extend the test, add a band (the last one includes 100).
 * `allocation` is the suggested mix (shares add up to 100); keys come from RISK_ASSET_CLASSES.
 */
export const RISK_PROFILES = [
  {
    id: 'conservative', from: 0, to: 20, title: 'محافظه‌کار',
    summary: 'حفظ سرمایه برای شما از رشد آن مهم‌تر است.',
    text: 'افراد محافظه‌کار حاضر نیستند برای سود بیشتر، بخش مهمی از سرمایه‌شان را در معرض زیان قرار دهند. نوسان بازار برایشان ناخوشایند است و ثبات و پیش‌بینی‌پذیری را به بازده بالا ترجیح می‌دهند. سبد مناسب این گروه بیشتر از دارایی‌های کم‌نوسان و درآمد ثابت تشکیل می‌شود و سهم کمی برای دارایی‌های پرنوسان دارد.',
    allocation: { fixed_income: 80, gold: 10, stocks: 10, crypto: 0 },
  },
  {
    id: 'cautious', from: 20, to: 40, title: 'محتاط',
    summary: 'سود پایدار را می‌خواهید و فقط کمی ریسک می‌پذیرید.',
    text: 'این گروه آمادهٔ پذیرش مقدار کمی نوسان در برابر بازدهی بهتر است، اما همچنان نگران زیان‌های بزرگ می‌ماند. معمولاً ترکیبی از درآمد ثابت و طلا را با سهم محدودی سهام ترجیح می‌دهند تا هم سرمایه حفظ شود و هم رشد ملایمی داشته باشد.',
    allocation: { fixed_income: 60, gold: 15, stocks: 23, crypto: 2 },
  },
  {
    id: 'balanced', from: 40, to: 60, title: 'متعادل',
    summary: 'میان امنیت و رشد تعادل برقرار می‌کنید.',
    text: 'افراد متعادل می‌پذیرند که برای رسیدن به بازده بهتر باید نوسان و زیان‌های دوره‌ای را تحمل کنند، به شرطی که سرمایه میان چند دارایی پخش شده باشد. سبد این گروه سهم قابل‌توجهی سهام دارد و بخش دیگرش به طلا و درآمد ثابت می‌رسد.',
    allocation: { fixed_income: 40, gold: 15, stocks: 40, crypto: 5 },
  },
  {
    id: 'bold', from: 60, to: 80, title: 'ریسک‌پذیر',
    summary: 'برای رشد بلندمدت، نوسان و زیان‌های بزرگ را تحمل می‌کنید.',
    text: 'افراد ریسک‌پذیر تمایل دارند وارد بازارهای پرنوسان شوند و با این امید که در بلندمدت به دارایی بیشتری برسند، خود را در معرض ریسک‌های بالا قرار می‌دهند. سهم سهام در سبد آن‌ها بیشتر است. باید توجه کرد که هرچه بازدهی بالقوهٔ سبد بیشتر باشد، ریسک آن هم بیشتر است و احتمال زیان‌های بزرگ وجود دارد؛ این سطح از ریسک‌پذیری ظرفیت روانی و مالی لازم برای تحمل زیان را می‌خواهد.',
    allocation: { fixed_income: 20, gold: 15, stocks: 55, crypto: 10 },
  },
  {
    id: 'aggressive', from: 80, to: 100, title: 'جسور / بی‌باک',
    summary: 'بیشترین بازده را هدف می‌گیرید و زیان‌های سنگین را می‌پذیرید.',
    text: 'این گروه حاضر است بخش بزرگی از سرمایه را برای شانس سود بسیار بالا به خطر بیندازد. سبدش تقریباً همه در دارایی‌های پرنوسان است. چنین سطحی از ریسک فقط برای کسی مناسب است که اگر بخش بزرگی از این سرمایه را از دست بدهد، زندگی و اهداف مالی‌اش آسیب جدی نبیند.',
    allocation: { fixed_income: 5, gold: 10, stocks: 65, crypto: 20 },
  },
];

/** Asset classes of the suggested mix (label shown to the user) */
export const RISK_ASSET_CLASSES = {
  fixed_income: 'درآمد ثابت',
  gold: 'طلا و سکه',
  stocks: 'سهام و صندوق‌ها',
  crypto: 'ارز دیجیتال',
};

const round1 = (n) => Math.round(n * 10) / 10;
const finite = (n) => Number.isFinite(Number(n)) && Number(n) >= 0;

/** The profile a score belongs to (the last band includes 100) */
export function profileOf(score) {
  const s = Math.min(100, Math.max(0, Number(score) || 0));
  return RISK_PROFILES.find((p) => s >= p.from && s < p.to) || RISK_PROFILES[RISK_PROFILES.length - 1];
}

/** A profile's suggested mix as legend items { key, label, value }, in the profile's order */
export function mixItemsOf(allocation = {}) {
  return Object.entries(allocation).map(([key, value]) => ({ key, label: RISK_ASSET_CLASSES[key] || key, value }));
}

/** What a question's answer means: the loss accepted and the gain hoped for (same unit as the answer) */
export function outcomeOf(answer, ratio) {
  const loss = Number(answer) || 0;
  return { loss, gain: loss * ratio };
}

/**
 * The 0–100 score: the mean of each answer's share of `totalAsset` (a missing answer counts 0)
 * @param {number[]} answers one amount per RISK_RATIOS entry
 * @param {number} totalAsset
 * @returns {number} one decimal
 */
export function scoreRisk(answers, totalAsset) {
  const total = Number(totalAsset);
  if (!(total > 0)) return 0;
  const shares = RISK_RATIOS.map((_, i) => Math.min(1, Math.max(0, (Number(answers?.[i]) || 0) / total)) * 100);
  return round1(shares.reduce((s, v) => s + v, 0) / RISK_RATIOS.length);
}

/**
 * Validate a finished test and give the record to store, or { error }
 * @param {{ totalAsset: number, answers: number[], takenAt?: string }} input
 * @returns {{ value?: { totalAsset: number, answers: number[], score: number, profile: string, takenAt: string }, error?: string }}
 */
export function validateRiskResult(input) {
  const totalAsset = Math.round(Number(input?.totalAsset));
  if (!(totalAsset > 0)) return { error: 'مبلغ دارایی نامعتبر است.' };
  const raw = input?.answers;
  if (!Array.isArray(raw) || raw.length !== RISK_RATIOS.length || !raw.every(finite)) {
    return { error: 'پاسخ‌های آزمون کامل نیست.' };
  }
  const answers = raw.map((a) => Math.min(totalAsset, Math.round(Number(a))));
  const score = scoreRisk(answers, totalAsset);
  const takenAt = typeof input.takenAt === 'string' && !Number.isNaN(Date.parse(input.takenAt))
    ? input.takenAt
    : new Date().toISOString();
  return { value: { totalAsset, answers, score, profile: profileOf(score).id, takenAt } };
}
