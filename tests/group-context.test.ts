import { describe, expect, it } from 'vitest';
import { resolveGroupContext } from '../src/handoff/group-context.js';

describe('resolveGroupContext', () => {
  it('returns null when memberships is undefined', () => {
    expect(resolveGroupContext('oc_x', undefined)).toBeNull();
  });

  it('returns null when memberships is empty', () => {
    expect(resolveGroupContext('oc_x', [])).toBeNull();
  });

  it('returns null when chatId does not match any membership groupId', () => {
    expect(
      resolveGroupContext('oc_x', [{ groupId: 'oc_y', members: ['a', 'b'] }]),
    ).toBeNull();
  });

  it('returns the matched group info when chatId equals a groupId', () => {
    expect(
      resolveGroupContext('oc_shared', [
        { groupId: 'oc_shared', members: ['claude-code', 'codex'] },
      ]),
    ).toEqual({ groupId: 'oc_shared', groupMembers: ['claude-code', 'codex'] });
  });

  it('picks the right group when the bot belongs to multiple groups', () => {
    const memberships = [
      { groupId: 'oc_a', members: ['claude-code', 'codex'] },
      { groupId: 'oc_b', members: ['claude-code', 'openclaw'] },
    ];
    expect(resolveGroupContext('oc_b', memberships)).toEqual({
      groupId: 'oc_b',
      groupMembers: ['claude-code', 'openclaw'],
    });
  });
});
