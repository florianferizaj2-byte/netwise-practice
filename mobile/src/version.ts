import packageInfo from '../package.json';

// The installed bundle, version display and update requests share one release version.
export const APP_VERSION = packageInfo.version;
export const APP_BUILD_NUMBER = '';
export const BUNDLE_VERSION = packageInfo.version;
