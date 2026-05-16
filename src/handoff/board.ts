import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * AGENT_HANDOFF.md board reader/writer.
 *
 * Implements the file-based handoff protocol described in
 * deepaix/docs/AGENT_HANDOFF_PROTOCOL.md: one board file per chat, with a
 * STATUS yaml block (turn / last_msg_id / updated_at) at the top and an
 * append-only `## MESSAGES` section below. Rotation lock is enforced at
 * append time — callers declare which turn they think they hold, and writes
 * are rejected if STATUS.turn diverges.
 *
 * P0 scope: flat STATUS only (no open_threads), single-process safety via a
 * per-path async mutex. The yaml encoder/parser is intentionally minimal
 * (key: value lines + flow arrays) — the board format is fully self-emitted
 * so the schema cannot drift.
 */

export interface BoardStatus {
  turn: string;
  lastMsgId: string | null;
  updatedAt: string;
}

export interface HandoffMessage {
  id: string;
  from: string;
  to: string;
  ts: string;
  type: string;
  thread: string;
  refs?: string[];
  status: string;
  artifacts?: string[];
  body: string;
}

export interface Board {
  status: BoardStatus;
  messages: HandoffMessage[];
}

export interface NowOpts {
  now?: () => Date;
}

export interface AppendOpts extends NowOpts {
  expectedTurn: string;
  nextTurn: string;
}

export type AppendResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'wrong_turn'; currentTurn: string }
  | { ok: false; reason: 'no_board' };

export function getBoardPath(chatId: string, baseDir: string): string {
  if (
    chatId.length === 0 ||
    chatId.includes('/') ||
    chatId.includes('\\') ||
    chatId.includes('..') ||
    chatId.includes('\0')
  ) {
    throw new Error(`Unsafe chatId for board path: ${chatId}`);
  }
  return `${baseDir}/${chatId}.md`;
}

function emitFlowArray(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(', ')}]`;
}

function parseFlowArray(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  try {
    const parsed = JSON.parse(`[${inner}]`);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    // fall through to lenient comma split
  }
  return inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
}

function parseFlatYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value === 'null' || value === '~' || value === '') {
      out[key] = null;
    } else if (value === 'true') {
      out[key] = true;
    } else if (value === 'false') {
      out[key] = false;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      out[key] = parseFlowArray(value);
    } else {
      out[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

const BOARD_HEADER = `# AGENT HANDOFF BOARD

<!-- 追加新消息只能 append 到末尾。修改既有消息只允许更新 status 字段。 -->`;

function buildStatusBlock(status: BoardStatus): string {
  return [
    '## STATUS',
    '```yaml',
    `turn: ${status.turn}`,
    `last_msg_id: ${status.lastMsgId === null ? 'null' : status.lastMsgId}`,
    `updated_at: ${status.updatedAt}`,
    'open_threads: []',
    '```',
  ].join('\n');
}

function buildMessageBlock(msg: HandoffMessage): string {
  const lines = [
    `from: ${msg.from}`,
    `to: ${msg.to}`,
    `ts: ${msg.ts}`,
    `type: ${msg.type}`,
    `thread: ${msg.thread}`,
    `status: ${msg.status}`,
  ];
  if (msg.refs && msg.refs.length > 0) lines.push(`refs: ${emitFlowArray(msg.refs)}`);
  if (msg.artifacts && msg.artifacts.length > 0) lines.push(`artifacts: ${emitFlowArray(msg.artifacts)}`);
  return [
    `### ${msg.id}`,
    '```yaml',
    ...lines,
    '```',
    '',
    '**Body**',
    '',
    msg.body,
  ].join('\n');
}

const MESSAGE_REGEX =
  /### (msg-\d{3,})\s*\n```yaml\s*\n([\s\S]*?)\n```\s*\n\s*\*\*Body\*\*\s*\n([\s\S]*?)(?=\n### msg-\d{3,}|\s*$)/g;

