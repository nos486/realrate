/**
 * logger.js — Structured single-line JSON logger for Cloudflare Workers & console
 * Includes automatic recursive redaction of sensitive credentials (passwords, tokens, E2EE keys).
 */

const SENSITIVE_KEY_REGEX = /^(password|passphrase|token|auth_token|secret|verifier|private_key|e2ee_verifier)$/i;

function sanitizeSensitive(val, seen = new WeakSet()) {
  if (!val || typeof val !== "object") return val;
  if (seen.has(val)) return "[CIRCULAR]";
  seen.add(val);

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeSensitive(item, seen));
  }

  const result = {};
  for (const [k, v] of Object.entries(val)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      result[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      result[k] = sanitizeSensitive(v, seen);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function formatMeta(meta) {
  if (!meta) return undefined;
  if (meta instanceof Error) {
    return {
      message: meta.message,
      name: meta.name,
      stack: meta.stack,
    };
  }
  if (typeof meta === "object") {
    try {
      const sanitized = sanitizeSensitive(meta);
      if (sanitized.error instanceof Error) {
        sanitized.error = {
          message: sanitized.error.message,
          name: sanitized.error.name,
          stack: sanitized.error.stack,
        };
      }
      return sanitized;
    } catch {
      return String(meta);
    }
  }
  return meta;
}

function createLogEntry(level, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === "string" ? message : (message?.message || String(message)),
  };

  const processedMeta = formatMeta(meta);
  if (processedMeta !== undefined) {
    if (typeof processedMeta === "object" && !Array.isArray(processedMeta)) {
      Object.assign(entry, processedMeta);
    } else {
      entry.meta = processedMeta;
    }
  }

  if (message instanceof Error && !entry.stack) {
    entry.stack = message.stack;
  }

  return JSON.stringify(entry);
}

export const logger = {
  info(msg, meta) {
    console.log(createLogEntry("info", msg, meta));
  },
  warn(msg, meta) {
    console.warn(createLogEntry("warn", msg, meta));
  },
  error(msg, meta) {
    console.error(createLogEntry("error", msg, meta));
  },
};
