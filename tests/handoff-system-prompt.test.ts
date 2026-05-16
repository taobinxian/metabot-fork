import { describe, expect, it } from 'vitest';
import { buildHandoffSystemPromptSection } from '../src/handoff/system-prompt.js';

describe('buildHandoffSystemPromptSection', () => {
  it('returns null when there are no peer bots (private chat or solo)', () => {
    expect(buildHandoffSystemPromptSection({ chatId: 'oc_x', peers: [] })).toBeNull();
  });

  it('returns null when chatId is missing', () => {
    expect(buildHandoffSystemPromptSection({ chatId: '', peers: ['codex'] })).toBeNull();
  });

  it('embeds the chat-specific board path so the bot does not guess it', () => {
    const section = buildHandoffSystemPromptSection({
      chatId: 'oc_abc',
      peers: ['codex'],
    });
    expect(section).not.toBeNull();
    expect(section!).toContain('~/.metabot/handoff/oc_abc.md');
  });

  it('lists every peer by name so the LLM can address them', () => {
    const section = buildHandoffSystemPromptSection({
      chatId: 'oc_abc',
      peers: ['codex', 'openclaw'],
    })!;
    expect(section).toContain('codex');
    expect(section).toContain('openclaw');
  });

  it('references the source-of-truth protocol spec path', () => {
    const section = buildHandoffSystemPromptSection({
      chatId: 'oc_abc',
      peers: ['codex'],
    })!;
    expect(section).toContain('AGENT_HANDOFF_PROTOCOL.md');
  });

  it('explicitly forbids carrying task body inside feishu messages (rule 12.6.1)', () => {
    const section = buildHandoffSystemPromptSection({
      chatId: 'oc_abc',
      peers: ['codex'],
    })!;
    // The protocol forbids carrying task body inside feishu/mb-talk messages.
    expect(section.toLowerCase()).toMatch(/not.*carry.*body|task body.*not|do not embed.*body|board is the (single )?source of truth/);
  });

  it('mentions both append-then-notify and turn check (rotation lock) as required steps', () => {
    const section = buildHandoffSystemPromptSection({
      chatId: 'oc_abc',
      peers: ['codex'],
    })!;
    expect(section.toLowerCase()).toContain('turn');
    expect(section.toLowerCase()).toContain('mb talk');
  });
});
