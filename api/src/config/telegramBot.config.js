/**
 * telegramBot.config.js — The Telegram bot: its limits and the Bot API address
 *
 * The bot's token, channel and switches are not here (the repo is public): they are the admin's
 * settings (admin panel → ربات تلگرام, stored in `app_state`) and the token can also come from the
 * `TELEGRAM_BOT_TOKEN` secret (`wrangler secret put TELEGRAM_BOT_TOKEN`), which wins.
 */

/** The Bot API; the token goes after `/bot` */
export const TELEGRAM_API = "https://api.telegram.org";

export const BOT_LIMITS = {
  /** Messages sent to the channel in one run (Telegram allows about 20 a minute to one channel) */
  sendPerRun: 8,
  /** Articles waiting to be sent (the oldest are dropped past it) */
  queueMax: 100,
  /** An article waiting longer than this is dropped (the bot was off, broken or rate limited) */
  queueMaxHours: 6,
  /** Sent articles remembered, so one is never posted twice */
  sentMax: 500,
  /** A message that Telegram refused is tried again at most this many times, then dropped */
  maxTries: 3,
  /** The article's summary under its headline, in characters */
  summaryChars: 280,
  /** A message is held back this many runs when the translation fails, then posted as the feed gave it */
  translateTries: 3,
  /** Time allowed for one Bot API request */
  timeoutMs: 10000,
};
