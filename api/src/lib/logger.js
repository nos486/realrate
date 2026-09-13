/**
 * logger.js — Structured single-line JSON logger for Cloudflare Workers & console
 */

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
      const formatted = { ...meta };
      if (formatted.error instanceof Error) {
        formatted.error = {
          message: formatted.error.message,
          name: formatted.error.name,
          stack: formatted.error.stack,
        };
      }
      return formatted;
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
