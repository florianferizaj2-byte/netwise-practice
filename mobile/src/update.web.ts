import { refreshWebApp } from './platform/webApp';
export type UpdateProgressCallback = (progress: number | null) => void;

// A web app updates its own shell; never offer an APK to an iPhone.
export async function downloadAndInstallUpdate(
  _downloadUrl: string, _version: string, onProgress: UpdateProgressCallback, onInstallStarted?: () => void,
) {
  onProgress(null);
  onInstallStarted?.();
  await refreshWebApp();
}
