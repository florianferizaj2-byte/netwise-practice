import { useAndroidFocusMode, useAndroidFocusModeState } from "../navigation/AndroidFocusMode.android";
export function useAiLearningFocus(focused:boolean) { useAndroidFocusMode(focused); }
export const useLearningFocusState = useAndroidFocusModeState;
