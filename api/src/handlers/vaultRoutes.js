/**
 * vaultRoutes.js — Account-wide end-to-end encryption
 *
 * Endpoints:
 *   GET    /api/vault                                — The account vault (salt + wrapped key) or null
 *   PUT    /api/vault                                — Turn on / re-wrap after a passphrase change
 *   DELETE /api/vault                                — Turn off (only once nothing is encrypted with it)
 *   GET    /api/vault/records/:kind                  — Encrypted records of a kind (loan | income | cheque | recurring_income)
 *   PUT    /api/vault/records/:kind/:id              — Create/replace one ({ payload, replacePlain })
 *   DELETE /api/vault/records/:kind/:id              — Delete one
 *   POST   /api/vault/records/:kind/:id/restore      — Write it back as plaintext and drop the copy
 *   GET    /api/loans/:id/document                   — Raw stored loan (for encrypting it)
 *
 * Every key operation happens in the browser; these routes only move opaque ciphertext.
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserVault,
  dbSaveUserVault,
  dbDeleteUserVault,
  dbListVaultRecords,
  dbPutVaultRecord,
  dbDeleteVaultRecord,
  dbRestoreVaultRecord,
  dbGetLoanDocument,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { parseIncomeInput } from "./incomeRoutes.js";
import { parseChequeInput } from "./chequeRoutes.js";
import { parseRecurringIncomeInput } from "./recurringIncomeRoutes.js";

async function requireUserId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت مدیریت رمزنگاری، ابتدا وارد حساب کاربری خود شوید.");
  return user.userId || user.id || user.email;
}

export async function handleGetVault(request, env) {
  const userId = await requireUserId(request, env);
  const vault = await dbGetUserVault(env, userId);
  return jsonResponse({ success: true, vault }, 200, request);
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

export async function handleDeleteVault(request, env) {
  const userId = await requireUserId(request, env);
  await dbDeleteUserVault(env, userId);
  return jsonResponse({ success: true, vault: null }, 200, request);
}

export async function handleListVaultRecords(request, env, { kind }) {
  const userId = await requireUserId(request, env);
  const records = await dbListVaultRecords(env, userId, kind);
  return jsonResponse({ success: true, records }, 200, request);
}

export async function handlePutVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env);
  const body = await request.json().catch(() => ({}));
  const record = await dbPutVaultRecord(env, userId, kind, id, {
    payload: body.payload,
    replacePlain: Boolean(body.replacePlain),
  });
  return jsonResponse({ success: true, record }, 200, request);
}

export async function handleDeleteVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env);
  const deleted = await dbDeleteVaultRecord(env, userId, kind, id);
  if (!deleted) throw AppError.notFound("رکورد مورد نظر یافت نشد.");
  return jsonResponse({ success: true }, 200, request);
}

export async function handleRestoreVaultRecord(request, env, { kind, id }) {
  const userId = await requireUserId(request, env);
  const body = await request.json().catch(() => ({}));
  let plain = body.plain;
  if (kind === "income") {
    // Same rules as creating an income, so restored rows are always valid
    plain = { ...parseIncomeInput(plain || {}), createdAt: plain?.createdAt };
  } else if (kind === "recurring_income") {
    plain = { ...parseRecurringIncomeInput(plain || {}), createdAt: plain?.createdAt };
  } else if (kind === "cheque") {
    plain = { ...parseChequeInput(plain || {}), createdAt: plain?.createdAt };
  } else if (kind === "loan") {
    const loan = plain?.loan || {};
    if (!String(loan.title || "").trim() || !(Number(loan.principalAmount) > 0) || !(Number(loan.installmentCount) >= 0)) {
      throw AppError.badRequest("داده وام رمزگشایی‌شده نامعتبر است.");
    }
  }
  await dbRestoreVaultRecord(env, userId, kind, id, plain);
  return jsonResponse({ success: true }, 200, request);
}

export async function handleGetLoanDocument(request, env, { loanId }) {
  const userId = await requireUserId(request, env);
  const document = await dbGetLoanDocument(env, userId, loanId);
  if (!document) throw AppError.notFound("وام مورد نظر یافت نشد.");
  return jsonResponse({ success: true, document }, 200, request);
}
