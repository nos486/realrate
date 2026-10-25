/**
 * groupRoutes.js — Groups of users and who gets which feature
 *
 * For users:
 *   GET    /api/features/:key/access   whether the feature is open to them; if not, the groups it is
 *                                      open to (name, description, whether one may ask to join)
 *   POST   /api/groups/:key/request    ask to join a group that accepts requests { note? }
 *   DELETE /api/groups/:key/request    take the request back
 * For the admin:
 *   GET    /api/admin/groups                           groups (with counts), pending requests, feature rules
 *   POST   /api/admin/groups                           create { key, name, description, allowRequests }
 *   PUT    /api/admin/groups/:id                       edit { name?, description?, allowRequests? }
 *   DELETE /api/admin/groups/:id                       delete (not a system group, not one a feature uses)
 *   GET    /api/admin/groups/:id/members?q&page        one page of members
 *   POST   /api/admin/groups/:id/members               add { userId } or { email }
 *   DELETE /api/admin/groups/:id/members/:userId       remove
 *   POST   /api/admin/groups/:id/requests/:userId      { approve: true } adds the member; false rejects
 *   PUT    /api/admin/features/:key                    { stage, groups } — who gets the feature
 *   DELETE /api/admin/features/:key                    back to the code's default
 *   POST   /api/admin/users/groups                     { userIds | match: { q, filter }, group: groupKey|null } — set many users' group at once (a user is in one group only)
 *   GET    /api/admin/plan-limits                      the limits (counts and quotas) of the free plan and of each group
 *   PUT    /api/admin/plan-limits/:scope               { limits: { <key>: number|null } } — `free` or a group key
 *   DELETE /api/admin/plan-limits/:scope               back to the code's defaults
 *
 * A change of groups or rules takes effect on the user's next request; the app re-reads its
 * features (GET /api/auth/me) when it opens and when it comes back to the foreground.
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { AppError } from "../lib/AppError.js";
import { jsonResponse } from "../lib/helpers.js";
import { FEATURES, mergeFeatureRules, validateFeatureRule } from "../config/features.js";
import { resetRequestableGroupsMemo, hasFeature, loadFeatureOverrides, loadFeatureRules, saveFeatureOverrides, withUserGroups } from "../lib/features.js";
import { validateGroup, cleanRequestNote } from "../domain/userGroups.js";
import { LIMIT_CATALOG, mergePlanRules, cleanLimits } from "../config/planLimits.js";
import { loadPlanOverrides, savePlanOverrides } from "../lib/planLimits.js";
import {
  dbListGroups,
  dbGetGroup,
  dbGetGroupByKey,
  dbCreateGroup,
  dbUpdateGroup,
  dbDeleteGroup,
  dbListGroupMembers,
  dbAddGroupMember,
  dbRemoveGroupMember,
  dbListGroupRequests,
  dbCreateGroupRequest,
  dbDeleteGroupRequest,
  dbGetUserRequestedGroupKeys,
  dbBulkSetUserGroup,
} from "../repositories/userGroups.repository.js";
import { dbGetUserAuthByEmail, dbGetUserAuthById } from "../repositories/account.repository.js";
import { answerGroupRequest } from "../services/groupRequest.service.js";
import { dbGetUsersPage, USER_FILTERS } from "../repositories/admin.repository.js";
import { notifyAdmins } from "../services/bot/messengers.js";

const MEMBERS_PAGE_SIZE = 20;
const userIdOf = (user) => user?.userId || user?.id || "";

async function requireUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized();
  return user;
}

async function requireAdminUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
  return user;
}

async function readBody(request) {
  return (await request.json().catch(() => null)) || {};
}

async function loadGroup(env, groupId) {
  const group = await dbGetGroup(env, groupId);
  if (!group) throw AppError.notFound("گروه یافت نشد.");
  return group;
}

/** Every feature's rule for the panel: the effective one, its default, and whether it was changed */
async function featureRulesView(env) {
  const overrides = await loadFeatureOverrides(env);
  const rules = mergeFeatureRules(overrides);
  return Object.entries(rules).map(([key, rule]) => ({
    key,
    label: rule.label,
    description: rule.description,
    stage: rule.stage,
    groups: rule.groups,
    defaultStage: FEATURES[key].stage,
    defaultGroups: FEATURES[key].groups || [],
    customized: Boolean(overrides[key]),
  }));
}

// ── For users ──────────────────────────────────────────────────────────────

