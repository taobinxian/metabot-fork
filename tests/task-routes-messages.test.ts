import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { handleTaskRoutes } from '../src/api/routes/task-routes.js';
import type { RouteContext } from '../src/api/routes/types.js';
import type { RegisteredBot } from '../src/api/bot-registry.js';

function makeReq(body: object) {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as import('node:http').IncomingMessage;
}

interface FakeRes {
  statusCode: number;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (body?: unknown) => void;
}

function makeRes(): FakeRes {
  return {
    statusCode: 0,
    writeHead(status) {
      this.statusCode = status;
    },
    end() {},
  };
}

function makeBot(name: string, opts: { sendText: ReturnType<typeof vi.fn>; botOpenId?: string }): RegisteredBot {
  return {
    name,
    platform: 'feishu',
    config: {} as RegisteredBot['config'],
    bridge: {} as RegisteredBot['bridge'],
    sender: { sendText: opts.sendText } as unknown as RegisteredBot['sender'],
    botOpenId: opts.botOpenId,
  };
}

function makeCtx(bots: Map<string, RegisteredBot>): RouteContext {
  return {
    registry: { get: (name: string) => bots.get(name) },
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: () => ({}) },
  } as unknown as RouteContext;
}

describe('POST /api/messages — auto-resolve bot @mentions', () => {
  it('passes plain text through to sender.sendText unchanged', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const caller = makeBot('caller', { sendText });
    const ctx = makeCtx(new Map([['caller', caller]]));

    const handled = await handleTaskRoutes(
      ctx,
      makeReq({ botName: 'caller', chatId: 'oc_xxx', text: 'hello world' }),
      makeRes() as unknown as import('node:http').ServerResponse,
      'POST',
      '/api/messages',
    );
    expect(handled).toBe(true);
    expect(sendText).toHaveBeenCalledWith('oc_xxx', 'hello world');
  });

  it('rewrites "@<botName>" into <at user_id="<botOpenId>"></at> when the target bot is in the registry', async () => {
    const callerSendText = vi.fn().mockResolvedValue(undefined);
    const caller = makeBot('caller', { sendText: callerSendText });
    const codex = makeBot('codex', { sendText: vi.fn(), botOpenId: 'ou_c1fdf5baed1ffdded0a04760c10df055' });
    const ctx = makeCtx(new Map([['caller', caller], ['codex', codex]]));

    await handleTaskRoutes(
      ctx,
      makeReq({ botName: 'caller', chatId: 'oc_xxx', text: '@codex 三轮 review 请求' }),
      makeRes() as unknown as import('node:http').ServerResponse,
      'POST',
      '/api/messages',
    );
    expect(callerSendText).toHaveBeenCalledWith(
      'oc_xxx',
      '<at user_id="ou_c1fdf5baed1ffdded0a04760c10df055"></at> 三轮 review 请求',
    );
  });

  it('leaves "@<botName>" untouched when the target bot exists but has no botOpenId', async () => {
    const callerSendText = vi.fn().mockResolvedValue(undefined);
    const caller = makeBot('caller', { sendText: callerSendText });
    const noOpenId = makeBot('orphan', { sendText: vi.fn() });
    const ctx = makeCtx(new Map([['caller', caller], ['orphan', noOpenId]]));

    await handleTaskRoutes(
      ctx,
      makeReq({ botName: 'caller', chatId: 'oc_xxx', text: '@orphan hi' }),
      makeRes() as unknown as import('node:http').ServerResponse,
      'POST',
      '/api/messages',
    );
    expect(callerSendText).toHaveBeenCalledWith('oc_xxx', '@orphan hi');
  });
});
