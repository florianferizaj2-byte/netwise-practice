// Native builds keep app.json unchanged. Web export shares the same screens at /app/.
const { version } = require('./package.json');

module.exports = ({ config }) => ({
  ...config,
  version,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_WEB_BASE_PATH || '' },
  web: { ...config.web, favicon: config.icon, output: 'single', bundler: 'metro' },
});
