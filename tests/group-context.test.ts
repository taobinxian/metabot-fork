import { describe, expect, it } from 'vitest';
import {
  resolveGroupContext,
  chatIdToGroupId,
  selectGroupContext,
} from '../src/handoff/group-context.js';

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

describe('chatIdToGroupId', () => {
  it('returns a plain Feishu chat id unchanged', () => {
    expect(chatIdToGroupId('oc_abc')).toBe('oc_abc');
  });

  it('extracts the embedded groupId from `grouptalk-<groupId>-<bot>`', () => {
    expect(chatIdToGroupId('grouptalk-oc_abc-codex')).toBe('oc_abc');
  });

  it('handles a groupId containing dashes (greedy match through last dash before bot)', () => {
    expect(chatIdToGroupId('grouptalk-oc_a-b-c-codex')).toBe('oc_a-b-c');
  });

  it('does not normalize a malformed grouptalk pattern with no bot suffix', () => {
    expect(chatIdToGroupId('grouptalk-onlyone')).toBe('grouptalk-onlyone');
  });

  it('returns empty string unchanged', () => {
    expect(chatIdToGroupId('')).toBe('');
  });
});

describe('selectGroupContext', () => {
  const memberships = [{ groupId: 'oc_shared', members: ['claude-code', 'codex'] }];

  it('returns empty when neither explicit nor membership matches', () => {
    expect(selectGroupContext('oc_other', memberships)).toEqual({});
  });

  it('uses the membership fallback when chatId matches a configured group', () => {
    expect(selectGroupContext('oc_shared', memberships)).toEqual({
      groupMembers: ['claude-code', 'codex'],
      groupId: 'oc_shared',
    });
  });

  it('normalizes grouptalk chatId before looking up memberships', () => {
    expect(selectGroupContext('grouptalk-oc_shared-codex', memberships)).toEqual({
      groupMembers: ['claude-code', 'codex'],
      groupId: 'oc_shared',
    });
  });

  it('lets explicit groupMembers override the membership fallback', () => {
    expect(
      selectGroupContext('oc_shared', memberships, {
        groupMembers: ['override-bot'],
        groupId: 'override-id',
      }),
    ).toEqual({ groupMembers: ['override-bot'], groupId: 'override-id' });
  });

  it('uses explicit groupMembers even when no membership matches', () => {
    expect(
      selectGroupContext('oc_unknown', memberships, {
        groupMembers: ['ws-group-bot'],
        groupId: 'ws-group-id',
      }),
    ).toEqual({ groupMembers: ['ws-group-bot'], groupId: 'ws-group-id' });
  });

  it('falls back to membership when explicit fields are undefined', () => {
    expect(
      selectGroupContext('oc_shared', memberships, {
        groupMembers: undefined,
        groupId: undefined,
      }),
    ).toEqual({ groupMembers: ['claude-code', 'codex'], groupId: 'oc_shared' });
  });
});
