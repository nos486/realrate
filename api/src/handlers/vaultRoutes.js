/**
 * vaultRoutes.js — Account-wide end-to-end encryption
 *
 * Endpoints:
 *   GET    /api/vault                                — The account vault (salt + wrapped key) or null,
 *                                                       and whether an account without it has data
 *   PUT    /api/vault                                — Turn on / re-wrap after a passphrase change
 *   POST   /api/vault/reset                          — Forgotten passphrase: delete the vault and ALL the
 *                                                       user's financial data ({ confirm: "RESET_ALL_DATA",
 *                                                       password } — the account password when it has one)
 *   GET    /api/vault/records/:kind                  — Encrypted records of a kind (loan | income | cheque | recurring_income | holding | transaction |
 *                                                       expense_group | expense | bank_account | transfer — each only with its feature: config/features.js);
 *                                                       ?from&to&parent&undated=1&order=asc|desc&limit&offset (a page adds `total`)
 *   PUT    /api/vault/records/:kind/:id              — Create/replace one ({ payload, replacePlain, vaultEpoch }:
 *                                                       with `vaultEpoch`, refused after a vault reset)
 *   DELETE /api/vault/records/:kind/:id              — Delete one
 *   GET    /api/vault/sync?cursor&limit               — Every change after `cursor` (records stored and
 *                                                       deleted, all kinds the user may see), for devices
 *                                                       keeping a copy (the Android app, offline)
 *   GET    /api/loans/:id/document                   — Raw stored loan (for encrypting it)
 *
 * Every key operation happens in the browser; these routes only move opaque ciphertext.
 * Encryption is mandatory: the vault is never turned off (see lib/encryptionGate.js).
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserVault,
  dbUserHasPlaintextData,
  dbSaveUserVault,
  dbListVaultRecords,
  dbPutVaultRecord,
  dbDeleteVaultRecord,
  dbGetLoanDocument,
} from "../repositories/index.js";
import { VAULT_KIND_FEATURES, VAULT_RECORD_KINDS, dbSyncVaultRecords, dbResetUserVaultData } from "../repositories/vault.repository.js";
import { dbGetUserAuthById } from "../repositories/account.repository.js";
import { verifyPassword, getRateLimitState, recordRateLimitHit, clearRateLimit } from "../lib/security.js";
import { logger } from "../lib/logger.js";
import { isFeatureEnabled } from "../config/features.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";

async function requireUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت مدیریت رمزنگاری، ابتدا وارد حساب کاربری خود شوید.");
  return user;
}

const userIdOf = (user) => user.userId || user.id || user.email;

/** Whether a kind's records are open to the user (a kind of a feature they don't have is hidden) */
function kindAllowed(kind, user) {
  const feature = VAULT_KIND_FEATURES[kind];
  return !feature || isFeatureEnabled(feature, user);
}

async function requireUserId(request, env, kind = null) {
  const user = await requireUser(request, env);
  // Records of a feature not open to this user are hidden like the feature itself
  if (kind && !kindAllowed(kind, user)) throw AppError.notFound("یافت نشد.");
  return userIdOf(user);
}

export async function handleGetVault(request, env) {
  const userId = await requireUserId(request, env);
  const vault = await dbGetUserVault(env, userId);
  // Without the vault, whether there is anything to encrypt: a new account sets it up right away
  const hasPlaintextData = vault ? false : await dbUserHasPlaintextData(env, userId);
  return jsonResponse({ success: true, vault, hasPlaintextData }, 200, request);
}

export async function handleSaveVault(request, env) {
  const userId = await requireUserId(request, env);
  const body = await request.json().catch(() => ({}));
  const vault = await dbSaveUserVault(env, userId, {
    salt: body.salt,
    wrappedKey: body.wrappedKey,
    previousWrappedKey: body.previousWrappedKey,
  });
  return jsonResponse({ success: true, vault }, 200, request);
}

/** What the client sends to confirm the reset (after the user typed the Persian phrase) */
export const VAULT_RESET_CONFIRM = "RESET_ALL_DATA";
const RESET_LIMIT = { limit: 5, windowSec: 15 * 60 };

