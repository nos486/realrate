/**
 * groupRequest.service.js — Answering a user's request to join a group (approve or reject)
 *
 * One place for the admin panel (routes/groupRoutes.js) and the Telegram bot (its admin buttons)
 */

import { dbAddGroupMember, dbDeleteGroupRequest, dbListGroupRequests } from "../repositories/userGroups.repository.js";
import { dbGetUserAuthById } from "../repositories/account.repository.js";
import { AppError } from "../lib/AppError.js";

/**
 * Approve (the user becomes a member) or reject (the request is deleted)
 * @param {object} env
 * @param {{ group: { id: string }, userId: string, approve: boolean, by?: string }} answer - by: who answered (kept as the member's `addedBy`)
 * @returns {Promise<{ email: string }>} the user's email (empty when rejected)
 * @throws {AppError} not found, when approving a user that no longer exists
 */
export async function answerGroupRequest(env, { group, userId, approve, by = "" }) {
  if (!approve) {
    await dbDeleteGroupRequest(env, group.id, userId);
    return { email: "" };
  }
  const account = await dbGetUserAuthById(env, userId);
  if (!account) throw AppError.notFound("کاربر مورد نظر یافت نشد.");
  await dbAddGroupMember(env, group.id, account.id, by);
  return { email: account.email };
}

/** Whether the user's request to the group is still waiting for an answer */
export async function isGroupRequestPending(env, groupId, userId) {
  return (await dbListGroupRequests(env, groupId)).some((r) => r.userId === userId);
}
