/**
 * analytics.js — Admin-facing site stats
 */

import { dbGetUserStats } from "../repositories/admin.repository.js";

/**
 * Get admin-facing stats: registered users, public portfolios, users active today and how many
 * users each quick filter of the users list matches
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function getAdminStats(env) {
  return { success: true, ...(await dbGetUserStats(env)) };
}
