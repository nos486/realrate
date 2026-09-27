/**
 * rateGate.js — Cap how often a paid service is called, across all users and all Workers
 *
 * One Durable Object per service (binding RATE_GATE) keeps the times of its recent calls; a
 * Durable Object handles its requests one at a time, so the count is exact everywhere (KV, which
 * takes up to a minute to reach other locations, could not). A call is allowed while fewer than
 * `limit` calls were made in the last `windowSec` seconds (a sliding window).
 *
 * The limits are in config/usageLimits.js (SERVICE_RATE_LIMITS).
 */

import { AppError } from "./AppError.js";
import { logger } from "./logger.js";
import { SERVICE_RATE_LIMITS } from "../config/usageLimits.js";

/**
 * The decision for one call, given the times of the recent ones (pure; the Durable Object keeps
 * `times` between calls)
 * @returns {{ ok: boolean, times: number[], retryAfterSec: number }}
 */
export function decideRateSlot(times, now, { limit, windowSec }) {
  const windowMs = windowSec * 1000;
  const recent = (Array.isArray(times) ? times : []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    return { ok: false, times: recent, retryAfterSec };
  }
  return { ok: true, times: [...recent, now], retryAfterSec: 0 };
}

/** The Durable Object: one instance per service name */
export class RateGate {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { limit, windowSec } = await request.json();
    const times = (await this.state.storage.get("times")) || [];
    const decision = decideRateSlot(times, Date.now(), { limit, windowSec });
    await this.state.storage.put("times", decision.times);
    return Response.json({ ok: decision.ok, retryAfterSec: decision.retryAfterSec });
  }
}

const faNum = (n) => Number(n).toLocaleString("fa-IR");

/**
 * Take one call of `service`, or refuse with 429 SERVICE_BUSY. Without the binding (a local run)
 * the call is allowed with a warning.
 */
export async function acquireServiceSlot(env, service) {
  const rule = SERVICE_RATE_LIMITS[service];
  if (!rule) return;
  if (!env?.RATE_GATE) {
    logger.warn("[RateGate] RATE_GATE binding missing; not limiting", { service });
    return;
  }
  let decision;
  try {
    const stub = env.RATE_GATE.get(env.RATE_GATE.idFromName(service));
    const res = await stub.fetch("https://rate-gate/acquire", {
      method: "POST",
      body: JSON.stringify(rule),
    });
    decision = await res.json();
  } catch (err) {
    // A failure of the gate itself must not block the feature
    logger.warn("[RateGate] check failed; allowing", { service, error: err.message });
    return;
  }
  if (!decision?.ok) {
    throw new AppError(
      `سرویس شلوغ است؛ حدود ${faNum(decision?.retryAfterSec || 60)} ثانیه دیگر دوباره امتحان کنید.`,
      429,
      "SERVICE_BUSY",
    );
  }
}
