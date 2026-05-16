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
 * `oc_xxx` for Feishu-backed groups). Use `chatIdToGroupId` to normalize
 * synthetic `grouptalk-<groupId>-<bot>` chatIds before calling this.
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

/**
 * Strip the `grouptalk-<groupId>-<botName>` envelope used by inter-bot relays
 * so the embedded `<groupId>` can be matched against configured memberships.
 * Returns the chatId unchanged when it doesn't match the pattern.
 *
 * The pattern is greedy on the middle segment so groupIds containing dashes
 * (uncommon, but possible if a user names a Web-UI group with dashes) round-trip
 * correctly — the trailing `-<botName>` is always the last hyphen-delimited
 * segment.
 */
export function chatIdToGroupId(chatId: string): string {
  const m = chatId.match(/^grouptalk-(.+)-[^-]+$/);
  return m ? m[1] : chatId;
}

/**
 * One-shot helper for the two call sites in `MessageBridge` (`executeQuery`
 * + `executeApiTask`). Combines normalization, membership lookup, and an
 * explicit-override precedence rule:
 *
 *   1. If the caller already passed explicit `groupMembers` / `groupId`
 *      (e.g. ws-server's synthetic `group-<id>-<bot>` Web-UI path), those win.
 *   2. Otherwise, normalize the chatId and look it up against memberships
 *      configured in `bots.json`.
 *   3. If neither yields members, return `{}` so the caller can spread it
 *      without producing `groupMembers: undefined` noise on the apiContext.
 *
 * `explicit.groupMembers === undefined` is treated as "not provided" so a
 * caller passing `{ groupMembers: options.groupMembers, groupId: options.groupId }`
 * with both undefined still falls through to the membership lookup.
 */
export function selectGroupContext(
  chatId: string,
  memberships: readonly GroupMembership[] | undefined,
  explicit?: { groupMembers?: string[]; groupId?: string },
): { groupMembers?: string[]; groupId?: string } {
  const fallback = resolveGroupContext(chatIdToGroupId(chatId), memberships);
  const groupMembers = explicit?.groupMembers ?? fallback?.groupMembers;
  const groupId = explicit?.groupId ?? fallback?.groupId;
  return groupMembers ? { groupMembers, groupId } : {};
}
