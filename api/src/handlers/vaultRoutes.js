/**
 * vaultRoutes.js — Account-wide end-to-end encryption
 *
 * Endpoints:
 *   GET    /api/vault                                — The account vault (salt + wrapped key) or null,
 *                                                       and whether an account without it has data
 *   PUT    /api/vault                                — Turn on / re-wrap after a passphrase change
 *   GET    /api/vault/records/:kind                  — Encrypted records of a kind (loan | income | cheque | recurring_income | holding | transaction)
 *   PUT    /api/vault/records/:kind/:id              — Create/replace one ({ payload, replacePlain })
 *   DELETE /api/vault/records/:kind/:id              — Delete one
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
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";

async function requireUserId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت مدیریت رمزنگاری، ابتدا وارد حساب کاربری خود شوید.");
  return user.userId || user.id || user.email;
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

export async function handleListVaultRecords(request, env, { kind }) {
  const userId = await requireUserId(request, env);
  const params = new URL(request.url).searchParams;
  const records = await dbListVaultRecords(env, userId, kind, {
    from: params.get("from") || "",
    to: params.get("to") || "",
    parentId: params.get("parent") || "",
  });
  return jsonResponse({ success: true, records }, 200, request);
}

export async function handlePutVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env);
  const body = await request.json().catch(() => ({}));
  const record = await dbPutVaultRecord(env, userId, kind, id, {
    payload: body.payload,
    replacePlain: Boolean(body.replacePlain),
    recordDate: body.recordDate,
    parentId: body.parentId,
  });
  return jsonResponse({ success: true, record }, 200, request);
}

export async function handleDeleteVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env);
  const deleted = await dbDeleteVaultRecord(env, userId, kind, id);
  if (!deleted) throw AppError.notFound("رکورد مورد نظر یافت نشد.");
  return jsonResponse({ success: true }, 200, request);
}

export async function handleGetLoanDocument(request, env, { loanId }) {
  const userId = await requireUserId(request, env);
  const document = await dbGetLoanDocument(env, userId, loanId);
  if (!document) throw AppError.notFound("وام مورد نظر یافت نشد.");
  return jsonResponse({ success: true, document }, 200, request);
}
