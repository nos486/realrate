/**
 * botActions.js — What the admin's Telegram buttons do
 *
 * `notifyAdmin` (adminChat.service.js) sends a message with ✅ / ❌ buttons for an action
 * `{ type, ...payload }`; pressing one calls `BOT_ACTIONS[type].approve` / `.reject` with the
 * payload. An action answers `{ text }`: the note shown under the message afterwards. A new kind of
 * request that needs the admin's yes or no is one more entry here.
 */

import { dbGetGroup } from "../../repositories/userGroups.repository.js";
import { answerGroupRequest, isGroupRequestPending } from "../groupRequest.service.js";

async function answerGroup(env, { groupId, userId }, approve, by) {
  const group = await dbGetGroup(env, groupId);
  if (!group) return { text: "گروه دیگر وجود ندارد." };
  // Already answered, from the panel or by an earlier press
  if (!(await isGroupRequestPending(env, group.id, userId))) return { text: "این درخواست قبلاً پاسخ داده شده است." };
  const { email } = await answerGroupRequest(env, { group, userId, approve, by });
  return { text: approve ? `✅ ${email} به «${group.name}» اضافه شد.` : "❌ درخواست رد شد." };
}

export const BOT_ACTIONS = {
  "group-request": {
    approve: (env, payload, by) => answerGroup(env, payload, true, by),
    reject: (env, payload, by) => answerGroup(env, payload, false, by),
  },
};
