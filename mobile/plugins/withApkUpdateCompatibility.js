const { withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

// Compress native libraries and ask Android to extract them at installation.
// The release remains one universal APK, with the same application ID/certificate.
function applyPackagingProperties(config) {
  config.modResults = config.modResults.filter(
    item => !(item.type === 'property' && item.key === 'expo.useLegacyPackaging'),
  );
  config.modResults.push({ type: 'property', key: 'expo.useLegacyPackaging', value: 'true' });
  return config;
}
function applyExtractionManifest(config) {
  const app = config.modResults.manifest.application?.[0];
  if (!app) throw new Error('APK compatibility requires an Android application manifest');
  app.$ ||= {};
  app.$['android:extractNativeLibs'] = 'true';
  return config;
}
module.exports = function withApkUpdateCompatibility(config) {
  return withAndroidManifest(withGradleProperties(config, applyPackagingProperties), applyExtractionManifest);
};
module.exports.applyPackagingProperties = applyPackagingProperties;
module.exports.applyExtractionManifest = applyExtractionManifest;
