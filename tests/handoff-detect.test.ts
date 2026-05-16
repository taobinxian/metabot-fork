import { describe, expect, it } from 'vitest';
import { detectHandoffMode, type PeerBot } from '../src/handoff/detect.js';

const SELF = 'ou_self';
const peers: PeerBot[] = [
  { name: 'codex', openId: 'ou_codex' },
  { name: 'openclaw', openId: 'ou_openclaw' },
];

const mention = (openId: string) => ({ id: { open_id: openId } });

describe('detectHandoffMode', () => {
  it('returns isHandoff=false when mentions is undefined', () => {
    expect(detectHandoffMode(undefined, SELF, peers)).toEqual({ isHandoff: false, peers: [] });
  });

  it('returns isHandoff=false when mentions is empty', () => {
    expect(detectHandoffMode([], SELF, peers)).toEqual({ isHandoff: false, peers: [] });
  });

  it('returns isHandoff=false when only self is @mentioned', () => {
    expect(detectHandoffMode([mention(SELF)], SELF, peers)).toEqual({
      isHandoff: false,
      peers: [],
    });
  });

  it('returns isHandoff=true with the peer list when self + one peer are @mentioned', () => {
    const r = detectHandoffMode([mention(SELF), mention('ou_codex')], SELF, peers);
    expect(r.isHandoff).toBe(true);
    expect(r.peers).toEqual([{ name: 'codex', openId: 'ou_codex' }]);
  });

  it('returns isHandoff=true and de-duplicates a peer mentioned twice', () => {
    const r = detectHandoffMode(
      [mention(SELF), mention('ou_codex'), mention('ou_codex')],
      SELF,
      peers,
    );
    expect(r.peers).toEqual([{ name: 'codex', openId: 'ou_codex' }]);
  });

  it('ignores unknown @mentions that are not configured peers (regular users)', () => {
    const r = detectHandoffMode(
      [mention(SELF), mention('ou_random_user')],
      SELF,
      peers,
    );
    expect(r).toEqual({ isHandoff: false, peers: [] });
  });

  it('returns isHandoff=true when multiple peers are @mentioned', () => {
    const r = detectHandoffMode(
      [mention(SELF), mention('ou_codex'), mention('ou_openclaw')],
      SELF,
      peers,
    );
    expect(r.isHandoff).toBe(true);
    expect(r.peers.map((p) => p.name).sort()).toEqual(['codex', 'openclaw']);
  });

  it('does not include self in the peer list even if self openId is in the peer table by mistake', () => {
    const badPeers: PeerBot[] = [
      { name: 'self-misconfig', openId: SELF },
      { name: 'codex', openId: 'ou_codex' },
    ];
    const r = detectHandoffMode([mention(SELF), mention('ou_codex')], SELF, badPeers);
    expect(r.peers).toEqual([{ name: 'codex', openId: 'ou_codex' }]);
  });

  it('tolerates malformed mention entries without open_id', () => {
    const r = detectHandoffMode(
      [{} as any, { id: {} } as any, mention('ou_codex')],
      SELF,
      peers,
    );
    expect(r.peers).toEqual([{ name: 'codex', openId: 'ou_codex' }]);
  });
});
