const path = require('node:path');

const appRoot = process.env.PM2_CWD || path.resolve(__dirname, '../..');

module.exports = {
  apps: [
    {
      name: 'mca-bot',
      script: 'src/index.js',
      cwd: appRoot,
      interpreter: process.execPath,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
