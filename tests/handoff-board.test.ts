import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getBoardPath,
  readBoard,
  initBoard,
  appendMessage,
} from '../src/handoff/board.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'handoff-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const fixedNow = () => new Date('2026-05-16T10:00:00Z');

describe('getBoardPath', () => {
  it('resolves to <baseDir>/<chatId>.md', () => {
    expect(getBoardPath('oc_abc', '/tmp/board')).toBe('/tmp/board/oc_abc.md');
  });

  it('rejects chatId containing path traversal characters', () => {
    expect(() => getBoardPath('../etc/passwd', '/tmp/board')).toThrow();
    expect(() => getBoardPath('a/b', '/tmp/board')).toThrow();
  });
});

describe('readBoard', () => {
  it('returns null when the file does not exist', async () => {
    const path = join(tmpDir, 'missing.md');
    expect(await readBoard(path)).toBeNull();
  });

  it('reads back STATUS and messages written by initBoard + appendMessage', async () => {
    const path = join(tmpDir, 'oc_abc.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    await appendMessage(
      path,
      {
        from: 'claude-code',
        to: 'codex',
        type: 'request',
        thread: 'thread-x',
        status: 'pending',
        body: 'Hello codex',
      },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );

    const board = await readBoard(path);
    expect(board).not.toBeNull();
    expect(board!.status.turn).toBe('codex');
    expect(board!.status.lastMsgId).toBe('msg-001');
    expect(board!.messages).toHaveLength(1);
    expect(board!.messages[0].id).toBe('msg-001');
    expect(board!.messages[0].from).toBe('claude-code');
    expect(board!.messages[0].to).toBe('codex');
    expect(board!.messages[0].type).toBe('request');
    expect(board!.messages[0].body).toContain('Hello codex');
  });
});

