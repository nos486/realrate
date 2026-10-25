/**
 * rubikaBot.config.js — The Rubika bot: its limits and the Bot API address
 *
 * The bot's token, channel and switches are not here (the repo is public): they are the admin's
 * settings (admin panel → ربات روبیکا, stored in `app_state`) and the token can also come from the
 * `RUBIKA_BOT_TOKEN` secret (`wrangler secret put RUBIKA_BOT_TOKEN`), which wins. The queue's
 * other limits (its size, how long an article waits, retries) are Telegram's (BOT_LIMITS).
 */

/** The Bot API; the token and the method follow: `${RUBIKA_API}/<token>/<method>` */
export const RUBIKA_API = "https://botapi.rubika.ir/v3";

export const RUBIKA_LIMITS = {
  /** Messages sent to the channel in one run */
  sendPerRun: 5,
  /** Time allowed for one Bot API request */
  timeoutMs: 10000,
  /** A code that links the admin's Rubika account stays valid this long */
  linkCodeMinutes: 30,
};

/** The endpoints Rubika posts to (each is our webhook address + `/receiveUpdate` and so on) */
export const RUBIKA_ENDPOINTS = ["ReceiveUpdate", "ReceiveInlineMessage"];
