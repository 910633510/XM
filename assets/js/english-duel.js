// A local event contract for future first-party measurement. No network requests,
// cookies, persistent storage, identifiers, or third-party analytics are added.
(() => {
  'use strict';
  const allowedActions = new Set(['app_store', 'wechat_info']);
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const link = event.target.closest('a[data-xm-conversion]');
    if (!link || !allowedActions.has(link.dataset.xmConversion)) return;
    window.dispatchEvent(new CustomEvent('xm:conversion', {
      detail: {
        product: 'english_duel',
        action: link.dataset.xmConversion,
        placement: link.dataset.xmPlacement || 'unspecified',
        page: window.location.pathname,
      },
    }));
  });
})();
