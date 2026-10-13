/**
 * dollarOutlook.config.js — The dollar outlook experiment (admin only)
 *
 * Once a day the model reads the week's news and the dollar's last daily closes and gives three
 * scenarios for the close `horizonDays` later. Nothing is shown to users: the records and how
 * they fared against the real closes are the admin's, to judge whether the model beats a flat
 * guess before anything is ever published.
 */

import { NEWS_ANALYSIS } from "./news.config.js";

export const DOLLAR_OUTLOOK = {
  /** The price book id of the dollar */
  itemId: "usd",
  /** The same model as the news analysis (Workers AI) */
  model: NEWS_ANALYSIS.model,
  temperature: 0,
  maxTokens: 4000,
  /** Days ahead the scenario is about */
  horizonDays: 7,
  /** Daily closes sent (the newest) */
  historyDays: 30,
  /** News sent: the week's most important, oldest first */
  newsDays: 7,
  maxNews: 20,
  summaryChars: 160,
  /** A move smaller than this (%) either way counts as "flat" */
  flatBandPct: 1,
  /** Recorded once a day, from this Tehran hour on (the day's news is in by then) */
  recordFromHour: 20,
  /** Records older than this are dropped */
  keepDays: 150,
  /** Records the admin's page lists (the newest) */
  listDays: 60,
};
