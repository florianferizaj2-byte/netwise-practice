import fs from 'node:fs';

const bundled = JSON.parse(fs.readFileSync(new URL('./mobile-release.json', import.meta.url), 'utf8'));

/** A stale preserved .env must not undo the minimum version shipped in this release. */
export function resolveMobileRelease(environment, compare) {
  const configuredLatest = environment.MOBILE_LATEST_VERSION?.trim();
  const configuredMinimum = environment.MOBILE_MINIMUM_VERSION?.trim();
  const newer = (configured, floor) => configured && /^\d+\.\d+\.\d+$/.test(configured) && compare(configured, floor) >= 0 ? configured : floor;
  const minimumVersion = newer(configuredMinimum, bundled.minimumVersion);
  const latestVersion = newer(newer(configuredLatest, bundled.latestVersion), minimumVersion);
  const currentOverride = configuredLatest === latestVersion;
  return {
    latestVersion, minimumVersion,
    downloadUrl: currentOverride && environment.MOBILE_DOWNLOAD_URL?.trim()
      ? environment.MOBILE_DOWNLOAD_URL.trim()
      : latestVersion === bundled.latestVersion ? bundled.downloadUrl : `/downloads/kaojiang-v${latestVersion}.apk`,
    releaseNotes: currentOverride && environment.MOBILE_RELEASE_NOTES?.trim() ? environment.MOBILE_RELEASE_NOTES.trim() : bundled.releaseNotes,
  };
}
