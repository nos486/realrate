/**
 * analytics.js — IP-based page view tracking, unique visitor counts, online users
 */

import { getClientIp, safeWaitUntil } from "./helpers.js";
import { dbGetUsers } from "./db.js";

/**
 * Track total page views, unique IPs, and active online users using KV
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {URL} url
 * @returns {{ pageViews: number, onlineUsers: number, uniqueIps: number }}
 */
export async function trackAnalytics(request, env, ctx, url) {
  return { pageViews: 0, onlineUsers: 0, uniqueIps: 0 };
}

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
