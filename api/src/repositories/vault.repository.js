/**
 * vault.repository.js — Account-wide end-to-end encryption storage
 *
 * The server never sees a key or plaintext here:
 *  - user_vaults holds the passphrase salt and the account data key *wrapped* (encrypted) with
 *    the passphrase-derived key — useless without the passphrase, which never leaves the browser.
 *  - vault_records holds browser-encrypted records (loans, incomes, cheques) as opaque ciphertext.
 * Converting a record between plaintext tables and the vault happens in one D1 batch, so a
 * record is never lost or duplicated halfway.
 */

import { ensureD1Tables } from "./migration.repository.js";
import { AppError } from "../lib/AppError.js";
import { insertChequeStatement } from "./cheques.repository.js";
import { insertRecurringStatement } from "./recurringIncomes.repository.js";

export const VAULT_RECORD_KINDS = ["loan", "income", "cheque", "recurring_income"];
export const E2EE_CIPHER_PREFIX = "enc:e2ee:v1:";
const MAX_PAYLOAD_LENGTH = 512 * 1024;
const RECORD_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export function isCipherText(value) {
  return typeof value === "string" && value.startsWith(E2EE_CIPHER_PREFIX) && value.length > E2EE_CIPHER_PREFIX.length;
}

function assertKind(kind) {
  if (!VAULT_RECORD_KINDS.includes(kind)) throw AppError.badRequest("نوع رکورد نامعتبر است.");
}

function assertRecordId(id) {
  if (!RECORD_ID_RE.test(String(id || ""))) throw AppError.badRequest("شناسه رکورد نامعتبر است.");
}

function assertPayload(payload) {
  if (!isCipherText(payload)) throw AppError.badRequest("داده باید پیش از ارسال رمزنگاری شده باشد.");
  if (payload.length > MAX_PAYLOAD_LENGTH) throw AppError.badRequest("حجم رکورد رمزنگاری‌شده بیش از حد مجاز است.");
}

// ── Account vault ───────────────────────────────────────────────────────────

/** @returns {Promise<{salt: string, wrappedKey: string, version: number, createdAt: string, updatedAt: string}|null>} */
export async function dbGetUserVault(env, userId) {
  if (!userId || !env?.DB) return null;
  await ensureD1Tables(env);
  const row = await env.DB.prepare(`
    SELECT salt, wrapped_key AS wrappedKey, version, created_at AS createdAt, updated_at AS updatedAt
    FROM user_vaults WHERE user_id = ?
  `).bind(userId).first();
  return row ? { ...row, version: Number(row.version) || 1 } : null;
}

export async function dbHasUserVault(env, userId) {
  return Boolean(await dbGetUserVault(env, userId));
}

/**
 * Turn the vault on, or re-wrap its data key (passphrase change). Re-wrapping must name the
 * wrapped key it replaces, so a stale device can never overwrite a newer key and orphan data.
 */
export async function dbSaveUserVault(env, userId, { salt, wrappedKey, previousWrappedKey }) {
  if (!String(salt || "").trim()) throw AppError.badRequest("salt رمزنگاری الزامی است.");
  if (!isCipherText(wrappedKey)) throw AppError.badRequest("کلید رمزنگاری‌شده نامعتبر است.");

  const existing = await dbGetUserVault(env, userId);
  const now = new Date().toISOString();

  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO user_vaults (user_id, salt, wrapped_key, version, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).bind(userId, String(salt).trim(), wrappedKey, now, now).run();
  } else {
    if (previousWrappedKey !== existing.wrappedKey) {
      throw new AppError("رمزنگاری حساب از دستگاه دیگری تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.", 409, "VAULT_CONFLICT");
    }
    await env.DB.prepare(`
      UPDATE user_vaults SET salt = ?, wrapped_key = ?, updated_at = ? WHERE user_id = ?
    `).bind(String(salt).trim(), wrappedKey, now, userId).run();
  }
  return dbGetUserVault(env, userId);
}

/**
 * Turn the vault off. Only allowed once nothing depends on its key any more (every record and
 * portfolio was decrypted back first) — otherwise that data would become unreadable forever.
 */
