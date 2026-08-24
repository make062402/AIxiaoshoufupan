const path = require('node:path')

const appRoot = process.env.APP_ROOT || '/opt/xiaoshoufupan/repo'
const envFile = process.env.BACKEND_ENV_FILE || '/etc/xiaoshoufupan/backend.env'
const logRoot = process.env.APP_LOG_ROOT || '/var/log/xiaoshoufupan'

module.exports = {
  apps: [
    {
      name: 'xiaoshoufupan-api',
      cwd: path.join(appRoot, 'backend'),
      script: 'src/index.ts',
      interpreter: 'node',
      node_args: ['--experimental-strip-types', `--env-file=${envFile}`],
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
      merge_logs: true,
      out_file: path.join(logRoot, 'api.out.log'),
      error_file: path.join(logRoot, 'api.error.log'),
    },
  ],
}