function parseBoard(text: string): Board {
  const statusMatch = text.match(/## STATUS\s*\n```yaml\s*\n([\s\S]*?)\n```/);
  const statusRaw = statusMatch ? parseFlatYaml(statusMatch[1]) : {};
  const status: BoardStatus = {
    turn: String(statusRaw.turn ?? ''),
    lastMsgId: statusRaw.last_msg_id === null ? null : String(statusRaw.last_msg_id),
    updatedAt: String(statusRaw.updated_at ?? ''),
  };

  const messages: HandoffMessage[] = [];
  const messagesIdx = text.indexOf('## MESSAGES');
  if (messagesIdx >= 0) {
    const section = text.slice(messagesIdx);
    MESSAGE_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MESSAGE_REGEX.exec(section)) !== null) {
      const id = m[1];
      const meta = parseFlatYaml(m[2]);
      const body = m[3].trim();
      messages.push({
        id,
        from: String(meta.from ?? ''),
        to: String(meta.to ?? ''),
        ts: String(meta.ts ?? ''),
        type: String(meta.type ?? ''),
        thread: String(meta.thread ?? ''),
        status: String(meta.status ?? ''),
        refs: Array.isArray(meta.refs) ? (meta.refs as string[]) : undefined,
        artifacts: Array.isArray(meta.artifacts) ? (meta.artifacts as string[]) : undefined,
        body,
      });
    }
  }
  return { status, messages };
}

export async function readBoard(path: string): Promise<Board | null> {
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  return parseBoard(text);
}

export async function initBoard(
  path: string,
  initialTurn: string,
  opts: NowOpts = {},
): Promise<void> {
  if (existsSync(path)) {
    throw new Error(`Board already exists: ${path}`);
  }
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const status: BoardStatus = { turn: initialTurn, lastMsgId: null, updatedAt: now };
  const body = [
    BOARD_HEADER,
    '',
    buildStatusBlock(status),
    '',
    '---',
    '',
    '## MESSAGES',
    '',
    '<!-- 在此下方 append `### msg-NNN` 开启第一条消息。 -->',
    '',
  ].join('\n');
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, body, { encoding: 'utf8', flag: 'wx' });
}

const pathLocks = new Map<string, Promise<unknown>>();

async function withPathLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const prev = pathLocks.get(path) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  pathLocks.set(path, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (pathLocks.get(path) === next) pathLocks.delete(path);
  }
}

export type AppendInput = Omit<HandoffMessage, 'id' | 'ts'> & { ts?: string };

export async function appendMessage(
  path: string,
  msg: AppendInput,
  opts: AppendOpts,
): Promise<AppendResult> {
  return withPathLock(path, async () => {
    if (!existsSync(path)) return { ok: false, reason: 'no_board' };
    const board = await readBoard(path);
    if (!board) return { ok: false, reason: 'no_board' };
    if (board.status.turn !== opts.expectedTurn) {
      return { ok: false, reason: 'wrong_turn', currentTurn: board.status.turn };
    }
    const now = (opts.now ?? (() => new Date()))().toISOString();
    const lastNum = board.status.lastMsgId
      ? parseInt(board.status.lastMsgId.replace('msg-', ''), 10)
      : 0;
    const nextId = `msg-${String(lastNum + 1).padStart(3, '0')}`;
    const newMessage: HandoffMessage = {
      id: nextId,
      from: msg.from,
      to: msg.to,
      ts: msg.ts ?? now,
      type: msg.type,
      thread: msg.thread,
      status: msg.status,
      refs: msg.refs,
      artifacts: msg.artifacts,
      body: msg.body,
    };
    const newStatus: BoardStatus = {
      turn: opts.nextTurn,
      lastMsgId: nextId,
      updatedAt: now,
    };

    const text = await readFile(path, 'utf8');
    const withNewStatus = text.replace(
      /## STATUS\s*\n```yaml\s*\n[\s\S]*?\n```/,
      buildStatusBlock(newStatus),
    );
    const trimmed = withNewStatus.replace(/\s+$/, '');
    const newBody = `${trimmed}\n\n---\n\n${buildMessageBlock(newMessage)}\n`;
    await writeFile(path, newBody, 'utf8');
    return { ok: true, id: nextId };
  });
}