/** GET /api/features/:key/access */
export async function handleGetFeatureAccess(request, env, { key }) {
  const user = await requireUser(request, env);
  if (!FEATURES[key]) throw AppError.notFound("یافت نشد.");
  const [enabled, rules] = await Promise.all([hasFeature(env, user, key), loadFeatureRules(env)]);
  const rule = rules[key];
  const openToGroups = rule.stage === "ga" ? rule.groups : [];
  const [allGroups, requested] = await Promise.all([
    openToGroups.length ? dbListGroups(env) : [],
    dbGetUserRequestedGroupKeys(env, userIdOf(user)),
  ]);
  const groups = allGroups
    .filter((g) => openToGroups.includes(g.key))
    .map((g) => ({ key: g.key, name: g.name, description: g.description, allowRequests: g.allowRequests, requested: requested.includes(g.key) }));
  return jsonResponse({ success: true, feature: key, label: rule.label, enabled, groups }, 200, request);
}

async function requestableGroup(env, user, key) {
  const group = await dbGetGroupByKey(env, String(key || "").toLowerCase());
  if (!group || !group.allowRequests) throw AppError.notFound("این گروه درخواست عضویت نمی‌پذیرد.");
  await withUserGroups(env, user);
  if (user.groups.includes(group.key)) throw AppError.badRequest("شما عضو این گروه هستید.", "ALREADY_MEMBER");
  return group;
}

/** POST /api/groups/:key/request { note? } */
export async function handleRequestGroup(request, env, { key }, ctx) {
  const user = await requireUser(request, env);
  if (String(user.kind || "").startsWith("demo")) throw AppError.forbidden("حساب دمو نمی‌تواند درخواست عضویت بدهد.");
  const group = await requestableGroup(env, user, key);
  const body = await readBody(request);
  const note = cleanRequestNote(body.note);
  await dbCreateGroupRequest(env, group.id, userIdOf(user), note);
  // The admin hears of it in Telegram and Rubika, with buttons to answer (best effort, off the user's request)
  const notified = notifyAdmins(env, {
    text: `درخواست عضویت در «${group.name}»\nکاربر: ${user.email || userIdOf(user)}${user.name ? ` (${user.name})` : ""}${note ? `\nیادداشت: ${note}` : ""}`,
    action: { type: "group-request", groupId: group.id, userId: userIdOf(user) },
  }).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(notified);
  else await notified;
  return jsonResponse({ success: true, message: `درخواست عضویت در «${group.name}» ثبت شد؛ پس از تأیید مدیر فعال می‌شود.` }, 200, request);
}

/** DELETE /api/groups/:key/request */
export async function handleCancelGroupRequest(request, env, { key }) {
  const user = await requireUser(request, env);
  const group = await dbGetGroupByKey(env, String(key || "").toLowerCase());
  if (group) await dbDeleteGroupRequest(env, group.id, userIdOf(user));
  return jsonResponse({ success: true }, 200, request);
}

// ── For the admin ──────────────────────────────────────────────────────────

/** GET /api/admin/groups */
export async function handleAdminListGroups(request, env) {
  await requireAdminUser(request, env);
  const [groups, requests, features] = await Promise.all([dbListGroups(env), dbListGroupRequests(env), featureRulesView(env)]);
  return jsonResponse({ success: true, groups, requests, features }, 200, request);
}

/** POST /api/admin/groups */
export async function handleAdminCreateGroup(request, env) {
  await requireAdminUser(request, env);
  const { value, error } = validateGroup(await readBody(request));
  if (error) throw AppError.badRequest(error);
  const group = await dbCreateGroup(env, value);
  resetRequestableGroupsMemo();
  return jsonResponse({ success: true, message: "گروه ساخته شد.", group }, 200, request);
}

/** PUT /api/admin/groups/:id */
export async function handleAdminUpdateGroup(request, env, { groupId }) {
  await requireAdminUser(request, env);
  await loadGroup(env, groupId);
  const { value, error } = validateGroup(await readBody(request), { partial: true });
  if (error) throw AppError.badRequest(error);
  const group = await dbUpdateGroup(env, groupId, value);
  resetRequestableGroupsMemo();
  return jsonResponse({ success: true, message: "گروه ذخیره شد.", group }, 200, request);
}

/** DELETE /api/admin/groups/:id */
export async function handleAdminDeleteGroup(request, env, { groupId }) {
  await requireAdminUser(request, env);
  const group = await loadGroup(env, groupId);
  if (group.isSystem) throw AppError.badRequest("این گروه سیستمی است و حذف نمی‌شود.");
  const rules = await loadFeatureRules(env);
  const usedBy = Object.values(rules).filter((r) => r.groups.includes(group.key)).map((r) => r.label);
  if (usedBy.length) {
    throw AppError.badRequest(`این گروه در دسترسی «${usedBy.join("، ")}» استفاده شده است؛ ابتدا آن را از دسترسی‌ها بردارید.`, "GROUP_IN_USE");
  }
  await dbDeleteGroup(env, groupId);
  resetRequestableGroupsMemo();
  return jsonResponse({ success: true, message: "گروه حذف شد." }, 200, request);
}

