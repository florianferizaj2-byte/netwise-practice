export type BackendContract = { version: string; apiRevision: number; capabilities: string[] };
export const REQUIRED_BACKEND_CAPABILITIES = ['points-v1', 'account-security-v1', 'learning-gate-v1'] as const;

export function backendConnectionNotice(release: { backend?: BackendContract }): string {
  const backend = release.backend;
  if (!backend || !Number.isSafeInteger(backend.apiRevision) || backend.apiRevision < 1 ||
      !Array.isArray(backend.capabilities) || REQUIRED_BACKEND_CAPABILITIES.some(name => !backend.capabilities.includes(name)))
    return '服务端尚未完成 v1.0 升级，部分功能暂不可用。部署配套后端后请重新连接。';
  return '';
}
