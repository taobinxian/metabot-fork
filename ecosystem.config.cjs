const path = require('path');

module.exports = {
  apps: [
    {
      name: 'metabot',
      script: 'src/index.ts',
      interpreter: path.join(__dirname, 'node_modules/.bin/tsx'),
      cwd: __dirname,

      // Watch disabled — use `metabot restart` to apply code changes manually
      watch: false,

      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      // Logs
      error_file: path.join(__dirname, 'logs', 'error.log'),
      out_file: path.join(__dirname, 'logs', 'out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Environment
      env: {
        NODE_ENV: 'production',
        CLAUDE_MAX_TURNS: '',  // unlimited turns (override any inherited shell env)
        // Bypass any inherited HTTP(S)_PROXY for Feishu / Volcengine / ByteDance
        // domains. Some local proxies (e.g. v2ray/clash on 127.0.0.1:1082) loop
        // 22x on open.feishu.cn/open-apis and break tenant_access_token fetch,
        // causing botOpenId to be null and self-filter to drop all group msgs.
        NO_PROXY: 'localhost,127.0.0.1,::1,.local,.feishu.cn,.larksuite.com,.larkoffice.com,.feishuapp.com,.volcengineapi.com,.volces.com,.bytedance.com',
      },
    },
  ],
};
