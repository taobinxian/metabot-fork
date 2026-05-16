import { describe, expect, it } from 'vitest';
import { createRelayGuard } from '../src/bridge/relay-guard.js';

describe('relay-guard', () => {
  it('acquires a free chat on the first attempt', () => {
    const guard = createRelayGuard();
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
  });

  it('blocks a second concurrent acquire on the same chat as busy', () => {
    const guard = createRelayGuard();
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: false, reason: 'busy' });
  });

  it('allows re-acquire after release', () => {
    const guard = createRelayGuard();
    guard.tryAcquire('chat-A');
    guard.release('chat-A');
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
  });

  it('isolates chats from each other', () => {
    const guard = createRelayGuard();
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
    expect(guard.tryAcquire('chat-B')).toEqual({ ok: true });
  });

  it('enters cooldown after maxInWindow acquires within the rolling window', () => {
    let nowMs = 1_000_000;
    const guard = createRelayGuard({
      windowMs: 60_000,
      maxInWindow: 3,
      cooldownMs: 30_000,
      now: () => nowMs,
    });

    for (let i = 0; i < 3; i++) {
      expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
      guard.release('chat-A');
      nowMs += 1_000;
    }

    expect(guard.tryAcquire('chat-A')).toEqual({ ok: false, reason: 'cooldown' });
  });

  it('exits cooldown once cooldownMs has elapsed', () => {
    let nowMs = 1_000_000;
    const guard = createRelayGuard({
      windowMs: 60_000,
      maxInWindow: 2,
      cooldownMs: 30_000,
      now: () => nowMs,
    });

    guard.tryAcquire('chat-A'); guard.release('chat-A');
    nowMs += 1_000;
    guard.tryAcquire('chat-A'); guard.release('chat-A');
    nowMs += 1_000;
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: false, reason: 'cooldown' });

    nowMs += 30_001;
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
  });

  it('drops trigger records that fall outside the rolling window', () => {
    let nowMs = 1_000_000;
    const guard = createRelayGuard({
      windowMs: 10_000,
      maxInWindow: 2,
      cooldownMs: 30_000,
      now: () => nowMs,
    });

    guard.tryAcquire('chat-A'); guard.release('chat-A');
    nowMs += 1_000;
    guard.tryAcquire('chat-A'); guard.release('chat-A');

    nowMs += 11_000;
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
  });

  it('release on a chat that was never acquired is a no-op (not an error)', () => {
    const guard = createRelayGuard();
    expect(() => guard.release('chat-unknown')).not.toThrow();
  });

  it('reset clears both busy state and trigger history', () => {
    let nowMs = 1_000_000;
    const guard = createRelayGuard({
      windowMs: 60_000,
      maxInWindow: 2,
      cooldownMs: 30_000,
      now: () => nowMs,
    });
    guard.tryAcquire('chat-A'); guard.release('chat-A');
    nowMs += 1_000;
    guard.tryAcquire('chat-A'); guard.release('chat-A');
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: false, reason: 'cooldown' });

    guard.reset('chat-A');
    expect(guard.tryAcquire('chat-A')).toEqual({ ok: true });
  });
});
