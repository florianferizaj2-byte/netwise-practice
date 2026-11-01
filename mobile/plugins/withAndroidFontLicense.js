const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

// Native assets include the full copyright/license alongside the bundled fonts.
module.exports = config => withDangerousMod(config, ['android', async config => {
  const source = path.join(config.modRequest.projectRoot, 'assets/fonts/OFL-NotoSansSC.txt');
  const target = path.join(config.modRequest.platformProjectRoot, 'app/src/main/assets/fonts/OFL-NotoSansSC.txt');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return config;
}]);
