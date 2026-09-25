/**
 * recurringIncomeRoutes.js — Fixed (recurring) income rules
 *
 * Endpoints:
 *   GET    /api/incomes/recurring        — List the user's rules
 *   POST   /api/incomes/recurring        — Create a rule
 *   PUT    /api/incomes/recurring/:id    — Update a rule (also how `generatedThrough` advances)
 *   DELETE /api/incomes/recurring/:id    — Delete a rule (entries it created stay)
 *
 * The browser creates the due income entries itself (through the normal incomes API or the
 * encrypted vault), so the feature works identically for end-to-end encrypted accounts.
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserRecurringIncomes,
  dbCreateRecurringIncome,
  dbUpdateRecurringIncome,
  dbDeleteRecurringIncome,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { rejectWhenVaultEnabled } from "../repositories/vault.repository.js";
import { validateRecurringIncome } from "../domain/recurringIncome.js";

async function requireUserId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت مدیریت درآمدهای ثابت، ابتدا وارد حساب کاربری خود شوید.");
  return user.userId || user.id || user.email;
}

export function parseRecurringIncomeInput(body) {
  const { value, error } = validateRecurringIncome(body);
  if (error) throw AppError.badRequest(error);
  return value;
}

export async function handleGetRecurringIncomes(request, env) {
  const userId = await requireUserId(request, env);
  const rules = await dbGetUserRecurringIncomes(env, userId);
  return jsonResponse({ success: true, count: rules.length, rules }, 200, request);
}

export async function handleCreateRecurringIncome(request, env) {
  const userId = await requireUserId(request, env);
  const data = parseRecurringIncomeInput(await request.json().catch(() => ({})));
  await rejectWhenVaultEnabled(env, userId);
  const rule = await dbCreateRecurringIncome(env, userId, data);
  return jsonResponse({ success: true, rule }, 201, request);
}

export async function handleUpdateRecurringIncome(request, env, { ruleId } = {}) {
  const userId = await requireUserId(request, env);
  if (!ruleId) throw AppError.badRequest("شناسه درآمد ثابت الزامی است.");
  const data = parseRecurringIncomeInput(await request.json().catch(() => ({})));
  const rule = await dbUpdateRecurringIncome(env, userId, ruleId, data);
  if (!rule) throw AppError.notFound("درآمد ثابت مورد نظر یافت نشد.");
  return jsonResponse({ success: true, rule }, 200, request);
}

export async function handleDeleteRecurringIncome(request, env, { ruleId } = {}) {
  const userId = await requireUserId(request, env);
  if (!ruleId) throw AppError.badRequest("شناسه درآمد ثابت الزامی است.");
  const deleted = await dbDeleteRecurringIncome(env, userId, ruleId);
  if (!deleted) throw AppError.notFound("درآمد ثابت مورد نظر یافت نشد.");
  return jsonResponse({ success: true }, 200, request);
}
