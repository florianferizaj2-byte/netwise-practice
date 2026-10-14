import { Linking, PermissionsAndroid, Platform } from 'react-native';

export async function requestPhotoAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Number(Platform.Version);
  const permissions = api >= 33
    ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, ...(api >= 34 ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED] : [])]
    : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
  if ((await Promise.all(permissions.map((permission) => PermissionsAndroid.check(permission)))).some(Boolean)) return true;
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.some((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
}

export function openPermissionSettings() { return Linking.openSettings(); }
