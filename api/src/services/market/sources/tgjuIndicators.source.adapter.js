/**
 * tgjuIndicators.source.adapter.js — The latest value of tgju.org series, as price book items
 *
 * A source lists its series (`series: [{ slug, id, name }]` in sources.config.js): each becomes the
 * item `id`, in the source's `quote` (tgju gives rials). All series are read in one request from
 * tgju's live feed (tgju.client.js); a series the feed lacks, or every series when the feed fails,
 * is read from its daily table instead (whose newest row is the last closed day, so it lags). A
 * series that fails both ways is left out (the others still update), and the source fails only
 * when none answered.
 */

import { fetchTgjuCurrent, fetchTgjuLatest } from "../tgju.client.js";
import { normalizeTgjuSlug } from "../../../config/tgjuCatalog.js";
import { logger } from "../../../lib/logger.js";

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
    const live = await fetchTgjuCurrent(fetchImpl).catch((err) => {
      logger.warn("[tgju] Live feed failed, reading the daily tables:", { error: err?.message });
      return {};
    });
    const results = await Promise.allSettled(series.map((s) => (live[s.slug]
      ? { close: live[s.slug].price, live: true }
      : fetchTgjuLatest(s.slug, fetchImpl))));
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
