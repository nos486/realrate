/**
 * banks.config.js — Standard registry of Iranian banks and credit institutions
 *
 * Single source of truth for every feature that references a bank (loans today; bank accounts,
 * cards, ... later). Shared with the web client through a symlink, like the other config files.
 *
 * A bank is referenced everywhere by its stable `id` (never by its display name). User-defined
 * banks live in the `custom_banks` table and use ids prefixed with CUSTOM_BANK_PREFIX, so a
 * `bankId` value is always either a standard id below or a custom bank id.
 *
 * Logos: /banks/<id>.svg in the web app's public folder (MIT, @iran-utils/iranian-banks-icons-core).
 */

export const CUSTOM_BANK_PREFIX = "cb_";

export const BANK_TYPES = {
  state: "بانک‌های دولتی",
  private: "بانک‌های خصوصی",
  qarz: "بانک‌های قرض‌الحسنه",
  institution: "مؤسسات اعتباری",
  digital: "بانک‌های دیجیتال",
  joint: "بانک‌های مشترک",
};

/**
 * @typedef {object} BankSpec
 * @property {string} id         Stable identifier (never changes once shipped)
 * @property {string} name       Full Persian name
 * @property {string} shortName  Compact Persian name for tight UI
 * @property {string} enName     English name
 * @property {keyof BANK_TYPES} type
 * @property {string[]} [aliases] Extra names that should resolve to this bank (merged banks, spellings)
 * @property {boolean} [legacy]   Dissolved/merged — still resolves for old records, hidden from pickers
 */

/** @type {BankSpec[]} */
export const BANKS = [
  // ── State-owned & specialized ─────────────────────────────────────────────
  { id: "melli", name: "بانک ملی ایران", shortName: "ملی", enName: "Bank Melli Iran", type: "state" },
  { id: "sepah", name: "بانک سپه", shortName: "سپه", enName: "Bank Sepah", type: "state", aliases: ["انصار", "قوامین", "حکمت ایرانیان", "حکمت", "کوثر", "مهر اقتصاد"] },
  { id: "keshavarzi", name: "بانک کشاورزی", shortName: "کشاورزی", enName: "Bank Keshavarzi", type: "state" },
  { id: "maskan", name: "بانک مسکن", shortName: "مسکن", enName: "Bank Maskan", type: "state" },
  { id: "sanat-madan", name: "بانک صنعت و معدن", shortName: "صنعت و معدن", enName: "Bank of Industry and Mine", type: "state" },
  { id: "tosee-saderat", name: "بانک توسعه صادرات ایران", shortName: "توسعه صادرات", enName: "Export Development Bank of Iran", type: "state" },
  { id: "tosee-taavon", name: "بانک توسعه تعاون", shortName: "توسعه تعاون", enName: "Tose'e Ta'avon Bank", type: "state" },
  { id: "post", name: "پست بانک ایران", shortName: "پست بانک", enName: "Post Bank of Iran", type: "state" },
  { id: "mellat", name: "بانک ملت", shortName: "ملت", enName: "Bank Mellat", type: "state" },
  { id: "saderat", name: "بانک صادرات ایران", shortName: "صادرات", enName: "Bank Saderat Iran", type: "state" },
  { id: "tejarat", name: "بانک تجارت", shortName: "تجارت", enName: "Tejarat Bank", type: "state" },
  { id: "refah", name: "بانک رفاه کارگران", shortName: "رفاه", enName: "Refah Kargaran Bank", type: "state" },

  // ── Private ───────────────────────────────────────────────────────────────
  { id: "pasargad", name: "بانک پاسارگاد", shortName: "پاسارگاد", enName: "Bank Pasargad", type: "private" },
  { id: "parsian", name: "بانک پارسیان", shortName: "پارسیان", enName: "Parsian Bank", type: "private" },
  { id: "saman", name: "بانک سامان", shortName: "سامان", enName: "Saman Bank", type: "private" },
  { id: "eghtesad-novin", name: "بانک اقتصاد نوین", shortName: "اقتصاد نوین", enName: "EN Bank", type: "private" },
  { id: "karafarin", name: "بانک کارآفرین", shortName: "کارآفرین", enName: "Karafarin Bank", type: "private" },
  { id: "sina", name: "بانک سینا", shortName: "سینا", enName: "Sina Bank", type: "private" },
  { id: "sarmayeh", name: "بانک سرمایه", shortName: "سرمایه", enName: "Sarmayeh Bank", type: "private" },
  { id: "shahr", name: "بانک شهر", shortName: "شهر", enName: "Shahr Bank", type: "private" },
  { id: "dey", name: "بانک دی", shortName: "دی", enName: "Dey Bank", type: "private" },
  { id: "iran-zamin", name: "بانک ایران زمین", shortName: "ایران زمین", enName: "Iran Zamin Bank", type: "private" },
  { id: "khavarmianeh", name: "بانک خاورمیانه", shortName: "خاورمیانه", enName: "Middle East Bank", type: "private" },
  { id: "gardeshgari", name: "بانک گردشگری", shortName: "گردشگری", enName: "Tourism Bank", type: "private" },

  // ── Qard al-hasan ─────────────────────────────────────────────────────────
  { id: "mehr-iran", name: "بانک قرض‌الحسنه مهر ایران", shortName: "مهر ایران", enName: "Mehr Iran Bank", type: "qarz" },
  { id: "resalat", name: "بانک قرض‌الحسنه رسالت", shortName: "رسالت", enName: "Resalat Bank", type: "qarz" },

  // ── Credit institutions ───────────────────────────────────────────────────
  { id: "tosee", name: "مؤسسه اعتباری توسعه", shortName: "توسعه", enName: "Tose'e Credit Institution", type: "institution" },
  { id: "melal", name: "مؤسسه اعتباری ملل", shortName: "ملل", enName: "Melal Credit Institution", type: "institution" },
  { id: "noor", name: "مؤسسه اعتباری نور", shortName: "نور", enName: "Noor Credit Institution", type: "institution" },
  { id: "caspian", name: "مؤسسه اعتباری کاسپین", shortName: "کاسپین", enName: "Caspian Credit Institution", type: "institution" },

  // ── Digital ───────────────────────────────────────────────────────────────
  { id: "blu", name: "بلوبانک", shortName: "بلو", enName: "Blu Bank", type: "digital", aliases: ["بلو بانک"] },

  // ── Joint & international ─────────────────────────────────────────────────
  { id: "iran-europe", name: "بانک ایران و اروپا", shortName: "ایران و اروپا", enName: "Europäisch-Iranische Handelsbank", type: "joint" },
  { id: "iran-venezuela", name: "بانک ایران و ونزوئلا", shortName: "ایران و ونزوئلا", enName: "Iran-Venezuela Bi-National Bank", type: "joint" },
  { id: "taavon-eslami", name: "بانک همکاری اسلامی", shortName: "همکاری اسلامی", enName: "Islamic Cooperation Bank", type: "joint" },

  // ── Legacy (dissolved — kept so older records still resolve) ──────────────
  { id: "ayandeh", name: "بانک آینده", shortName: "آینده", enName: "Ayandeh Bank", type: "private", legacy: true },
];

