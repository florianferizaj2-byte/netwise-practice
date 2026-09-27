import type { ImagePickerAsset } from 'expo-image-picker';

export async function prepareCommunityImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  if (!asset.base64) throw new Error('图片读取失败，请重新选择');
  const size = asset.fileSize ?? Math.ceil(asset.base64.length * 3 / 4);
  if (size <= 6 * 1024 * 1024 && /^image\/(jpeg|png|gif|webp)$/.test(asset.mimeType ?? '')) return asset;
  // The web picker does not apply Expo's native quality option. Resize large iPhone photos here.
  const image = new Image();
  image.src = asset.uri;
  try { await image.decode(); }
  catch { throw new Error('暂时无法读取这张照片，请选择 JPG 或 PNG 图片'); }
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('图片处理失败，请选择较小的图片');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const uri = canvas.toDataURL('image/jpeg', 0.82);
  const base64 = uri.split(',')[1];
  if (!base64) throw new Error('图片处理失败，请重新选择');
  return { ...asset, uri, base64, mimeType: 'image/jpeg', width: canvas.width, height: canvas.height, fileSize: Math.ceil(base64.length * 3 / 4) };
}
