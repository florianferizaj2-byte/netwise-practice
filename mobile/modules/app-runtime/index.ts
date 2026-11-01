import { requireOptionalNativeModule } from 'expo';
export type AppRuntime = {
  installedVersion: string;
  installedBuild: string;
  sha256File(uri: string): Promise<string>;
};
export const appRuntime =
  requireOptionalNativeModule<AppRuntime>('AceExamAppRuntime');
