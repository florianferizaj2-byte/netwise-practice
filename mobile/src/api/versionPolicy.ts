const valid = (v: unknown): v is string =>
  typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
export function compareReleaseVersions(a: string, b: string) {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
export function normalizeReleasePolicy<
  T extends {
    currentVersion: string;
    latestVersion: string;
    minimumVersion: string;
    forceUpdate: boolean;
    updateAvailable: boolean;
  },
>(release: T, installed: string): T {
  if (
    !valid(installed) ||
    !valid(release.latestVersion) ||
    !valid(release.minimumVersion) ||
    compareReleaseVersions(release.minimumVersion, release.latestVersion) > 0
  )
    throw Error('服务器版本配置异常，请稍后重试');
  const updateAvailable =
    compareReleaseVersions(installed, release.latestVersion) < 0;
  return {
    ...release,
    currentVersion: installed,
    updateAvailable,
    forceUpdate:
      updateAvailable &&
      compareReleaseVersions(installed, release.minimumVersion) < 0,
  };
}
