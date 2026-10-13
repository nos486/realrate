/**
 * dollarOutlook.js — Pure logic of the dollar outlook experiment: the model's prompt and answer,
 * and how a scenario fared against the real close (see config/dollarOutlook.config.js)
 *
 * The answer is three probabilities (up / flat / down over the horizon) and a range for the close.
 * Scoring compares them with a flat guess, the baseline the model has to beat to be worth showing.
 */

import { hasForeignText } from "./news.js";

const SYSTEM = `You are a cautious Iranian FX analyst. You get the US dollar's daily closes in tomans (oldest first) and the week's most important Persian news (oldest first, "!" marks the highest importance).
Give THREE SCENARIOS for the dollar's close HORIZON days after the last close — not advice. Use only what you are given.
Answer ONLY a JSON object: {"u":<int 0-100 chance the close is more than BAND% above the last close>,"f":<int chance within ±BAND%>,"d":<int chance more than BAND% below>,"lo":<number, low end of a likely range for the close in tomans>,"hi":<number, high end>,"r":"<one or two Persian sentences: the main reason, naming the news or the trend it rests on>"}.
u+f+d must be 100. Do not be more sure than the data allows; when the news and the trend disagree, keep f high. Write "r" in Persian only, with no Latin words.`;

/**
 * @param {{ day: string, close: number }[]} closes - the newest daily closes, oldest first
 * @param {Array<{ title: string, summary?: string, publishedAt: number, importance?: number }>} news
 * @param {{ horizonDays: number, flatBandPct: number, summaryChars: number, tehranClock: (ms: number) => string }} opts
 */
export function buildOutlookPrompt(closes, news, { horizonDays, flatBandPct, summaryChars, tehranClock }) {
  const priceLines = closes.map((c) => `${c.day} ${Math.round(c.close)}`);
  const newsLines = news.map((n, i) => {
    const summary = n.summary && n.summary !== n.title ? ` — ${String(n.summary).slice(0, summaryChars)}` : "";
    return `N${i + 1} [${tehranClock(n.publishedAt)}${n.importance >= 3 ? " !" : ""}] ${n.title}${summary}`;
  });
  return [
    { role: "system", content: SYSTEM.replaceAll("HORIZON", String(horizonDays)).replaceAll("BAND", String(flatBandPct)) },
    { role: "user", content: `DOLLAR CLOSES (toman):\n${priceLines.join("\n")}\n\nNEWS OF THE WEEK:\n${newsLines.join("\n")}` },
  ];
}

const clipText = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;
};

/** Three integer probabilities that add up to 100, or null when they can't be read */
function normalizeProbs(u, f, d) {
  const raw = [u, f, d].map((v) => Math.max(0, Number(v)));
  if (raw.some((v) => !Number.isFinite(v))) return null;
  const sum = raw[0] + raw[1] + raw[2];
  if (sum <= 0) return null;
  const up = Math.round((raw[0] / sum) * 100);
  const down = Math.round((raw[2] / sum) * 100);
  return { up, flat: 100 - up - down, down };
}

/**
 * The model's answer as a scenario, or null when it isn't usable (broken JSON, no probabilities,
 * a range far from the last close, words of another language)
 * @param {string|object} answer
 * @param {number} lastClose
 * @returns {{ up: number, flat: number, down: number, low: number, high: number, reason: string }|null}
 */
export function parseOutlook(answer, lastClose) {
  let body = answer;
  if (typeof answer === "string") {
    const start = answer.indexOf("{");
    const end = answer.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      body = JSON.parse(answer.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  const probs = normalizeProbs(body.u, body.f, body.d);
  const low = Number(body.lo);
  const high = Number(body.hi);
  const reason = clipText(body.r, 400);
  if (!probs || !reason || hasForeignText(reason)) return null;
  if (![low, high].every((v) => Number.isFinite(v) && v > lastClose * 0.5 && v < lastClose * 2) || low > high) return null;
  return { ...probs, low: Math.round(low), high: Math.round(high), reason };
}

/** Which way a move went: "up" / "down" past the band, else "flat" */
export function moveLabel(base, close, bandPct) {
  const pct = ((close - base) / base) * 100;
  return pct > bandPct ? "up" : pct < -bandPct ? "down" : "flat";
}

/**
 * How a scenario fared against the real close
 * @returns {{ close: number, label: string, hit: boolean, inRange: boolean, brier: number, baselineHit: boolean, baselineBrier: number }}
 */
export function scoreOutlook(rec, close, bandPct) {
  const label = moveLabel(rec.base, close, bandPct);
  const p = { up: rec.up / 100, flat: rec.flat / 100, down: rec.down / 100 };
  const top = Object.keys(p).reduce((a, b) => (p[b] > p[a] ? b : a), "flat");
  const brier = ["up", "flat", "down"].reduce((s, k) => s + (p[k] - (k === label ? 1 : 0)) ** 2, 0);
  return {
    close,
    label,
    hit: top === label,
    inRange: close >= rec.low && close <= rec.high,
    brier,
    // A flat guess: "nothing moves" with full certainty
    baselineHit: label === "flat",
    baselineBrier: label === "flat" ? 0 : 2,
  };
}

/** Totals over the scored records: the model against the flat guess (lower Brier is better) */
export function summarizeOutlooks(scored) {
  const n = scored.length;
  if (!n) return { n: 0 };
  const rate = (f) => Math.round((scored.filter(f).length / n) * 100);
  const mean = (f) => Math.round((scored.reduce((s, r) => s + f(r), 0) / n) * 1000) / 1000;
  return {
    n,
    hitRate: rate((r) => r.hit),
    baselineHitRate: rate((r) => r.baselineHit),
    inRangeRate: rate((r) => r.inRange),
    brier: mean((r) => r.brier),
    baselineBrier: mean((r) => r.baselineBrier),
  };
}
