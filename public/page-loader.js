/*
 * Page changes for the static storefront: fast first, a cover only when slow.
 *
 * Leaving: an internal link navigates straight away. The current page stays
 * on screen until the next one is ready (browsers that support cross-document
 * view transitions cross-fade the two, see styles.css), and a thin bar slides
 * across the top only if the server is slow to answer. Links are prefetched
 * when hovered or touched, so most pages are already downloaded by the click.
 *
 * Arriving: pages draw their own placeholders (skeleton cards, loading lines).
 * The full cover, listing what the page is waiting for (membership, the shelf,
 * the bag), appears only when the page is still not ready after SLOW_MS, which
 * on a normal connection is never. DLCPageLoader.done() says it is ready.
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
  const REVEAL_MS = reduced ? 0 : 480;
  // How long a page may take before the full cover goes up.
  const SLOW_MS = 1200;
  // How long the next page may take to answer before the top bar shows.
  const BAR_DELAY_MS = 150;

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

  // ── The thin bar along the top while the next page is on its way ──────
  let bar = null;
  let barTimer = 0;
  function startBar() {
    clearTimeout(barTimer);
    barTimer = setTimeout(() => {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dlc-nav-bar';
        bar.setAttribute('aria-hidden', 'true');
        (document.body || root).appendChild(bar);
      }
      requestAnimationFrame(() => bar?.classList.add('is-on'));
    }, BAR_DELAY_MS);
  }
  function stopBar() {
    clearTimeout(barTimer);
    if (bar) { bar.remove(); bar = null; }
  }

  /** Navigate now. The page stays put until the next one paints. */
  function go(href) {
    startBar();
    location.assign(href);
  }

  // ── Prefetch on intent ─────────────────────────────────────────────────
  // A hover, a touch or keyboard focus on an internal link downloads that page
  // in the background, so the click usually opens it from the cache. Pages
  // only, never the API, and each one once.
  const prefetched = new Set([location.pathname + location.search]);
  function pageUrl(link) {
    if (!link || link.target && link.target !== '_self' || link.hasAttribute('download') || link.hasAttribute('data-no-loader')) return null;
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return null;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return null;
    return url;
  }
  function prefetch(event) {
    const url = pageUrl(event.target.closest?.('a[href]'));
    if (!url) return;
    const key = url.pathname + url.search;
    if (prefetched.has(key) || navigator.connection?.saveData) return;
    prefetched.add(key);
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.href = url.href;
    document.head.appendChild(hint);
  }
  document.addEventListener('pointerover', prefetch, { passive: true });
  document.addEventListener('touchstart', prefetch, { passive: true });
  document.addEventListener('focusin', prefetch);

  // ── Arriving ───────────────────────────────────────────────────────────
  if (context !== 'none') {
    (STEPS[context] || []).forEach(([key, label]) => steps.set(key, { label, state: 'loading' }));
    root.classList.add('dlc-page-loading');

    // The page's own placeholders carry the first moments. The cover is for a
    // slow line only, where it says what is still on its way.
    setTimeout(() => { if (!finished) show(false); }, SLOW_MS);

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
    const url = pageUrl(link);
    if (!url || url.pathname === location.pathname && url.search === location.search) return;
    // The browser navigates as normal; only the bar is added for a slow answer.
    startBar();
  });

  // Back/forward can restore this page from memory with the cover still up.
  window.addEventListener('pageshow', event => {
    stopBar();
    if (!event.persisted) return;
    if (el) { stopLines(); el.remove(); el = null; }
    root.classList.remove('dlc-page-loading', 'dlc-page-reveal');
  });

  window.DLCPageLoader = { done, go, show: () => show(false), hide };
})();
