/**
 * encryptionGate.js — End-to-end encryption is mandatory for saving financial data
 *
 * No financial data may be stored unencrypted:
 * - A user without the account vault cannot save anything (403 ENCRYPTION_REQUIRED); they can
 *   still read and delete what they already have, and turning the vault on encrypts it.
 * - The plaintext loan / income / cheque / fixed-income endpoints never write: with the vault on,
 *   those records are saved as vault records (409 VAULT_ENABLED tells a stale page to reload).
 * - Portfolio writes need the vault; their handlers then refuse anything that is not ciphertext.
 * - The vault cannot be turned off, and nothing can be written back to the plaintext tables.
 */

import { getAuthenticatedUser } from "./auth.js";
import { AppError } from "./AppError.js";
import { dbHasUserVault, rejectWhenVaultEnabled } from "../repositories/vault.repository.js";

export const ENCRYPTION_REQUIRED_MESSAGE =
  "برای ثبت اطلاعات، ابتدا رمزنگاری سرتاسری را از تنظیمات حساب فعال کنید.";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** Writes to the plaintext tables of loans, incomes, fixed incomes and cheques */
const PLAINTEXT_ONLY = [/^\/api\/loans(\/|$)/, /^\/api\/incomes(\/|$)/, /^\/api\/cheques(\/|$)/];

/** Writes that store data of the user's own, kept encrypted by their handlers */
const VAULT_REQUIRED = [
  /^\/api\/portfolios$/,
  /^\/api\/portfolio$/,
  /^\/api\/portfolios?\/[^/]+\/transactions(\/[^/]+)?$/,
  /^\/api\/banks\/custom$/,
];

/** Turning encryption off (and the restore path it used) is gone */
const ALWAYS_REFUSED = [
  { method: "DELETE", re: /^\/api\/vault$/ },
  { method: "POST", re: /^\/api\/vault\/records\/[^/]+\/[^/]+\/restore$/ },
];

/**
 * Which rule applies to a request
 * @returns {"refused"|"plaintext"|"vault"|null}
 */
export function encryptionRuleFor(path, method) {
  if (ALWAYS_REFUSED.some((r) => r.method === method && r.re.test(path))) return "refused";
  if (!WRITE_METHODS.has(method)) return null;
  if (PLAINTEXT_ONLY.some((re) => re.test(path))) return "plaintext";
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
  if (rule === "plaintext") await rejectWhenVaultEnabled(env, userId);
  if (!(await dbHasUserVault(env, userId))) throw encryptionRequiredError();
}
