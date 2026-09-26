/**
 * analytics.js — Admin-facing site stats
 */

import { dbGetUserStats } from "../repositories/user.repository.js";

/**
 * Get admin-facing stats: registered users and public portfolios
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function getAdminStats(env) {
  const { registeredUsers, publicPortfolios } = await dbGetUserStats(env);
  return { success: true, registeredUsers, publicPortfolios };
}
