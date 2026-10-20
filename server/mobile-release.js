import fs from 'node:fs';

const bundled = JSON.parse(fs.readFileSync(new URL('./mobile-release.json', import.meta.url), 'utf8'));

/** Only a newer, complete release override can replace the bundled support policy. */
export function resolveMobileRelease(environment, compare) {
  const configuredLatest = environment.MOBILE_LATEST_VERSION?.trim();
  const configuredMinimum = environment.MOBILE_MINIMUM_VERSION?.trim();
  const newer = (configured, floor) => configured && /^\d+\.\d+\.\d+$/.test(configured) && compare(configured, floor) >= 0 ? configured : floor;
  const currentOverride = !!configuredLatest && /^\d+\.\d+\.\d+$/.test(configuredLatest)
    && compare(configuredLatest, bundled.latestVersion) > 0;
  // Old .env files often pinned the previous latest as their minimum. Ignore
  // that stale pair so shipping a broader support policy actually takes effect.
  const minimumVersion = currentOverride ? newer(configuredMinimum, bundled.minimumVersion) : bundled.minimumVersion;
  const latestVersion = currentOverride ? newer(configuredLatest, minimumVersion) : bundled.latestVersion;
  return {
    latestVersion, minimumVersion,
    downloadUrl: currentOverride && environment.MOBILE_DOWNLOAD_URL?.trim()
      ? environment.MOBILE_DOWNLOAD_URL.trim()
      : latestVersion === bundled.latestVersion ? bundled.downloadUrl : `/downloads/kaojiang-v${latestVersion}.apk`,
    releaseNotes: currentOverride && environment.MOBILE_RELEASE_NOTES?.trim() ? environment.MOBILE_RELEASE_NOTES.trim() : bundled.releaseNotes,
  };
}
