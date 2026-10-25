import { ToastAndroid } from 'react-native';
import { mobileSessionSnapshot } from './client';
import { androidPointsApi } from './points.android';
import { createAndroidPointsFlow } from './androidPointsFlow.android';

export const androidPointsFlow=createAndroidPointsFlow({
  context:mobileSessionSnapshot,wallet:()=>androidPointsApi.wallet(),services:()=>androidPointsApi.services(),
  receipt:lookup=>androidPointsApi.receipt(lookup),
  notify:message=>ToastAndroid.show(message,ToastAndroid.LONG),
});
