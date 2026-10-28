export const MOBILE_BACKEND_VERSION = '1.0.7';
export const MOBILE_API_REVISION = 1;

// A capability means its actual protocol routes are mounted, not that an AI
// provider, membership balance or a third-party payment has been configured.
const protocols = {
  'voice-packs-v1': ['GET /api/voice-packs', 'GET /api/voice-packs/:id/manifest', 'GET /voice-packs/assets/:id'],
  'points-v1': ['GET /api/account/points/wallet', 'GET /api/account/points/services', 'GET /api/account/points/operations', 'GET /api/account/points/receipt'],
  'account-security-v1': ['GET /api/auth/security-config', 'GET /api/auth/security', 'POST /api/auth/change-password'],
  'learning-gate-v1': ['GET /api/location-learning', 'POST /api/location-learning/start', 'POST /api/location-learning/permit', 'POST /api/location-learning/consume'],
};

export function mobileBackendContract(app) {
  const routes = new Set(app.router.stack.filter(layer => layer.route).flatMap(layer =>
    Object.entries(layer.route.methods).filter(([, enabled]) => enabled).map(([method]) => `${method.toUpperCase()} ${layer.route.path}`)));
  return { version: MOBILE_BACKEND_VERSION, apiRevision: MOBILE_API_REVISION,
    capabilities: Object.entries(protocols).filter(([, required]) => required.every(route => routes.has(route))).map(([name]) => name) };
}
