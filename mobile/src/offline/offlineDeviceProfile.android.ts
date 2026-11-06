import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthResponse } from '../api/client';
import { API_BASE_URL } from '../api/endpoint';

export type OfflineDeviceProfile = {
  userId: string; certificateId: string | null;
  certificates: { id: string; name: string }[];
};

const key = 'kaojiang-offline-profile-v1:' + encodeURIComponent(API_BASE_URL);
const certificatePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let writes: Promise<unknown> = Promise.resolve();

export const offlineProfileFromSession = ({ user, certificates }: AuthResponse): OfflineDeviceProfile => ({
  userId: user.id, certificateId: user.certificateId || null,
  certificates: certificates.map(({ id, name }) => ({ id, name })),
});

export async function readOfflineDeviceProfile(): Promise<OfflineDeviceProfile | null> {
  await writes;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as OfflineDeviceProfile;
  if (!value || typeof value.userId !== 'string' || !value.userId ||
    (value.certificateId !== null && !certificatePattern.test(value.certificateId)) ||
    !Array.isArray(value.certificates) || value.certificates.length > 100 ||
    !value.certificates.every((c) => c && certificatePattern.test(c.id) && typeof c.name === 'string')) return null;
  return value;
}

export function saveOfflineDeviceProfile(value: OfflineDeviceProfile | null) {
  const next = writes.then(() => value ? AsyncStorage.setItem(key, JSON.stringify(value)) : AsyncStorage.removeItem(key));
  writes = next.catch(() => undefined);
  return next;
}
