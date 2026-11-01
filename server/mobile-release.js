import fs from 'node:fs';

const bundled = JSON.parse(fs.readFileSync(new URL('./mobile-release.json', import.meta.url), 'utf8'));

/** A stale preserved .env must not undo the minimum version shipped in this release. */
export function resolveMobileRelease(environment, compare) {
  const configuredLatest = environment.MOBILE_LATEST_VERSION?.trim();
  const configuredMinimum = environment.MOBILE_MINIMUM_VERSION?.trim();
  const newer = (configured, floor) => configured && /^\d+\.\d+\.\d+$/.test(configured) && compare(configured, floor) >= 0 ? configured : floor;
  const minimumVersion = newer(configuredMinimum, bundled.minimumVersion);
  const latestVersion = newer(newer(configuredLatest, bundled.latestVersion), minimumVersion);
  const configuredUrl=environment.MOBILE_DOWNLOAD_URL?.trim();
  let namedVersion;
  if(configuredUrl)try{
    const pathname=decodeURIComponent(new URL(configuredUrl,'https://kaojiang.invalid').pathname);
    namedVersion=pathname.match(/(?:^|\/)kaojiang-v(\d+\.\d+\.\d+)\.apk$/i)?.[1];
  }catch{ /* An unparseable URL is never treated as a versioned artifact. */ }
  // A preserved download URL must not deliver an older APK under a newer version label.
  const staleArtifact=!!namedVersion&&namedVersion!==latestVersion;
  const currentOverride = configuredLatest === latestVersion && !staleArtifact;
  // A mirror for the same release must serve the exact published artifact too.
  const usesBundledArtifact = latestVersion === bundled.latestVersion;
  return {
    latestVersion, minimumVersion,
    ...(usesBundledArtifact ? { apkBytes: bundled.apkBytes, apkMd5: bundled.apkMd5, apkSha256: bundled.apkSha256 } : {}),
    downloadUrl: currentOverride && environment.MOBILE_DOWNLOAD_URL?.trim()
      ? environment.MOBILE_DOWNLOAD_URL.trim()
      : latestVersion === bundled.latestVersion ? bundled.downloadUrl : `/downloads/kaojiang-v${latestVersion}.apk`,
    releaseNotes: currentOverride && environment.MOBILE_RELEASE_NOTES?.trim() ? environment.MOBILE_RELEASE_NOTES.trim() : bundled.releaseNotes,
  };
}
