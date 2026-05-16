/**
 * Decide whether an incoming group message is a multi-bot handoff trigger.
 *
 * Trigger: the message @mentions ≥1 *configured peer bot* (besides this bot
 * itself). Configured-only by design — regular human @mentions never trip the
 * handoff path, and a typo'd bot name silently degrades to a normal reply.
 *
 * The peer table is owned by bot config (bots.json / runtime). Returning the
 * matched peers lets the caller (event handler / engine system prompt) build
 * the agent roster shown to the LLM without re-walking the mention array.
 */

export interface PeerBot {
  name: string;
  openId: string;
}

export interface MentionEntry {
  id?: { open_id?: string };
}

export interface HandoffDetection {
  isHandoff: boolean;
  peers: PeerBot[];
}

export function detectHandoffMode(
  mentions: MentionEntry[] | undefined,
  ownBotOpenId: string | undefined,
  knownPeers: PeerBot[],
): HandoffDetection {
  if (!mentions || mentions.length === 0) {
    return { isHandoff: false, peers: [] };
  }
  const peerByOpenId = new Map<string, PeerBot>();
  for (const peer of knownPeers) {
    if (ownBotOpenId && peer.openId === ownBotOpenId) continue;
    peerByOpenId.set(peer.openId, peer);
  }
  const matched: PeerBot[] = [];
  const seenIds = new Set<string>();
  for (const entry of mentions) {
    const openId = entry?.id?.open_id;
    if (!openId) continue;
    if (seenIds.has(openId)) continue;
    const peer = peerByOpenId.get(openId);
    if (!peer) continue;
    seenIds.add(openId);
    matched.push(peer);
  }
  return { isHandoff: matched.length > 0, peers: matched };
}
