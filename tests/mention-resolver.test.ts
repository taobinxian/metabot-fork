import { describe, it, expect } from 'vitest';
import { resolveBotMentions } from '../src/bridge/mention-resolver.js';

const lookup = (name: string): string | undefined => {
  const table: Record<string, string | undefined> = {
    codex: 'ou_c1fdf5baed1ffdded0a04760c10df055',
    'claude-code': 'ou_fbeb8d66691144dc82a485d1b135516c',
    my_bot: 'ou_under_score',
    no_id_bot: undefined,
  };
  return table[name];
};

describe('resolveBotMentions', () => {
  it('replaces a known bot mention at the start of the text', () => {
    expect(resolveBotMentions('@codex hi', lookup)).toBe(
      '<at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at> hi',
    );
  });

  it('replaces a known bot mention in the middle of the text', () => {
    expect(resolveBotMentions('hello @codex bye', lookup)).toBe(
      'hello <at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at> bye',
    );
  });

  it('leaves an unknown bot mention untouched', () => {
    expect(resolveBotMentions('@nobody hi', lookup)).toBe('@nobody hi');
  });

  it('does not eat the @ inside an email address', () => {
    expect(resolveBotMentions('foo@bar.com is here', lookup)).toBe('foo@bar.com is here');
  });

  it('does not match @<botname> when preceded by a word character', () => {
    expect(resolveBotMentions('foo@codex bar', lookup)).toBe('foo@codex bar');
  });

  it('replaces multiple mentions in one text', () => {
    const out = resolveBotMentions('@codex see @claude-code', lookup);
    expect(out).toBe(
      '<at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at> see <at user_id="ou_fbeb8d66691144dc82a485d1b135516c"></at>',
    );
  });

  it('matches bot names containing a hyphen', () => {
    expect(resolveBotMentions('@claude-code hi', lookup)).toBe(
      '<at user_id="ou_fbeb8d66691144dc82a485d1b135516c"></at> hi',
    );
  });

  it('matches bot names containing an underscore', () => {
    expect(resolveBotMentions('@my_bot ok', lookup)).toBe(
      '<at user_id="ou_under_score"></at> ok',
    );
  });

  it('does not re-resolve a pre-existing <at> tag, only the @name token', () => {
    const input = '<at user_id="ou_existing"></at> see @codex';
    expect(resolveBotMentions(input, lookup)).toBe(
      '<at user_id="ou_existing"></at> see <at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at>',
    );
  });

  it('triggers after a CJK punctuation boundary', () => {
    expect(resolveBotMentions('请@codex 看一下', lookup)).toBe(
      '请<at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at> 看一下',
    );
  });

  it('keeps the mention untouched when the lookup returns undefined for an empty id', () => {
    expect(resolveBotMentions('@no_id_bot x', lookup)).toBe('@no_id_bot x');
  });

  it('returns an empty string for an empty input', () => {
    expect(resolveBotMentions('', lookup)).toBe('');
  });

  it('is case-sensitive: @Codex with a capital C is not resolved', () => {
    expect(resolveBotMentions('@Codex hi', lookup)).toBe('@Codex hi');
  });

  it('treats a trailing punctuation as a boundary', () => {
    expect(resolveBotMentions('say @codex.', lookup)).toBe(
      'say <at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at>.',
    );
  });

  it('is idempotent: resolving an already-resolved string yields the same result', () => {
    const once = resolveBotMentions('hello @codex bye', lookup);
    const twice = resolveBotMentions(once, lookup);
    expect(twice).toBe(once);
  });

  it('does not match an "@" that appears inside an existing <at> tag value', () => {
    const input = '<at user_id="ou_xxx@whatever"></at> hi';
    expect(resolveBotMentions(input, lookup)).toBe(input);
  });

  it('falls back to the original text when the lookup callback throws', () => {
    const throwingLookup = () => {
      throw new Error('boom');
    };
    expect(resolveBotMentions('@codex hi', throwingLookup)).toBe('@codex hi');
  });
});
