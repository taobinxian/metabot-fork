/**
 * Build the HANDOFF Protocol section appended to a bot's system prompt when
 * it's in a group with peer bots. Returns null when handoff doesn't apply
 * (private chat, no peers, missing chatId) so callers can `if (s) push(s)`.
 *
 * The text deliberately points at the canonical protocol spec rather than
 * inlining the whole 300-line document — the spec evolves, and duplicating
 * it inside every bot's runtime would silently rot.
 *
 * Protocol invariants we DO inline (the ones a LLM would otherwise violate
 * without external reminders):
 *   - Board file is the single source of truth; mb talk only delivers a
 *     pointer, never the task body (spec §12.6 rule 1).
 *   - Caller must `read STATUS.turn` and verify `turn == self` before any
 *     append; otherwise it's a rotation-lock violation (spec §6 rule 1).
 *   - Append → update STATUS → mb talk, in that order (spec §12.6 rule 2).
 */

export interface HandoffSystemPromptInput {
  chatId: string;
  peers: string[];
}

const PROTOCOL_SPEC_PATH = '/Users/taobinxian/claude-agent/deepaix/docs/AGENT_HANDOFF_PROTOCOL.md';

export function buildHandoffSystemPromptSection(
  input: HandoffSystemPromptInput,
): string | null {
  if (!input.chatId || input.peers.length === 0) return null;
  const boardPath = `~/.metabot/handoff/${input.chatId}.md`;
  const peerList = input.peers.join(', ');
  return [
    '## HANDOFF Protocol (multi-agent file-backed collaboration)',
    '',
    `You share this group with peer bots: ${peerList}.`,
    'For tasks that need persistence, audit, multi-round delegation, or blocking on a peer\'s answer, use the file-based handoff protocol instead of plain `mb talk`.',
    '',
    `**Board for this chat**: \`${boardPath}\` — the single source of truth for task body, Acceptance, Evidence, and turn ownership.`,
    `**Protocol spec**: \`${PROTOCOL_SPEC_PATH}\` (read once before your first handoff in a new session).`,
    '',
    '### Hard rules (do not violate)',
    '1. The board is the single source of truth. Do NOT carry task body inside feishu messages or `mb talk` payloads — `mb talk` only delivers a pointer like `msg-NNN appended, please process`.',
    '2. Before writing a message, read STATUS and verify `turn == yourself`. If not, do not append — reply "STATUS.turn is X, refusing to write" and stop.',
    '3. Order of operations on each turn: append message → update STATUS (turn / last_msg_id / updated_at) → `mb talk` the peer to notify.',
    '4. Post one short progress line in the feishu group after each round so the user can follow along (e.g. "msg-003 appended, codex is handling").',
    '',
    '### When to use vs skip',
    '- Use it when: the task takes >30s, needs a peer review, needs an audit trail, or has multiple back-and-forth rounds.',
    '- Skip it when: the question is one-shot and answerable in <30s — a single synchronous `mb talk` is fine for that.',
  ].join('\n');
}