const BANK_BY_ID = new Map(BANKS.map((bank) => [bank.id, bank]));

/**
 * @param {string} id
 * @returns {BankSpec|null}
 */
export function getBankById(id) {
  return BANK_BY_ID.get(String(id || "")) || null;
}

/** Whether an id refers to a user-defined bank */
export function isCustomBankId(id) {
  return typeof id === "string" && id.startsWith(CUSTOM_BANK_PREFIX);
}

/**
 * Normalize a free-text bank name into a comparison key: Arabic ي/ك → Persian, drop the
 * "بانک"/"مؤسسه اعتباری"/"قرض‌الحسنه"/"ایران" noise words, ZWNJ and all spacing.
 * @param {string} value
 * @returns {string}
 */
export function normalizeBankName(value) {
  return String(value || "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ؤ/g, "و")
    .replace(/[‌‏‎]/g, " ")
    .replace(/(^|\s)(بانک|بانك|موسسه|مؤسسه|اعتباری|قرض\s*الحسنه|قرض‌الحسنه|ایران)(?=\s|$)/g, " ")
    // Spacing is inconsistent in the wild ("اقتصاد نوین" / "اقتصادنوین"), so compare without it
    .replace(/\s+/g, "")
    .toLowerCase();
}

// Built once: every normalized spelling (name, shortName, enName, aliases) → bank id
const BANK_ID_BY_NAME = (() => {
  const index = new Map();
  const add = (label, id) => {
    const key = normalizeBankName(label);
    if (key && !index.has(key)) index.set(key, id);
  };
  for (const bank of BANKS) {
    add(bank.name, bank.id);
    add(bank.shortName, bank.id);
    add(bank.enName, bank.id);
    add(bank.id.replace(/-/g, " "), bank.id);
    for (const alias of bank.aliases || []) add(alias, bank.id);
  }
  return index;
})();

/**
 * Resolve a free-text lender name (e.g. from loans created before banks were standardized)
 * to a standard bank id.
 * @param {string} name
 * @returns {string|null}
 */
export function matchBankIdByName(name) {
  const key = normalizeBankName(name);
  if (!key) return null;
  return BANK_ID_BY_NAME.get(key) || null;
}
