import { describe, it, expect, vi } from 'vitest';
import { MessageSender } from '../src/feishu/message-sender.js';
import type { Logger } from '../src/utils/logger.js';

function silentLogger(): Logger {
  const noop = () => {};
  const fake: any = {
    info: noop,
    debug: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    trace: noop,
  };
  fake.child = () => fake;
  return fake as Logger;
}

function makeClient() {
  const create = vi.fn().mockResolvedValue({ data: { message_id: 'msg-1' } });
  const chatGet = vi
    .fn()
    .mockResolvedValue({ data: { user_count: '5', bot_count: '2' } });
  const client: any = {
    im: {
      v1: {
        message: {
          create,
          patch: vi.fn().mockResolvedValue({}),
        },
        image: { create: vi.fn().mockResolvedValue({ image_key: 'img-1' }) },
        file: { create: vi.fn().mockResolvedValue({ file_key: 'file-1' }) },
        chat: { get: chatGet },
        messageResource: { get: vi.fn() },
      },
    },
  };
  return { client, create, chatGet };
}

describe('MessageSender grouptalk envelope unwrapping', () => {
  it('strips grouptalk envelope from chatId before calling sendCard', async () => {
    const { client, create } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.sendCard('grouptalk-oc_abc-codex', '{}');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.receive_id).toBe('oc_abc');
  });

  it('passes a real chatId through unchanged when not a grouptalk envelope', async () => {
    const { client, create } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.sendCard('oc_xyz', '{}');
    expect(create.mock.calls[0][0].data.receive_id).toBe('oc_xyz');
  });

  it('strips envelope for sendText', async () => {
    const { client, create } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.sendText('grouptalk-oc_abc-codex', 'hi');
    expect(create.mock.calls[0][0].data.receive_id).toBe('oc_abc');
  });

  it('strips envelope for sendImage', async () => {
    const { client, create } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.sendImage('grouptalk-oc_abc-codex', 'img_key_1');
    expect(create.mock.calls[0][0].data.receive_id).toBe('oc_abc');
  });

  it('strips envelope for sendFile', async () => {
    const { client, create } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.sendFile('grouptalk-oc_abc-codex', 'file_key_1');
    expect(create.mock.calls[0][0].data.receive_id).toBe('oc_abc');
  });

  it('strips envelope for getChatMemberCount path.chat_id', async () => {
    const { client, chatGet } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.getChatMemberCount('grouptalk-oc_abc-codex');
    expect(chatGet).toHaveBeenCalledWith({ path: { chat_id: 'oc_abc' } });
  });

  it('handles groupIds containing dashes (greedy capture before final bot segment)', async () => {
    const { client, create } = makeClient();
    const sender = new MessageSender(client, silentLogger());
    await sender.sendCard('grouptalk-oc_a-b-c-codex', '{}');
    expect(create.mock.calls[0][0].data.receive_id).toBe('oc_a-b-c');
  });
});
