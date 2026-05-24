import { describe, it, expect } from 'vitest';
import { buildCard, buildHelpCard, buildStatusCard, buildTextCard } from '../src/feishu/card-builder.js';
import type { CardState } from '../src/types.js';

describe('buildCard', () => {
  it('builds thinking card', () => {
    const state: CardState = {
      status: 'thinking',
      userPrompt: 'hello',
      responseText: '',
      toolCalls: [],
    };
    const json = JSON.parse(buildCard(state));
    expect(json.header.template).toBe('blue');
    expect(json.header.title.content).toContain('Thinking');
    expect(json.elements.some((e: any) => e.tag === 'markdown' && /thinking/i.test(e.content))).toBe(true);
  });

  it('builds running card with tool calls', () => {
    const state: CardState = {
      status: 'running',
      userPrompt: 'fix bug',
      responseText: 'Looking at the code...',
      toolCalls: [
        { name: 'Read', detail: '`src/index.ts`', status: 'done' },
        { name: 'Edit', detail: '`src/index.ts`', status: 'running' },
      ],
    };
    const json = JSON.parse(buildCard(state));
    expect(json.header.template).toBe('blue');
    const md = json.elements.find((e: any) => e.tag === 'markdown' && e.content.includes('Read'));
    expect(md).toBeDefined();
    expect(md.content).toContain('✅');
    expect(md.content).toContain('⏳');
  });

  it('builds complete card with stats', () => {
    const state: CardState = {
      status: 'complete',
      userPrompt: 'task',
      responseText: 'All done!',
      toolCalls: [],
      durationMs: 5000,
      costUsd: 0.03,
    };
    const json = JSON.parse(buildCard(state));
    expect(json.header.template).toBe('green');
    const note = json.elements.find((e: any) => e.tag === 'note');
    expect(note).toBeDefined();
    expect(note.elements[0].content).toContain('5.0s');
  });

  it('builds error card with error message', () => {
    const state: CardState = {
      status: 'error',
      userPrompt: 'task',
      responseText: '',
      toolCalls: [],
      errorMessage: 'Process crashed',
    };
    const json = JSON.parse(buildCard(state));
    expect(json.header.template).toBe('red');
    const errEl = json.elements.find((e: any) => e.tag === 'markdown' && e.content.includes('Process crashed'));
    expect(errEl).toBeDefined();
  });

  it('builds waiting_for_input card with question', () => {
    const state: CardState = {
      status: 'waiting_for_input',
      userPrompt: 'deploy',
      responseText: 'Before deploying...',
      toolCalls: [],
      pendingQuestion: {
        toolUseId: 'q1',
        questions: [{
          question: 'Which env?',
          header: 'Deploy',
          options: [
            { label: 'Production', description: 'Live environment' },
            { label: 'Staging', description: 'Test environment' },
          ],
          multiSelect: false,
        }],
      },
    };
    const json = JSON.parse(buildCard(state));
    expect(json.header.template).toBe('yellow');
    const qEl = json.elements.find((e: any) => e.tag === 'markdown' && e.content.includes('Which env?'));
    expect(qEl).toBeDefined();
    expect(qEl.content).toContain('Production');
    expect(qEl.content).toContain('Staging');
    // No interactive button action element: Feishu WSClient long-connection
    // mode does not deliver card.action.trigger events to the bridge, so any
    // rendered button click fails with code 200340 ("出错了"). Until we move
    // card callbacks to an HTTP webhook, render text-only and tell the user
    // to reply with the option number.
    const actionEl = json.elements.find((e: any) => e.tag === 'action');
    expect(actionEl).toBeUndefined();
    // The text-reply hint must instruct numeric input explicitly.
    const hintEl = json.elements.find(
      (e: any) => e.tag === 'markdown' && typeof e.content === 'string' && e.content.includes('请直接回复编号'),
    );
    expect(hintEl).toBeDefined();
  });

  it('truncates long content', () => {
    const state: CardState = {
      status: 'complete',
      userPrompt: 'task',
      responseText: 'x'.repeat(30000),
      toolCalls: [],
    };
    const json = JSON.parse(buildCard(state));
    const md = json.elements.find((e: any) => e.tag === 'markdown' && e.content.includes('truncated'));
    expect(md).toBeDefined();
  });

  it('renders a background task section with status icon + last event', () => {
    const state: CardState = {
      status: 'running',
      userPrompt: 'watch ci',
      responseText: 'watching…',
      toolCalls: [],
      backgroundEvents: [
        { taskId: 'bheol4172', description: 'Watching CI for PR #215', status: 'running', lastEvent: 'check (20) running' },
        { taskId: 'bmkr16j6f', description: 'Watching deploy', status: 'completed', lastEvent: 'CI done: success' },
      ],
    };
    const json = JSON.parse(buildCard(state));
    const bg = json.elements.find((e: any) => e.tag === 'markdown' && /Background/.test(e.content));
    expect(bg).toBeDefined();
    expect(bg.content).toContain('⏳');
    expect(bg.content).toContain('✅');
    expect(bg.content).toContain('Watching CI for PR #215');
    expect(bg.content).toContain('check (20) running');
    expect(bg.content).toContain('CI done: success');
    expect(bg.content).toContain('bheol4'); // short task id
  });

  it('omits background section when no events', () => {
    const state: CardState = {
      status: 'running',
      userPrompt: 'x',
      responseText: 'y',
      toolCalls: [],
    };
    const json = JSON.parse(buildCard(state));
    const bg = json.elements.find((e: any) => e.tag === 'markdown' && /Background/.test(e.content));
    expect(bg).toBeUndefined();
  });

  it('does not render <at> in card body even when mentionUserId is set (push is via completion notice text)', () => {
    const state: CardState = {
      status: 'running',
      userPrompt: 'hi',
      responseText: 'done',
      toolCalls: [],
      mentionUserId: 'ou_abc123',
    };
    const json = JSON.parse(buildCard(state));
    const atEl = json.elements.find((e: any) => e.tag === 'markdown' && /<at /.test(e.content));
    expect(atEl).toBeUndefined();
  });
});

describe('buildHelpCard', () => {
  it('returns valid card JSON', () => {
    const json = JSON.parse(buildHelpCard());
    expect(json.header.title.content).toContain('Help');
    expect(json.elements.length).toBeGreaterThan(0);
  });
});

describe('buildStatusCard', () => {
  it('shows session info', () => {
    const json = JSON.parse(buildStatusCard('user123', '/home/user/project', 'sess-abc-12345678', true));
    const md = json.elements[0].content;
    expect(md).toContain('user123');
    expect(md).toContain('/home/user/project');
    expect(md).toContain('sess-abc');
    expect(md).toContain('Yes');
  });

  it('shows no session', () => {
    const json = JSON.parse(buildStatusCard('user', '/home', undefined, false));
    const md = json.elements[0].content;
    expect(md).toContain('None');
    expect(md).toContain('No');
  });
});

describe('buildTextCard', () => {
  it('builds simple text card', () => {
    const json = JSON.parse(buildTextCard('Title', 'Some content', 'green'));
    expect(json.header.template).toBe('green');
    expect(json.header.title.content).toBe('Title');
    expect(json.elements[0].content).toBe('Some content');
  });
});
