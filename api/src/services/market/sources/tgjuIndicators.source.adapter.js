/**
 * tgjuIndicators.source.adapter.js — The latest value of tgju.org series, as price book items
 *
 * A source lists its series (`series: [{ slug, id, name }]` in sources.config.js): each is read
 * from tgju's daily table (tgju.client.js, the same reader the history backfill uses) and becomes
 * the item `id`, in the source's `quote` (tgju gives rials). One request per series; a series that
 * fails is left out (the others still update), and the source fails only when none answered.
 */

import { fetchTgjuLatest } from "../tgju.client.js";
import { normalizeTgjuSlug } from "../../../config/tgjuCatalog.js";

/** The source's series, with a valid slug and an id */
const seriesOf = (sourceConfig) => (Array.isArray(sourceConfig?.series) ? sourceConfig.series : [])
  .map((s) => ({ ...s, slug: normalizeTgjuSlug(s?.slug) }))
  .filter((s) => s.slug && s.id);

/**
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const tgjuIndicatorsSourceAdapter = {
  id: "tgju_indicators",
  name: "سری‌های tgju",

  /** @returns {Promise<Array<{ slug: string, id: string, name?: string, latest?: object, error?: string }>>} */
  async fetchRaw(sourceConfig, env = null, fetchImpl = fetch) {
    const series = seriesOf(sourceConfig);
    if (!series.length) throw new Error("هیچ سری tgju برای این سورس تعریف نشده است.");
    const results = await Promise.allSettled(series.map((s) => fetchTgjuLatest(s.slug, fetchImpl)));
    const read = series.map((s, i) => (results[i].status === "fulfilled"
      ? { ...s, latest: results[i].value }
      : { ...s, error: results[i].reason?.message || "خطا" }));
    if (!read.some((r) => r.latest)) {
      throw new Error(`هیچ سری tgju خوانده نشد: ${read.map((r) => `${r.slug} (${r.error})`).join("، ")}`);
    }
    return read;
  },

  parse(raw) {
    const items = (Array.isArray(raw) ? raw : [])
      .filter((r) => r.latest && Number(r.latest.close) > 0)
      .map((r) => ({ id: r.id, name: r.name || r.id, price: Number(r.latest.close) }));
    return { items, datetime: new Date().toISOString() };
  },
};
