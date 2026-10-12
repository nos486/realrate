/**
 * planRoutes.js — The free plan's limits and what the user has used
 *
 * Endpoint:
 *   GET /api/plan — { pro, usage: { <limit key>: { used, limit, period } } } (usage is empty on Pro)
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { getPlanUsage } from "../lib/planLimits.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";

export async function handleGetPlan(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized();
  const plan = await getPlanUsage(env, user);
  return jsonResponse({ success: true, ...plan }, 200, request);
}
