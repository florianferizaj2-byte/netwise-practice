// Apple mobile visitors use the same app screens as Android. The desktop link is an explicit escape.
(() => {
  const apple = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.kaojiangAppleMobile = apple;
  const query = new URLSearchParams(location.search);
  if (apple && location.hash !== '#downloads' && !query.has('desktop') && ['/', '/index.html'].includes(location.pathname)) {
    location.replace(`/app/${location.search}${location.hash}`);
  }
})();
