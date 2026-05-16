import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAppConfig } from '../src/config.js';

let tmpDir: string;
let prevBotsConfig: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'metabot-config-groups-'));
  prevBotsConfig = process.env.BOTS_CONFIG;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (prevBotsConfig === undefined) {
    delete process.env.BOTS_CONFIG;
  } else {
    process.env.BOTS_CONFIG = prevBotsConfig;
  }
});

function writeConfig(payload: unknown): string {
  const p = join(tmpDir, 'bots.json');
  writeFileSync(p, JSON.stringify(payload), 'utf8');
  return p;
}

const feishuBot = (name: string) => ({
  name,
  feishuAppId: `app-${name}`,
  feishuAppSecret: `sec-${name}`,
  defaultWorkingDirectory: '/tmp',
});

describe('loadAppConfig + groups', () => {
  it('distributes top-level groups onto each feishu bot in its members list', () => {
    process.env.BOTS_CONFIG = writeConfig({
      feishuBots: [feishuBot('claude-code'), feishuBot('codex')],
      groups: [
        { id: 'oc_shared', members: ['claude-code', 'codex'] },
      ],
    });
    const cfg = loadAppConfig();
    expect(cfg.feishuBots[0].groupMemberships).toEqual([
      { groupId: 'oc_shared', members: ['claude-code', 'codex'] },
    ]);
    expect(cfg.feishuBots[1].groupMemberships).toEqual([
      { groupId: 'oc_shared', members: ['claude-code', 'codex'] },
    ]);
  });

  it('leaves groupMemberships undefined for bots not listed in any group', () => {
    process.env.BOTS_CONFIG = writeConfig({
      feishuBots: [feishuBot('claude-code'), feishuBot('lonely-bot')],
      groups: [{ id: 'oc_x', members: ['claude-code'] }],
    });
    const cfg = loadAppConfig();
    expect(cfg.feishuBots[0].groupMemberships).toHaveLength(1);
    expect(cfg.feishuBots[1].groupMemberships).toBeUndefined();
  });

  it('is a no-op when bots.json has no groups block', () => {
    process.env.BOTS_CONFIG = writeConfig({
      feishuBots: [feishuBot('claude-code')],
    });
    const cfg = loadAppConfig();
    expect(cfg.feishuBots[0].groupMemberships).toBeUndefined();
  });
});
