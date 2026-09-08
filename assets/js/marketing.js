// Legal text stays in the document. Open its disclosure before following a hash.
function revealHash(hash) {
  let id;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  const target = document.getElementById(id);
  if (!target) return;

  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }

  requestAnimationFrame(() => {
    const header = document.querySelector('.xm-header');
    const offset = (header ? header.getBoundingClientRect().height : 0) + 20;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'auto' });
  });
}

window.addEventListener('pageshow', () => revealHash(window.location.hash));
window.addEventListener('hashchange', () => revealHash(window.location.hash));

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search && url.hash && url.hash === window.location.hash) {
    event.preventDefault();
    revealHash(url.hash);
  }
});

const year = document.querySelector('[data-xm-year]');
if (year) year.textContent = new Date().getFullYear();
