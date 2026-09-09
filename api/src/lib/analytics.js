/**
 * analytics.js — IP-based page view tracking, unique visitor counts, online users
 */

import { dbGetUsers } from "./db.js";

/**
 * Get admin-facing stats: registered users
 * @param {object} env
 * @returns {object}
 */
export async function getAdminStats(env) {
  const users = await dbGetUsers(env);
  const registeredUsers = users.length;

  return { success: true, registeredUsers };
}
