export function isAppleMobile() {
  return typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function registerWebApp() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || !location.pathname.startsWith('/app/')) return null;
  try {
    return await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/', updateViaCache: 'none' });
  } catch {
    // Installation or private browsing storage failures must not block online study.
    return null;
  }
}

export async function refreshWebApp() {
  const registration = await registerWebApp();
  if (registration) {
    await registration.update().catch(() => undefined);
    if (registration.installing) {
      const worker = registration.installing;
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, 8000);
        function done() { clearTimeout(timer); worker.removeEventListener('statechange', changed); resolve(); }
        function changed() { if (worker.state === 'installed' || worker.state === 'redundant') done(); }
        worker.addEventListener('statechange', changed);
        changed();
      });
    }
    if (registration.waiting) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, 3000);
        function done() { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); }
        navigator.serviceWorker.addEventListener('controllerchange', done);
        registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
      });
    }
  }
  window.location.reload();
}
