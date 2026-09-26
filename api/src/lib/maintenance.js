/**
 * maintenance.js — Maintenance ("under development") mode
 *
 * While it is on, only admins (ADMIN_EMAIL) can sign in or use the API: every other request
 * past the sign-in routes answers 503 MAINTENANCE, and the sign-in routes refuse non-admins.
 * /api/auth/me keeps answering so the browser can show the maintenance page.
 */

import { getGlobalSettings } from "../repositories/settings.repository.js";
import { getAuthenticatedUser, isUserAdmin } from "./auth.js";
import { AppError } from "./AppError.js";

export const DEFAULT_MAINTENANCE_MESSAGE = "سایت در حال به‌روزرسانی است و به‌زودی دوباره در دسترس خواهد بود.";

/**
 * @param {object} env
 * @returns {Promise<{ enabled: boolean, message: string }>}
 */
export async function getMaintenance(env) {
  const settings = await getGlobalSettings(env);
  return {
    enabled: Number(settings.maintenance_mode) === 1 || settings.maintenance_mode === true,
    message: String(settings.maintenance_message || "").trim() || DEFAULT_MAINTENANCE_MESSAGE,
  };
}

/** The 503 error non-admins get while maintenance mode is on */
export function maintenanceError(message) {
  return new AppError(message, 503, "MAINTENANCE");
}

/**
 * Throw for a non-admin email while maintenance mode is on (sign-in, sign-up, email links)
 * @param {object} env
 * @param {string} email
 */
export async function assertNotMaintenance(env, email) {
  const maintenance = await getMaintenance(env);
  if (maintenance.enabled && !isUserAdmin(email, env)) throw maintenanceError(maintenance.message);
}

/**
 * Router gate for everything past the sign-in routes: throws for anyone but an admin while
 * maintenance mode is on
 * @param {Request} request
 * @param {object} env
 */
export async function enforceMaintenance(request, env) {
  const maintenance = await getMaintenance(env);
  if (!maintenance.enabled) return;
  const user = await getAuthenticatedUser(request, env);
  if (user?.role !== "admin") throw maintenanceError(maintenance.message);
}
