import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type RoutePlayerModule = { open: () => Promise<void> };
const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<RoutePlayerModule>('AceExamRoutePlayer')
  : null;

export function routePlayerAvailable(): boolean { return !!native; }

export async function openRoutePlayer(): Promise<void> {
  if (!native) throw new Error('请使用支持此功能的考匠安卓版');
  await native.open();
}
