import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../api/client';
import { fetchJson } from '../api/transport';
import { AnnouncementClient } from './client';

export const publicAnnouncements = new AnnouncementClient(AsyncStorage, () => fetchJson<unknown>(
  `${API_BASE_URL}/mobile/announcement?_=${Date.now()}`,
  { headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store' },
  8_000,
));
