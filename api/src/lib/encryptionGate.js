/**
 * encryptionGate.js — End-to-end encryption is mandatory for saving financial data
 *
 * No financial data may be stored unencrypted:
 * - A user without the account vault (a new account, before it sets one up) cannot save
 *   anything of theirs (403 ENCRYPTION_REQUIRED).
 * - Every record is a vault record (vault.repository.js refuses one without the vault);
 *   portfolio writes need the vault and their handlers refuse anything that is not ciphertext.
 * - The vault cannot be turned off.
 */

import { getAuthenticatedUser } from "./auth.js";
import { AppError } from "./AppError.js";
import { dbHasUserVault } from "../repositories/vault.repository.js";

export const ENCRYPTION_REQUIRED_MESSAGE =
  "برای ثبت اطلاعات، ابتدا رمزنگاری سرتاسری را از تنظیمات حساب فعال کنید.";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** Writes that store data of the user's own, kept encrypted by their handlers */
const VAULT_REQUIRED = [
  /^\/api\/portfolios$/,
  /^\/api\/banks\/custom$/,
];

/** Turning encryption off (and the restore path it used) is gone */
const ALWAYS_REFUSED = [
  { method: "DELETE", re: /^\/api\/vault$/ },
  { method: "POST", re: /^\/api\/vault\/records\/[^/]+\/[^/]+\/restore$/ },
];

/**
 * Which rule applies to a request
 * @returns {"refused"|"vault"|null}
 */
export function encryptionRuleFor(path, method) {
  if (ALWAYS_REFUSED.some((r) => r.method === method && r.re.test(path))) return "refused";
  if (!WRITE_METHODS.has(method)) return null;
  if (VAULT_REQUIRED.some((re) => re.test(path))) return "vault";
  return null;
}

export function encryptionRequiredError() {
  return new AppError(ENCRYPTION_REQUIRED_MESSAGE, 403, "ENCRYPTION_REQUIRED");
}

/** Throw when the rule does not let this request through */
export async function enforceEncryptionRule(request, env, rule) {
  if (rule === "refused") {
    throw new AppError("رمزنگاری سرتاسری اجباری است و غیرفعال نمی‌شود.", 403, "ENCRYPTION_MANDATORY");
  }
  const user = await getAuthenticatedUser(request, env);
  if (!user) return; // the handler answers 401
  const userId = user.userId || user.id || user.email;
  if (!(await dbHasUserVault(env, userId))) throw encryptionRequiredError();
}
