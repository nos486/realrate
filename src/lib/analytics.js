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
  let pageViews = 1420;
  let onlineUsers = 1;
  let uniqueIps = 380;

  const rawIp = getClientIp(request);
  const safeIp = rawIp.replace(/[^a-zA-Z0-9_.-]/g, "_");

  if (env && env.REALRATE_KV) {
    try {
      // 1. Track online user (5-minute window)
      const onlineKey = `online_ip_${safeIp}`;
      safeWaitUntil(ctx, env.REALRATE_KV.put(onlineKey, Date.now().toString(), { expirationTtl: 300 }));

      const activeOnlineList = await env.REALRATE_KV.list({ prefix: "online_ip_" });
      onlineUsers = Math.max(1, activeOnlineList.keys.length);

      // 2. Track total page views
      let viewsStr = await env.REALRATE_KV.get("total_page_views");
      let currentViews = parseInt(viewsStr || "1420", 10);

      // 3. Track unique IP
      let uniqueCountStr = await env.REALRATE_KV.get("total_unique_ips");
      let currentUniqueIps = parseInt(uniqueCountStr || "380", 10);

      const uniqueVisitKey = `visited_ip_${safeIp}`;
      const hasVisited = await env.REALRATE_KV.get(uniqueVisitKey);

      if (url.pathname === "/") {
        currentViews += 1;
        safeWaitUntil(ctx, env.REALRATE_KV.put("total_page_views", currentViews.toString()));

        if (!hasVisited) {
          currentUniqueIps += 1;
          safeWaitUntil(ctx, env.REALRATE_KV.put(uniqueVisitKey, Date.now().toString()));
          safeWaitUntil(ctx, env.REALRATE_KV.put("total_unique_ips", currentUniqueIps.toString()));
        }
      }

      pageViews = currentViews;
      uniqueIps = currentUniqueIps;
    } catch (e) {
      console.error("Analytics KV Error:", e);
    }
  }

  return { pageViews, onlineUsers, uniqueIps };
}

/**
 * Get admin-facing stats: page views, unique IPs, online users, registered users
 * @param {object} env
 * @returns {object}
 */
export async function getAdminStats(env) {
  let pageViews = 1420;
  let uniqueIps = 380;
  let onlineUsers = 1;

  if (env && env.REALRATE_KV) {
    try {
      const viewsStr = await env.REALRATE_KV.get("total_page_views");
      if (viewsStr) pageViews = parseInt(viewsStr, 10);

      const uniqueStr = await env.REALRATE_KV.get("total_unique_ips");
      if (uniqueStr) {
        uniqueIps = parseInt(uniqueStr, 10);
      } else {
        const uniqueList = await env.REALRATE_KV.list({ prefix: "visited_ip_" });
        uniqueIps = Math.max(uniqueList.keys.length, 1);
      }

      const activeOnlineList = await env.REALRATE_KV.list({ prefix: "online_ip_" });
      onlineUsers = Math.max(activeOnlineList.keys.length, 1);
    } catch (e) {
      console.error("Error fetching admin stats from KV:", e);
    }
  }

  const users = await dbGetUsers(env);
  const registeredUsers = users.length;

  return { success: true, pageViews, uniqueIps, onlineUsers, registeredUsers };
}
