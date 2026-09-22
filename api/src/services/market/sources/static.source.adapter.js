/**
 * static.source.adapter.js — Adapter for Fixed / Static Value Price Sources (e.g. Toman Cash)
 * Returns invariant constant prices without network overhead.
 */

/**
 * Static Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const staticSourceAdapter = {
  id: "static",
  name: "نرخ ثابت",

  supports(sourceConfig) {
    const sType = String(sourceConfig?.sourceType || sourceConfig?.source_type || "").toLowerCase().trim();
    return sType === "static";
  },

  async fetchRaw(sourceConfig) {
    return { staticPrice: sourceConfig?.staticPrice ?? 1 };
  },

  parse(raw, sourceConfig) {
    const price = Number(sourceConfig?.staticPrice ?? raw?.staticPrice ?? 1);
    return {
      items: [
        {
          id: sourceConfig?.id || "src_def_toman",
          name: sourceConfig?.name || "تومان نقد",
          price: isNaN(price) || price <= 0 ? 1 : price,
        },
      ],
      datetime: new Date().toISOString(),
    };
  },

  async getItems(env) {
    return [
      {
        id: "src_def_toman",
        name: "تومان نقد",
        price: 1,
      },
    ];
  },
};
