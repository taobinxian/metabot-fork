import { describe, expect, it } from 'vitest';
import { distributeGroupMemberships } from '../src/config.js';

describe('distributeGroupMemberships', () => {
  it('returns bots untouched when no groups are configured', () => {
    const bots = [{ name: 'claude-code' } as any];
    const result = distributeGroupMemberships(bots, []);
    expect(result[0].groupMemberships).toBeUndefined();
  });

  it('assigns the group to every member bot listed in the group', () => {
    const bots = [{ name: 'claude-code' } as any, { name: 'codex' } as any];
    const groups = [{ id: 'oc_x', members: ['claude-code', 'codex'] }];
    const result = distributeGroupMemberships(bots, groups);
    expect(result[0].groupMemberships).toEqual([
      { groupId: 'oc_x', members: ['claude-code', 'codex'] },
    ]);
    expect(result[1].groupMemberships).toEqual([
      { groupId: 'oc_x', members: ['claude-code', 'codex'] },
    ]);
  });

  it('does not assign a group to bots that are not in its members list', () => {
    const bots = [{ name: 'claude-code' } as any, { name: 'someone-else' } as any];
    const groups = [{ id: 'oc_x', members: ['claude-code', 'codex'] }];
    const result = distributeGroupMemberships(bots, groups);
    expect(result[0].groupMemberships).toEqual([
      { groupId: 'oc_x', members: ['claude-code', 'codex'] },
    ]);
    expect(result[1].groupMemberships).toBeUndefined();
  });

  it('supports a bot belonging to multiple groups', () => {
    const bots = [{ name: 'claude-code' } as any];
    const groups = [
      { id: 'oc_a', members: ['claude-code', 'codex'] },
      { id: 'oc_b', members: ['claude-code', 'openclaw'] },
    ];
    const result = distributeGroupMemberships(bots, groups);
    expect(result[0].groupMemberships).toHaveLength(2);
    expect(result[0].groupMemberships![0].groupId).toBe('oc_a');
    expect(result[0].groupMemberships![1].groupId).toBe('oc_b');
  });

  it('preserves other bot fields untouched', () => {
    const bots = [{ name: 'claude-code', description: 'desc', extra: 42 } as any];
    const groups = [{ id: 'oc_x', members: ['claude-code'] }];
    const result = distributeGroupMemberships(bots, groups);
    expect(result[0].description).toBe('desc');
    expect((result[0] as any).extra).toBe(42);
  });

  it('does not mutate the input bot objects', () => {
    const original = { name: 'claude-code' } as any;
    const groups = [{ id: 'oc_x', members: ['claude-code'] }];
    const result = distributeGroupMemberships([original], groups);
    expect(result[0]).not.toBe(original);
    expect(original.groupMemberships).toBeUndefined();
  });

  it('handles undefined groups input (no group config block at all)', () => {
    const bots = [{ name: 'claude-code' } as any];
    const result = distributeGroupMemberships(bots, undefined);
    expect(result[0].groupMemberships).toBeUndefined();
  });
});
