/**
 * Per-chat single-flight lock + sliding-window trigger counter.
 *
 * Purpose: in shared groups where multiple bots reply via @mention handoff,
 * an unattended LLM-driven mention loop could ping-pong forever or fan out
 * concurrent replies. The guard enforces two invariants per chatId:
 *
 *   1. **Single-flight**: at any moment, only one acquired holder for a chat.
 *      Callers wrap their async work with `tryAcquire` + `release` (in finally).
 *   2. **Rate ceiling**: more than `maxInWindow` acquires within `windowMs`
 *      forces a `cooldownMs` pause. Triggers timestamped outside the window
 *      are dropped, so steady traffic well below the ceiling never trips.
 *
 * The clock is injectable so window/cooldown behavior is deterministic in
 * tests. State is in-process only — restarts reset everything, which is the
 * desired behavior for a transient safety valve.
 */

export type AcquireResult = { ok: true } | { ok: false; reason: 'busy' | 'cooldown' };

export interface RelayGuardConfig {
  windowMs?: number;
  maxInWindow?: number;
  cooldownMs?: number;
  now?: () => number;
}

export interface RelayGuard {
  tryAcquire(chatId: string): AcquireResult;
  release(chatId: string): void;
  reset(chatId: string): void;
}

interface ChatState {
  busy: boolean;
  triggers: number[];
  cooldownUntil: number | null;
}

export function createRelayGuard(config: RelayGuardConfig = {}): RelayGuard {
  const windowMs = config.windowMs ?? 60_000;
  const maxInWindow = config.maxInWindow ?? 6;
  const cooldownMs = config.cooldownMs ?? 30_000;
  const now = config.now ?? (() => Date.now());

  const states = new Map<string, ChatState>();

  function getState(chatId: string): ChatState {
    let state = states.get(chatId);
    if (!state) {
      state = { busy: false, triggers: [], cooldownUntil: null };
      states.set(chatId, state);
    }
    return state;
  }

  function pruneTriggers(state: ChatState, t: number): void {
    const cutoff = t - windowMs;
    while (state.triggers.length > 0 && state.triggers[0] <= cutoff) {
      state.triggers.shift();
    }
  }

  return {
    tryAcquire(chatId: string): AcquireResult {
      const state = getState(chatId);
      const t = now();

      if (state.cooldownUntil !== null) {
        if (t < state.cooldownUntil) {
          return { ok: false, reason: 'cooldown' };
        }
        state.cooldownUntil = null;
        state.triggers = [];
      }

      if (state.busy) {
        return { ok: false, reason: 'busy' };
      }

      pruneTriggers(state, t);

      if (state.triggers.length >= maxInWindow) {
        state.cooldownUntil = t + cooldownMs;
        return { ok: false, reason: 'cooldown' };
      }

      state.busy = true;
      state.triggers.push(t);
      return { ok: true };
    },

    release(chatId: string): void {
      const state = states.get(chatId);
      if (!state) return;
      state.busy = false;
    },

    reset(chatId: string): void {
      states.delete(chatId);
    },
  };
}
