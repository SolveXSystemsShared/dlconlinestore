/*
 * Full-page loader and page reveal for the static storefront.
 *
 * Leaving: a click on an internal link (or DLCPageLoader.go(url)) fades a solid
 * cover in over the current page before navigating, so the member never sees a
 * blank screen between pages. Arriving: the same cover is up from the first
 * paint and lists what the page is waiting for — membership, the shelf, the
 * bag — ticking each off as it lands. When the page says it is ready
 * (DLCPageLoader.done()) the cover fades and the page rises into place.
 *
 * Load after store.js, in <head>:
 *   <script src="page-loader.js" data-context="shelf"></script>
 * data-context: shelf | product | page (no data to wait for) | none (leaving only)
 */
(() => {
  const script = document.currentScript;
  const context = script?.dataset.context || 'page';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FLAG = 'dlcPageLoaderIn';
  const FLAG_TTL_MS = 10000;
  const REVEAL_MS = reduced ? 0 : 480;

  const STEPS = {
    shelf: [['gate', 'Checking you in'], ['catalog', 'Stocking the shelf'], ['cart', 'Unpacking your bag']],
    product: [['gate', 'Checking you in'], ['catalog', 'Fetching the details'], ['cart', 'Unpacking your bag']],
  };
  const LINES = { shelf: 'shelf', product: 'product', page: 'lounge', none: 'lounge' };

  let el = null;
  let stopLines = () => {};
  let finished = false;
  const steps = new Map();

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'dlc-page-loader';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="dlc-page-loader__card">
        <img class="dlc-page-loader__mascot" src="/assets/dlc-mascot-small.png" alt="" width="70" height="100" decoding="async">
        <div class="dlc-page-loader__brand">DOWN LOW CANNABIS</div>
        <p class="dlc-page-loader__line"></p>
        <div class="dlc-page-loader__bar" aria-hidden="true"><span></span></div>
        <ul class="dlc-page-loader__steps"></ul>
      </div>`;
    (document.body || root).appendChild(el);
    return el;
  }

  function paintSteps() {
    if (!el) return;
    const list = el.querySelector('.dlc-page-loader__steps');
    list.innerHTML = [...steps.entries()].map(([, step]) =>
      `<li data-state="${step.state}"><i aria-hidden="true"></i><span>${step.label}</span></li>`).join('');
    const total = steps.size;
    const settled = [...steps.values()].filter(s => s.state !== 'loading').length;
    // Never sits at zero: the bar starts a little way in so it reads as moving.
    el.querySelector('.dlc-page-loader__bar span').style.transform = `scaleX(${total ? 0.12 + 0.88 * settled / total : 0.6})`;
  }

  function setStep(key, state) {
    const step = steps.get(key);
    if (!step || step.state === state) return;
    step.state = state;
    paintSteps();
  }

  // Lines about where the member is headed, when leaving for another page.
  function linesFor(href) {
    const path = new URL(href, location.href).pathname;
    if (/product\.html$/.test(path)) return 'product';
    if (/strains\.html$/.test(path)) return 'shelf';
    if (path.startsWith('/bag')) return 'bag';
    if (path.startsWith('/account') || path.startsWith('/exchange')) return 'account';
    return 'lounge';
  }

  function show(immediate, lines = LINES[context] || 'lounge') {
    build();
    stopLines();
    const line = el.querySelector('.dlc-page-loader__line');
    if (!window.DLCLoadingLines) line.textContent = 'Loading…';
    stopLines = window.DLCLoadingLines?.rotate(line, lines) || stopLines;
    paintSteps();
    if (immediate || reduced) el.classList.add('is-in', 'no-anim');
    else requestAnimationFrame(() => el.classList.add('is-in'));
  }

  function hide() {
    if (!el) return;
    stopLines();
    const leaving = el;
    el = null;
    leaving.classList.remove('no-anim');
    leaving.classList.add('is-out');
    root.classList.add('dlc-page-reveal');
    setTimeout(() => { leaving.remove(); root.classList.remove('dlc-page-reveal'); }, REVEAL_MS + 80);
  }

  /** The page is painted: tick everything off and reveal it. */
  function done() {
    if (finished) return;
    finished = true;
    root.classList.remove('dlc-page-loading');
    steps.forEach((step, key) => { if (step.state === 'loading') setStep(key, 'done'); });
    setTimeout(hide, el ? 160 : 0);
  }

  /** Navigate with the cover up, so the next page never opens on a blank screen. */
  function go(href) {
    try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (e) {}
    if (reduced) { location.assign(href); return; }
    steps.clear();
    finished = true;
    show(false, linesFor(href));
    setTimeout(() => location.assign(href), 200);
  }

  // ── Arriving ───────────────────────────────────────────────────────────
  if (context !== 'none') {
    let arrivedByClick = false;
    try {
      const at = Number(sessionStorage.getItem(FLAG));
      arrivedByClick = at && Date.now() - at < FLAG_TTL_MS;
      sessionStorage.removeItem(FLAG);
    } catch (e) {}
    const arriving = arrivedByClick || root.classList.contains('dlc-arriving');

    (STEPS[context] || []).forEach(([key, label]) => steps.set(key, { label, state: 'loading' }));
    root.classList.add('dlc-page-loading');

    // Pages that wait on the shelf cover up from the first paint, so nothing
    // half-loaded shows. Plain pages only if the member clicked through (the
    // last page's cover is still in their eye) or they are slow to be ready.
    if (arriving || (STEPS[context] && !finished)) show(true);
    else setTimeout(() => { if (!finished) show(false); }, 250);

    const gate = window.DLCGate?.ready || Promise.resolve(null);
    const S = window.DLCStore;
    if (steps.size) {
      gate.then(member => {
        setStep('gate', 'done');
        if (!member || !S) return;
        S.catalog().then(() => setStep('catalog', 'done'), () => setStep('catalog', 'failed'));
        S.cart().then(() => setStep('cart', 'done'), () => setStep('cart', 'failed'));
      });
    } else {
      const ready = () => done();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
      else ready();
    }

    // The member gate has its own screen; it takes over from the cover.
    window.addEventListener('dlc:gate-shown', () => { finished = true; root.classList.remove('dlc-page-loading'); hide(); }, { once: true });
    // Never trap anyone behind the cover.
    setTimeout(done, 30000);
  }

  // ── Leaving ────────────────────────────────────────────────────────────
  // Registered on window so page handlers on document run first and can
  // claim a click (preventDefault) before the loader does.
  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.target && link.target !== '_self' || link.hasAttribute('download') || link.hasAttribute('data-no-loader')) return;
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    event.preventDefault();
    go(url.href);
  });

  // Back/forward can restore this page from memory with the cover still up.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    if (el) { stopLines(); el.remove(); el = null; }
    root.classList.remove('dlc-page-loading', 'dlc-page-reveal');
  });

  window.DLCPageLoader = { done, go, show: () => show(false), hide };
})();
