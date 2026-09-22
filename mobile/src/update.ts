import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export type UpdateProgressCallback = (progress: number | null) => void;

/**
 * Downloads the release APK into the app cache and hands it to Android's
 * package installer. Android still asks the user to confirm the installation.
 */
export async function downloadAndInstallUpdate(
  downloadUrl: string,
  version: string,
  onProgress: UpdateProgressCallback,
  onInstallStarted?: () => void,
) {
  if (Platform.OS !== 'android') {
    throw new Error('应用内安装 APK 仅支持 Android');
  }

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('暂时无法访问 App 缓存目录');
  }

  const safeVersion = version.replace(/[^0-9A-Za-z._-]/g, '-');
  const fileUri = `${cacheDirectory}kaojiang-${safeVersion}.apk`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true });

  const download = FileSystem.createDownloadResumable(
    downloadUrl,
    fileUri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite <= 0) {
        onProgress(null);
        return;
      }

      onProgress(
        Math.min(100, Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)),
      );
    },
  );
  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('新版 APK 下载未完成');
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  onInstallStarted?.();
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME_TYPE,
  });
}
