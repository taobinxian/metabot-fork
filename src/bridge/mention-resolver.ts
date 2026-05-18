/**
 * Matches an `@<botName>` token preceded by a non-word character (or string start).
 *
 * Greedy match on `[A-Za-z0-9_-]+`: if two known bots have names where one is a
 * prefix of the other (e.g. `claude` and `claude-code`), `@claude-code` resolves
 * to the longer name, never the shorter one. Avoid prefix-overlapping bot names
 * if exact disambiguation matters.
 */
const MENTION_PATTERN = /(?<!\w)@([A-Za-z0-9_-]+)/g;

/**
 * Rewrites `@<botName>` tokens in a Feishu plain-text message body into
 * `<at user_id="<botOpenId>"></at>` mention tags. Unknown names and bots
 * without a known `botOpenId` are left literal.
 *
 * Safety net: if anything throws during the rewrite (e.g. a future maintainer
 * gives `lookup` side effects that can fail), the original `text` is returned
 * unchanged so callers never lose a message because of mention resolution.
 */
export function resolveBotMentions(
  text: string,
  lookup: (botName: string) => string | undefined,
): string {
  if (!text) return text;
  try {
    return text.replace(MENTION_PATTERN, (full, name: string) => {
      const userId = lookup(name);
      if (!userId) return full;
      return `<at user_id="${userId}"></at>`;
    });
  } catch {
    return text;
  }
}