export async function dbDeleteUserVault(env, userId) {
  await ensureD1Tables(env);
  const records = await env.DB.prepare(`SELECT COUNT(*) AS n FROM vault_records WHERE user_id = ?`).bind(userId).first();
  const portfolios = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM portfolios WHERE user_id = ? AND e2ee_wrapped_key != ''`
  ).bind(userId).first();
  const remaining = (Number(records?.n) || 0) + (Number(portfolios?.n) || 0);
  if (remaining > 0) {
    throw new AppError(
      `هنوز ${remaining.toLocaleString("fa-IR")} مورد رمزنگاری‌شده باقی مانده است؛ ابتدا همه داده‌ها باید رمزگشایی شوند.`,
      409,
      "VAULT_NOT_EMPTY"
    );
  }
  await env.DB.prepare(`DELETE FROM user_vaults WHERE user_id = ?`).bind(userId).run();
  return true;
}

/**
 * With account-wide encryption on, new records are stored only as vault ciphertext — a
 * plaintext create can only come from an outdated client and must not leak data.
 */
export async function rejectWhenVaultEnabled(env, userId) {
  if (await dbHasUserVault(env, userId)) {
    throw new AppError("رمزنگاری سرتاسری حساب فعال است؛ لطفاً صفحه را تازه کنید تا داده رمزنگاری‌شده ذخیره شود.", 409, "VAULT_ENABLED");
  }
}

async function requireVault(env, userId) {
  if (!(await dbHasUserVault(env, userId))) {
    throw new AppError("رمزنگاری سرتاسری برای این حساب فعال نیست.", 409, "VAULT_DISABLED");
  }
}

// ── Encrypted records ───────────────────────────────────────────────────────

export async function dbListVaultRecords(env, userId, kind) {
  assertKind(kind);
  await ensureD1Tables(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT id, kind, payload, created_at AS createdAt, updated_at AS updatedAt
    FROM vault_records WHERE user_id = ? AND kind = ?
    ORDER BY created_at DESC
  `).bind(userId, kind).all();
  return results;
}

