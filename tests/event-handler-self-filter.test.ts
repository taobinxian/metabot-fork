import { describe, expect, it } from 'vitest';
import { isOwnMessage } from '../src/feishu/event-handler.js';

describe('isOwnMessage (self-filter)', () => {
  const botOpenId = 'ou_bot_abc';

  it('returns true when sender open_id matches botOpenId', () => {
    const event = { sender: { sender_id: { open_id: botOpenId } } };
    expect(isOwnMessage(event, botOpenId)).toBe(true);
  });

  it('returns false when sender open_id differs from botOpenId', () => {
    const event = { sender: { sender_id: { open_id: 'ou_user_xyz' } } };
    expect(isOwnMessage(event, botOpenId)).toBe(false);
  });

  it('returns false when botOpenId is undefined so absence cannot match absence', () => {
    const event = { sender: { sender_id: { open_id: 'ou_user_xyz' } } };
    expect(isOwnMessage(event, undefined)).toBe(false);
  });

  it('returns false when event has no sender (malformed payload must not crash)', () => {
    expect(isOwnMessage({}, botOpenId)).toBe(false);
  });

  it('returns false when sender_id has no open_id', () => {
    expect(isOwnMessage({ sender: { sender_id: {} } }, botOpenId)).toBe(false);
  });

  it('returns false when both botOpenId and sender open_id are missing', () => {
    expect(isOwnMessage({ sender: { sender_id: {} } }, undefined)).toBe(false);
  });
});
