const { withAppBuildGradle } = require('expo/config-plugins');

const signingScript = 'apply from: new File(rootDir, "../plugins/release-signing.gradle")';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (androidConfig) => {
    if (androidConfig.modResults.language !== 'groovy') {
      throw new Error('Kaojiang release signing requires a Groovy app build.gradle.');
    }
    if (!androidConfig.modResults.contents.includes(signingScript)) {
      androidConfig.modResults.contents += `\n// Use the private release certificate after Expo configures build types.\n${signingScript}\n`;
    }
    return androidConfig;
  });
};
