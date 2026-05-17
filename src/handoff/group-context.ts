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
 * so the embedded `<groupId>` can be matched against configured memberships
 * or used as a Feishu API `receive_id`. Returns the chatId unchanged when it
 * doesn't match the pattern.
 *
 * Only Feishu-backed envelopes are unwrapped. Their inner `<groupId>` is a
 * real Feishu chat id of the form `oc_<32-hex>` (no hyphens), so the capture
 * is anchored to `oc_[^-]+` and requires a non-empty bot-name suffix
 * (`.+$`). This lets bot names that contain dashes (e.g. `claude-code`)
 * round-trip correctly — a naive greedy `(.+)-` pattern would mis-capture
 * `oc_abc-claude` from `grouptalk-oc_abc-claude-code` and then re-fail the
 * Feishu call with `invalid receive_id`.
 *
 * The Web-UI per-bot routing chatId uses a different prefix
 * (`group-<id>-<bot>`, see ws-server.ts:680) and is therefore unaffected.
 * Web-UI _cross-bot_ `mb talk` envelopes (`grouptalk-grp-<ts>-<rand>-<bot>`)
 * are also intentionally NOT unwrapped — the inner id is not a real Feishu
 * chat id, so even if it were extracted the downstream Feishu send would
 * still fail. That path is unsupported by design; the synthetic chatId is
 * pass-through and the WS subscription mechanism in ws-server delivers the
 * inter-bot dialogue to the Web-UI instead.
 */
export function chatIdToGroupId(chatId: string): string {
  const m = chatId.match(/^grouptalk-(oc_[^-]+)-.+$/);
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
