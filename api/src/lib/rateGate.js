/**
 * rateGate.js — Retired
 *
 * This was a Durable Object that capped Gemini calls for all users together; the cap was dropped.
 * The class stays exported (with its migration in wrangler.toml) only because deleting a Durable
 * Object class takes a `deleted_classes` migration, which Cloudflare refuses in PR preview builds.
 * Nothing binds or calls it.
 */

export class RateGate {
  async fetch() {
    return new Response("gone", { status: 410 });
  }
}
