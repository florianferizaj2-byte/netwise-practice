import type { ImagePickerAsset } from 'expo-image-picker';
export async function prepareAvatarImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const image = new Image();
  image.src = asset.uri;
  try { await image.decode(); } catch { throw new Error('无法读取这张照片，请选择 JPG 或 PNG 图片'); }
  const edge = Math.min(image.naturalWidth, image.naturalHeight);
  if (!edge) throw new Error('照片尺寸无效，请重新选择');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(640, edge);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('图片处理失败，请重新选择');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, canvas.width, canvas.height);
  const uri = canvas.toDataURL('image/jpeg', 0.82);
  const base64 = uri.split(',')[1];
  return { ...asset, uri, base64, mimeType: 'image/jpeg', width: canvas.width, height: canvas.height, fileSize: Math.ceil(base64.length * 3 / 4) };
}