/** GET /api/admin/groups/:id/members?q&page */
export async function handleAdminListMembers(request, env, { groupId }) {
  await requireAdminUser(request, env);
  await loadGroup(env, groupId);
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const { members, total } = await dbListGroupMembers(env, groupId, { q, limit: MEMBERS_PAGE_SIZE, offset: (page - 1) * MEMBERS_PAGE_SIZE });
  return jsonResponse({
    success: true,
    members,
    total,
    page,
    pageSize: MEMBERS_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE)),
  }, 200, request);
}

/** POST /api/admin/groups/:id/members { userId } | { email } */
export async function handleAdminAddMember(request, env, { groupId }) {
  const admin = await requireAdminUser(request, env);
  const group = await loadGroup(env, groupId);
  const body = await readBody(request);
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const account = userId ? await dbGetUserAuthById(env, userId) : email ? await dbGetUserAuthByEmail(env, email) : null;
  if (!account) throw AppError.notFound(email ? "کاربری با این ایمیل ثبت‌نام نکرده است." : "کاربر مورد نظر یافت نشد.");
  const left = await dbAddGroupMember(env, group.id, account.id, admin.email || "");
  // A user is in one group only: the one they were in is replaced
  const note = left.length ? " (از گروه قبلی‌اش برداشته شد)" : "";
  return jsonResponse({ success: true, message: `${account.email} به «${group.name}» اضافه شد${note}.` }, 200, request);
}

/** DELETE /api/admin/groups/:id/members/:userId */
export async function handleAdminRemoveMember(request, env, { groupId, userId }) {
  await requireAdminUser(request, env);
  const group = await loadGroup(env, groupId);
  await dbRemoveGroupMember(env, group.id, userId);
  return jsonResponse({ success: true, message: `کاربر از «${group.name}» برداشته شد.` }, 200, request);
}

/** POST /api/admin/groups/:id/requests/:userId { approve } */
export async function handleAdminAnswerRequest(request, env, { groupId, userId }) {
  const admin = await requireAdminUser(request, env);
  const group = await loadGroup(env, groupId);
  const body = await readBody(request);
  if (body.approve === true) {
    const { email } = await answerGroupRequest(env, { group, userId, approve: true, by: admin.email || "" });
    return jsonResponse({ success: true, message: `${email} به «${group.name}» اضافه شد.` }, 200, request);
  }
  await answerGroupRequest(env, { group, userId, approve: false });
  return jsonResponse({ success: true, message: "درخواست رد شد." }, 200, request);
}

/** PUT /api/admin/features/:key { stage, groups } */
export async function handleAdminSaveFeatureRule(request, env, { key }) {
  await requireAdminUser(request, env);
  const groups = await dbListGroups(env);
  const { value, error } = validateFeatureRule(key, await readBody(request), groups.map((g) => g.key));
  if (error) throw AppError.badRequest(error);
  const overrides = await loadFeatureOverrides(env);
  await saveFeatureOverrides(env, { ...overrides, [key]: value });
  return jsonResponse({ success: true, message: "دسترسی ذخیره شد.", features: await featureRulesView(env) }, 200, request);
}

/** DELETE /api/admin/features/:key — the code's default again */
export async function handleAdminResetFeatureRule(request, env, { key }) {
  await requireAdminUser(request, env);
  if (!FEATURES[key]) throw AppError.notFound("ویژگی ناشناخته است.");
  const { [key]: _removed, ...rest } = await loadFeatureOverrides(env);
  await saveFeatureOverrides(env, rest);
  return jsonResponse({ success: true, message: "دسترسی به پیش‌فرض برگشت.", features: await featureRulesView(env) }, 200, request);
}

// ── Limits (counts and quotas) of the free plan and of each group ─────────────

/** What the panel shows: the catalog with defaults, what the admin set, and the groups */
async function planLimitsView(env) {
  const [overrides, groups] = await Promise.all([loadPlanOverrides(env), dbListGroups(env)]);
  const rules = mergePlanRules(overrides);
  return {
    catalog: Object.entries(LIMIT_CATALOG).map(([key, c]) => ({ key, label: c.label, period: c.period, default: c.default })),
    free: rules.free,
    groups: Object.fromEntries(groups.map((g) => [g.key, rules.groups[g.key] || {}])),
    customized: { free: Boolean(overrides?.free), groups: Object.keys(overrides?.groups || {}) },
  };
}