/** Plaintext rows that an encrypted record of this kind replaces (same id) */
function deletePlainStatements(env, userId, kind, id) {
  if (kind === "loan") {
    return [
      env.DB.prepare(`DELETE FROM loan_installment_states WHERE loan_id = ? AND user_id = ?`).bind(id, userId),
      env.DB.prepare(`DELETE FROM loan_extra_payments WHERE loan_id = ? AND user_id = ?`).bind(id, userId),
      env.DB.prepare(`DELETE FROM loans WHERE id = ? AND user_id = ?`).bind(id, userId),
    ];
  }
  if (kind === "cheque") {
    return [env.DB.prepare(`DELETE FROM cheques WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  if (kind === "recurring_income") {
    return [env.DB.prepare(`DELETE FROM recurring_incomes WHERE id = ? AND user_id = ?`).bind(id, userId)];
  }
  return [env.DB.prepare(`DELETE FROM incomes WHERE id = ? AND user_id = ?`).bind(id, userId)];
}

/**
 * Create or replace an encrypted record. With `replacePlain`, the plaintext record with the same
 * id is deleted in the same batch (used when encrypting existing data).
 */
export async function dbPutVaultRecord(env, userId, kind, id, { payload, replacePlain = false }) {
  assertKind(kind);
  assertRecordId(id);
  assertPayload(payload);
  await requireVault(env, userId);

  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(`
      INSERT INTO vault_records (user_id, kind, id, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, kind, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).bind(userId, kind, id, payload, now, now),
  ];
  if (replacePlain) statements.push(...deletePlainStatements(env, userId, kind, id));
  await env.DB.batch(statements);
  return { id, kind, payload, updatedAt: now };
}

export async function dbDeleteVaultRecord(env, userId, kind, id) {
  assertKind(kind);
  await ensureD1Tables(env);
  const res = await env.DB.prepare(`DELETE FROM vault_records WHERE user_id = ? AND kind = ? AND id = ?`)
    .bind(userId, kind, id).run();
  return (res?.meta?.changes ?? 0) > 0;
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const str = (v, fallback = "") => (v === undefined || v === null ? fallback : String(v));

/**
 * Write a decrypted record back into the plaintext tables and drop its encrypted copy, in one
 * batch (used when turning the vault off). The plaintext is the record's own decrypted content.
 */
export async function dbRestoreVaultRecord(env, userId, kind, id, plain) {
  assertKind(kind);
  assertRecordId(id);
  if (!plain || typeof plain !== "object") throw AppError.badRequest("داده رمزگشایی‌شده نامعتبر است.");
  await ensureD1Tables(env);

  const now = new Date().toISOString();
  const statements = [...deletePlainStatements(env, userId, kind, id)];

  if (kind === "loan") {
    const loan = plain.loan || {};
    if (loan.id !== id) throw AppError.badRequest("شناسه وام با رکورد همخوانی ندارد.");
    statements.push(env.DB.prepare(`
      INSERT INTO loans (
        id, user_id, title, lender_name, bank_id, principal_amount,
        annual_interest_rate, installment_count, interval_months,
        start_date, annual_fee_amount, schedule_mode, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, str(loan.title, "وام"), str(loan.lenderName), str(loan.bankId),
      num(loan.principalAmount), num(loan.annualInterestRate), Math.trunc(num(loan.installmentCount, 1)),
      Math.trunc(num(loan.intervalMonths, 1)), str(loan.startDate), num(loan.annualFeeAmount),
      loan.scheduleMode === "distributed" ? "distributed" : "formula", str(loan.notes),
      str(loan.createdAt, now), now
    ));

    for (const s of Array.isArray(plain.states) ? plain.states : []) {
      statements.push(env.DB.prepare(`
        INSERT INTO loan_installment_states (
          id, loan_id, user_id, installment_number, due_date,
          principal_portion, interest_portion, total_amount,
          remaining_balance_after, is_paid, paid_date, paid_amount,
          is_manual_override, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        str(s.id), id, userId, Math.trunc(num(s.installmentNumber)), str(s.dueDate),
        num(s.principalPortion), num(s.interestPortion), num(s.totalAmount),
        num(s.remainingBalanceAfter), s.isPaid ? 1 : 0, str(s.paidDate), num(s.paidAmount),
        s.isManualOverride ? 1 : 0, str(s.createdAt, now), str(s.updatedAt, now)
      ));
    }

    for (const p of Array.isArray(plain.extraPayments) ? plain.extraPayments : []) {
      statements.push(env.DB.prepare(`
        INSERT INTO loan_extra_payments (
          id, loan_id, user_id, amount, payment_date, reduction_mode, notes,
          anchor_installment_number, resulting_balance, resulting_installment_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        str(p.id), id, userId, num(p.amount), str(p.paymentDate),
        p.reductionMode === "reduce_term" ? "reduce_term" : "reduce_amount", str(p.notes),
        Math.trunc(num(p.anchorInstallmentNumber)), num(p.resultingBalance),
        p.resultingInstallmentCount === null || p.resultingInstallmentCount === undefined
          ? null
          : Math.trunc(num(p.resultingInstallmentCount)),
        str(p.createdAt, now)
      ));
    }
  } else if (kind === "cheque") {
    // `plain` was validated by the route handler (same rules as creating a cheque)
    statements.push(insertChequeStatement(env, userId, {
      ...plain,
      id,
      createdAt: str(plain.createdAt, now),
      updatedAt: now,
    }));
  } else if (kind === "recurring_income") {
    // `plain` was validated by the route handler (same rules as creating a rule)
    statements.push(insertRecurringStatement(env, userId, {
      ...plain,
      id,
      createdAt: str(plain.createdAt, now),
      updatedAt: now,
    }));
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO incomes (id, user_id, title, category, amount, income_date, notes, recurring_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, str(plain.title, "درآمد"), str(plain.category, "other"), num(plain.amount),
      str(plain.incomeDate), str(plain.notes), str(plain.recurringId), str(plain.createdAt, now), now
    ));
  }

  statements.push(env.DB.prepare(`DELETE FROM vault_records WHERE user_id = ? AND kind = ? AND id = ?`).bind(userId, kind, id));
  await env.DB.batch(statements);
  return true;
}
