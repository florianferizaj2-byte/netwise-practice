const { withAndroidManifest } = require('expo/config-plugins');
module.exports = function withAppPermissions(config) {
  return withAndroidManifest(config, (result) => {
    const manifest = result.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const permissions = manifest['uses-permission'] || (manifest['uses-permission'] = []);
    for (const name of ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'READ_EXTERNAL_STORAGE']) {
      const value = `android.permission.${name}`;
      let entry = permissions.find((permission) => permission.$['android:name'] === value);
      if (!entry) { entry = { $: { 'android:name': value } }; permissions.push(entry); }
      if (name === 'READ_EXTERNAL_STORAGE') { entry.$['android:maxSdkVersion'] = '32'; entry.$['tools:replace'] = 'android:maxSdkVersion'; }
    }
    return result;
  });
};
