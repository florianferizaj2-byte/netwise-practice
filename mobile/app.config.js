// Native builds keep app.json unchanged. Web export shares the same screens at /app/.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_WEB_BASE_PATH || '' },
  web: { ...config.web, favicon: config.icon, output: 'single', bundler: 'metro' },
});