/**
 * Forgotten passphrase: start over. Nothing encrypted can be recovered without it, so every
 * financial record of the account is deleted with the vault. A stolen session alone cannot do
 * it: an account with a password must give it (rate limited); a Google-only account is proven by
 * its sign-in. Demo sessions never reach here (demoGate).
 */
export async function handleResetVault(request, env) {
  const user = await requireUser(request, env);
  if (user.kind === "demo_view" || user.kind === "demo_edit") {
    throw new AppError("بازنشانی رمزنگاری در حساب دمو مجاز نیست.", 403, "DEMO_EDIT_FORBIDDEN");
  }
  const userId = userIdOf(user);
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== VAULT_RESET_CONFIRM) {
    throw AppError.badRequest("برای بازنشانی، عبارت تأیید را وارد کنید.", "CONFIRM_REQUIRED");
  }

  const account = await dbGetUserAuthById(env, userId);
  if (account?.passwordHash) {
    const key = `vault-reset:${userId}`;
    const { limited } = await getRateLimitState(env, key, RESET_LIMIT);
    if (limited) throw new AppError("تعداد تلاش‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.", 429, "TOO_MANY_REQUESTS");
    if (!(await verifyPassword(String(body.password ?? ""), account.passwordHash))) {
      await recordRateLimitHit(env, key, RESET_LIMIT);
      throw new AppError("رمز عبور حساب نادرست است.", 400, "INVALID_PASSWORD");
    }
    await clearRateLimit(env, key);
  }

  await dbResetUserVaultData(env, userId);
  logger.info("[Vault] reset: all data deleted", { userId });
  return jsonResponse({ success: true }, 200, request);
}

export async function handleListVaultRecords(request, env, { kind }) {
  const userId = await requireUserId(request, env, kind);
  const params = new URL(request.url).searchParams;
  const result = await dbListVaultRecords(env, userId, kind, {
    from: params.get("from") || "",
    to: params.get("to") || "",
    parentId: params.get("parent") || "",
    undated: params.get("undated") === "1",
    order: params.get("order") === "asc" ? "asc" : "desc",
    limit: params.get("limit"),
    offset: params.get("offset") || 0,
  });
  // A page carries the total matching; without `limit`, every matching record
  const body = Array.isArray(result) ? { records: result } : result;
  return jsonResponse({ success: true, ...body }, 200, request);
}

export async function handlePutVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env, kind);
  const body = await request.json().catch(() => ({}));
  const record = await dbPutVaultRecord(env, userId, kind, id, {
    payload: body.payload,
    replacePlain: Boolean(body.replacePlain),
    recordDate: body.recordDate,
    parentId: body.parentId,
    vaultEpoch: typeof body.vaultEpoch === "string" ? body.vaultEpoch : "",
    reminder: body.reminder,
  });
  return jsonResponse({ success: true, record }, 200, request);
}

export async function handleDeleteVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env, kind);
  const deleted = await dbDeleteVaultRecord(env, userId, kind, id);
  if (!deleted) throw AppError.notFound("رکورد مورد نظر یافت نشد.");
  return jsonResponse({ success: true }, 200, request);
}

export async function handleSyncVaultRecords(request, env) {
  const user = await requireUser(request, env);
  const params = new URL(request.url).searchParams;
  const result = await dbSyncVaultRecords(env, userIdOf(user), {
    cursor: params.get("cursor") || "",
    limit: params.get("limit"),
    kinds: VAULT_RECORD_KINDS.filter((kind) => kindAllowed(kind, user)),
  });
  return jsonResponse({ success: true, ...result }, 200, request);
}

export async function handleGetLoanDocument(request, env, { loanId }) {
  const userId = await requireUserId(request, env);
  const document = await dbGetLoanDocument(env, userId, loanId);
  if (!document) throw AppError.notFound("وام مورد نظر یافت نشد.");
  return jsonResponse({ success: true, document }, 200, request);
}