describe('initBoard', () => {
  it('creates a new board with initial turn and empty MESSAGES section', async () => {
    const path = join(tmpDir, 'new.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('# AGENT HANDOFF BOARD');
    expect(content).toContain('## STATUS');
    expect(content).toContain('turn: claude-code');
    expect(content).toContain('last_msg_id: null');
    expect(content).toContain('## MESSAGES');
  });

  it('refuses to overwrite an existing board', async () => {
    const path = join(tmpDir, 'existing.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    await expect(initBoard(path, 'codex', { now: fixedNow })).rejects.toThrow();
  });
});

describe('appendMessage', () => {
  it('appends msg-001 then msg-002 with monotonic ids', async () => {
    const path = join(tmpDir, 'oc.md');
    await initBoard(path, 'claude-code', { now: fixedNow });

    const r1 = await appendMessage(
      path,
      { from: 'claude-code', to: 'codex', type: 'request', thread: 't', status: 'pending', body: 'one' },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );
    expect(r1).toEqual({ ok: true, id: 'msg-001' });

    const r2 = await appendMessage(
      path,
      { from: 'codex', to: 'claude-code', type: 'response', thread: 't', status: 'completed', body: 'two' },
      { expectedTurn: 'codex', nextTurn: 'claude-code', now: fixedNow },
    );
    expect(r2).toEqual({ ok: true, id: 'msg-002' });

    const board = await readBoard(path);
    expect(board!.status.lastMsgId).toBe('msg-002');
    expect(board!.status.turn).toBe('claude-code');
    expect(board!.messages.map((m) => m.id)).toEqual(['msg-001', 'msg-002']);
  });

  it('rejects when expectedTurn does not match STATUS.turn (rotation lock)', async () => {
    const path = join(tmpDir, 'oc.md');
    await initBoard(path, 'claude-code', { now: fixedNow });

    const result = await appendMessage(
      path,
      { from: 'codex', to: 'claude-code', type: 'request', thread: 't', status: 'pending', body: 'wrong' },
      { expectedTurn: 'codex', nextTurn: 'claude-code', now: fixedNow },
    );
    expect(result).toEqual({ ok: false, reason: 'wrong_turn', currentTurn: 'claude-code' });

    const board = await readBoard(path);
    expect(board!.messages).toHaveLength(0);
    expect(board!.status.lastMsgId).toBeNull();
  });

  it('rejects when board does not exist', async () => {
    const path = join(tmpDir, 'never.md');
    const result = await appendMessage(
      path,
      { from: 'claude-code', to: 'codex', type: 'request', thread: 't', status: 'pending', body: '' },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );
    expect(result).toEqual({ ok: false, reason: 'no_board' });
  });

  it('recovers from a corrupted last_msg_id by scanning messages for max numeric id', async () => {
    const path = join(tmpDir, 'corrupted.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    await appendMessage(
      path,
      { from: 'claude-code', to: 'codex', type: 'request', thread: 't', status: 'pending', body: 'first' },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );
    // Simulate corruption: hand-edit last_msg_id to a non-numeric value
    const text = readFileSync(path, 'utf8').replace(/last_msg_id: msg-001/, 'last_msg_id: msg-bad');
    writeFileSync(path, text);

    // STATUS.turn is still 'codex' (set by previous append), so codex appends next
    const result = await appendMessage(
      path,
      { from: 'codex', to: 'claude-code', type: 'response', thread: 't', status: 'completed', body: 'second' },
      { expectedTurn: 'codex', nextTurn: 'claude-code', now: fixedNow },
    );
    expect(result).toEqual({ ok: true, id: 'msg-002' });
  });

  it('starts from msg-001 when last_msg_id is corrupted and no messages exist', async () => {
    const path = join(tmpDir, 'corrupted-empty.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    // Corrupt the STATUS without any messages present
    const text = readFileSync(path, 'utf8').replace(/last_msg_id: null/, 'last_msg_id: msg-garbage');
    writeFileSync(path, text);

    const result = await appendMessage(
      path,
      { from: 'claude-code', to: 'codex', type: 'request', thread: 't', status: 'pending', body: 'first ever' },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );
    expect(result).toEqual({ ok: true, id: 'msg-001' });
  });

  it('keeps the body intact when it quotes a `### msg-NNN` line that is not a real message header', async () => {
    const path = join(tmpDir, 'quote.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    const quotedBody = [
      'Earlier in msg-001 we agreed to X.',
      '### msg-001 said: do not regress',
      'And here is the follow-up.',
    ].join('\n');
    await appendMessage(
      path,
      { from: 'claude-code', to: 'codex', type: 'request', thread: 't', status: 'pending', body: quotedBody },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );
    await appendMessage(
      path,
      { from: 'codex', to: 'claude-code', type: 'response', thread: 't', status: 'completed', body: 'done' },
      { expectedTurn: 'codex', nextTurn: 'claude-code', now: fixedNow },
    );
    const board = await readBoard(path);
    expect(board!.messages).toHaveLength(2);
    expect(board!.messages[0].body).toContain('### msg-001 said: do not regress');
    expect(board!.messages[0].body).toContain('And here is the follow-up.');
  });

  it('preserves YAML metadata round-trip including refs and artifacts', async () => {
    const path = join(tmpDir, 'oc.md');
    await initBoard(path, 'claude-code', { now: fixedNow });
    await appendMessage(
      path,
      {
        from: 'claude-code',
        to: 'codex',
        type: 'request',
        thread: 'thread-refactor',
        status: 'pending',
        refs: ['msg-prev-1', 'msg-prev-2'],
        artifacts: ['src/foo.ts', 'docs/AGENT_HANDOFF.md'],
        body: 'Please look at these files',
      },
      { expectedTurn: 'claude-code', nextTurn: 'codex', now: fixedNow },
    );

    const board = await readBoard(path);
    const msg = board!.messages[0];
    expect(msg.refs).toEqual(['msg-prev-1', 'msg-prev-2']);
    expect(msg.artifacts).toEqual(['src/foo.ts', 'docs/AGENT_HANDOFF.md']);
    expect(msg.thread).toBe('thread-refactor');
  });
});
