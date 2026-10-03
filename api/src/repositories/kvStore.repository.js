/**
 * kvStore.repository.js — Large, read-mostly values in Workers KV: the price book and each price
 * source's items
 *
 * Read on every price request and written about once a minute by the cron, so they live in KV:
 * a read is served from the nearest Cloudflare location. KV is eventually consistent (a write can
 * take up to a minute to be seen everywhere) — fine for prices, which are a minute old anyway;
 * what must be read back at once (counters, overrides, the sources' sync state) is in D1
 * (stateStore.repository.js). The same get / getMany / put / delete interface as the state
 * store; without a KV binding (tests, local runs) the state store is used instead.
 */

import { getStateStore } from "./stateStore.repository.js";

const decode = (value, type) => {
  if (value === null || value === undefined) return null;
  if (type !== "json") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

function kvStore(kv) {
  return {
    kind: "kv",
    async get(key, type) {
      return decode(await kv.get(key), type);
    },
    async getMany(keys, type) {
      const unique = [...new Set(keys.filter(Boolean))];
      const values = await Promise.all(unique.map((key) => kv.get(key)));
      return new Map(unique.map((key, i) => [key, decode(values[i], type)]));
    },
    async put(key, value) {
      await kv.put(key, String(value));
    },
    async delete(key) {
      await kv.delete(key);
    },
  };
}

/** The store for the price book and the sources' items (KV, else the D1 state store) */
export function getBlobStore(env) {
  return typeof env?.KV?.get === "function" ? kvStore(env.KV) : getStateStore(env);
}
