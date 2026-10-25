import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type {LocationLearningCredentials} from '../../src/api/locationLearningTypes';

type RoutePlayerModule = { openAfterStudy: (apiBaseUrl:string,token:string,permit:string,appVersion:string) => Promise<void>; setLearningIdentity:(identity:string|null)=>Promise<void> };
const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<RoutePlayerModule>('AceExamRoutePlayer')
  : null;

export function routePlayerAvailable(): boolean { return typeof native?.openAfterStudy==='function'; }

export async function openRoutePlayer(credentials?:LocationLearningCredentials): Promise<void> {
  if (!routePlayerAvailable()) throw new Error('请使用支持专项刷题的新版本考匠安卓版');
  if (!credentials) throw new Error('请先从当前证书完成当天的专项学习后进入');
  await native!.openAfterStudy(credentials.apiBaseUrl,credentials.sessionToken,credentials.permit,credentials.appVersion);
}
export async function updateRoutePlayerIdentity(identity:string|null):Promise<void> { if(native?.setLearningIdentity)await native.setLearningIdentity(identity); }
