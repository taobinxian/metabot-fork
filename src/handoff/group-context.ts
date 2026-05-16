import type { GroupMembership } from '../config.js';

/**
 * Look up the group a chatId belongs to from this bot's `groupMemberships`.
 *
 * Returns the matched group as `{ groupId, groupMembers }` ready to be spread
 * into an `apiContext`. Returns `null` when no membership matches — callers
 * use that to mean "this is a private chat / unknown group, no Group Chat
 * section needed".
 *
 * Lookup is by exact match on `groupId` (which equals the Feishu chat id
 * `oc_xxx` for Feishu-backed groups).
 */
export function resolveGroupContext(
  chatId: string,
  memberships: readonly GroupMembership[] | undefined,
): { groupId: string; groupMembers: string[] } | null {
  if (!memberships || memberships.length === 0) return null;
  const found = memberships.find((m) => m.groupId === chatId);
  if (!found) return null;
  return { groupId: found.groupId, groupMembers: [...found.members] };
}
