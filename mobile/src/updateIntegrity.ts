export type ApkIntegrity = { bytes?: number; md5?: string };

// MD5 detects corrupt/truncated downloads only. Authenticity is provided by
// HTTPS and Android's verification of the release signing certificate.
export function validateApkDownload(file: { status: number; mimeType?: string | null; size: number; md5?: string }, expected: ApkIntegrity = {}) {
  if (file.status !== 200) throw new Error(`安装包下载失败（${file.status}），请重试`);
  const mime = file.mimeType?.split(';')[0].trim().toLowerCase();
  if (mime && !['application/vnd.android.package-archive', 'application/octet-stream', 'binary/octet-stream', 'application/zip'].includes(mime))
    throw new Error('下载内容不是 Android 安装包，请检查服务器下载链接');
  if (!Number.isSafeInteger(file.size) || file.size < 1024 ||
      (expected.bytes !== undefined && file.size !== expected.bytes))
    throw new Error('安装包大小不符或下载不完整，请重新下载');
  if (expected.md5 && (!/^[a-f0-9]{32}$/i.test(expected.md5) || file.md5?.toLowerCase() !== expected.md5.toLowerCase()))
    throw new Error('安装包完整性校验未通过，请重新下载');
}