/** GET /api/admin/plan-limits */
export async function handleAdminGetPlanLimits(request, env) {
  await requireAdminUser(request, env);
  return jsonResponse({ success: true, ...(await planLimitsView(env)) }, 200, request);
}

async function requirePlanScope(env, scope) {
  if (scope === "free") return;
  const groups = await dbListGroups(env);
  if (!groups.some((g) => g.key === scope)) throw AppError.notFound("گروه یافت نشد.");
}

/** PUT /api/admin/plan-limits/:scope { limits } — a number is the most records/messages allowed, null is unlimited */
export async function handleAdminSavePlanLimits(request, env, { scope }) {
  await requireAdminUser(request, env);
  await requirePlanScope(env, scope);
  const input = (await readBody(request)).limits;
  const limits = cleanLimits(input);
  if (Object.keys(input && typeof input === "object" ? input : {}).length !== Object.keys(limits).length) {
    throw AppError.badRequest("مقدار محدودیت باید عدد صحیح و نامنفی (یا نامحدود) باشد.");
  }
  const overrides = (await loadPlanOverrides(env)) || {};
  const next = scope === "free"
    ? { ...overrides, free: limits }
    : { ...overrides, groups: { ...(overrides.groups || {}), [scope]: limits } };
  await savePlanOverrides(env, next);
  return jsonResponse({ success: true, message: "محدودیت‌ها ذخیره شد.", ...(await planLimitsView(env)) }, 200, request);
}

/** DELETE /api/admin/plan-limits/:scope — the code's defaults again */
export async function handleAdminResetPlanLimits(request, env, { scope }) {
  await requireAdminUser(request, env);
  const overrides = (await loadPlanOverrides(env)) || {};
  const next = scope === "free"
    ? (({ free: _free, ...rest }) => rest)(overrides)
    : { ...overrides, groups: Object.fromEntries(Object.entries(overrides.groups || {}).filter(([k]) => k !== scope)) };
  await savePlanOverrides(env, next);
  return jsonResponse({ success: true, message: "محدودیت‌ها به پیش‌فرض برگشت.", ...(await planLimitsView(env)) }, 200, request);
}

// ── Many users at once ─────────────────────────────────────────────────────

/** The most users one bulk change may touch */
export const BULK_USERS_MAX = 1000;

/**
 * POST /api/admin/users/groups
 * { userIds: [id] } or { match: { q, filter } } (every user the users list shows for that search and
 * filter), with `group`: the group key they all go to (leaving the one they were in), or null to
 * take them out of their group. A user is in one group only.
 */
export async function handleAdminBulkUserGroups(request, env) {
  const admin = await requireAdminUser(request, env);
  const body = await readBody(request);
  if (body.group === undefined) throw AppError.badRequest("گروه مقصد را انتخاب کنید (یا «بدون گروه»).");
  let groupId = null;
  if (body.group !== null) {
    const key = String(body.group).toLowerCase();
    const group = (await dbListGroups(env)).find((g) => g.key === key);
    if (!group) throw AppError.notFound(`گروه «${key}» یافت نشد.`);
    groupId = group.id;
  }

  let userIds;
  if (Array.isArray(body.userIds)) {
    userIds = [...new Set(body.userIds.filter((id) => typeof id === "string" && id).map((id) => id.trim()))];
  } else if (body.match && typeof body.match === "object") {
    const q = String(body.match.q || "").trim().slice(0, 100);
    const filter = Object.hasOwn(USER_FILTERS, body.match.filter || "") ? body.match.filter : "all";
    const { users, total } = await dbGetUsersPage(env, { q, filter, limit: BULK_USERS_MAX, offset: 0 });
    if (total > BULK_USERS_MAX) throw AppError.badRequest(`حداکثر ${BULK_USERS_MAX} کاربر را می‌شود یک‌جا تغییر داد؛ جستجو را محدودتر کنید.`);
    userIds = users.map((u) => u.id);
  } else {
    throw AppError.badRequest("کاربران انتخاب نشده‌اند.");
  }
  if (!userIds.length) throw AppError.badRequest("کاربری برای تغییر نیست.");
  if (userIds.length > BULK_USERS_MAX) throw AppError.badRequest(`حداکثر ${BULK_USERS_MAX} کاربر را می‌شود یک‌جا تغییر داد.`);

  const { users } = await dbBulkSetUserGroup(env, { userIds, groupId, addedBy: admin.email || "" });
  return jsonResponse({ success: true, users, message: `گروه ${users.toLocaleString("fa-IR")} کاربر تغییر کرد.` }, 200, request);
}
