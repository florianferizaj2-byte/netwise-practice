import packageInfo from '../package.json';
import { appRuntime } from '../modules/app-runtime';
// Android PackageManager is authoritative, not a stale JavaScript/package label.
export const BUNDLE_VERSION = packageInfo.version;
export const APP_VERSION = /^\d+\.\d+\.\d+$/.test(
  appRuntime?.installedVersion ?? '',
)
  ? appRuntime!.installedVersion
  : BUNDLE_VERSION;
export const APP_BUILD_NUMBER = appRuntime?.installedBuild ?? '';
