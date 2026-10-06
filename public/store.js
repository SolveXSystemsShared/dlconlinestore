/*
 * The storefront's line into the DLC Online Store API.
 *
 * Every number a customer sees — name, price, what is left — comes from
 * /api/catalog (live CDASH inventory for the fulfilment store), and the bag is
 * the member's saved one at /api/cart, the same one checkout reads. Nothing
 * here decides a price or a quantity; the server does, this only displays it.
 *
 * Loaded after age-gate.js: every call waits on DLCGate.ready, because the API
 * refuses anyone who has not passed the member gate.
 */
(() => {
  const gateReady = window.DLCGate ? window.DLCGate.ready : Promise.resolve(null);

  // CDASH grades, folded onto the site's five cultivation tiers.
  const TIERS = [
    { slug: 'outdoor', label: 'Outdoor', grades: ['outdoor'] },
    { slug: 'greenhouse', label: 'Greenhouse', grades: ['greenhouse'] },
    { slug: 'executive-greenhouse', label: 'Executive Greenhouse', grades: ['executive greenhouse', 'exec greenhouse'] },
    { slug: 'indoor', label: 'Indoor', grades: ['indoor'] },
    { slug: 'hydro', label: 'Hydro', grades: ['hydroponic', 'hydro'] },
  ];

  const slugify = value => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fold = value => String(value || '').trim().toLowerCase();

  function tierForGrade(grade) {
    const g = fold(grade);
    return TIERS.find(tier => tier.grades.includes(g))?.slug || null;
  }

  /**
   * Where a product sits on the site: flower and prerolls by cultivation tier,
   * wellness as one shelf, and everything else (edibles, vapes, concentrates…)
   * under "more", one shelf per CDASH product type.
   */
  function classify(product) {
    const type = fold(product.productType);
    const tier = tierForGrade(product.grade);
    if (/flower|bud/.test(type) && tier) return { category: 'flower', tier };
    if (/^pre-?rolls?$/.test(type) && tier) return { category: 'prerolls', tier };
    if (/wellness/.test(type)) return { category: 'wellness', tier: 'wellness' };
    return { category: 'more', tier: slugify(product.productType) };
  }

  const PREROLL_ART = {
    'blue-dream': 'assets/webp/prerolls/blue-dream.webp',
    'lemon-cherry-gelato': 'assets/webp/prerolls/lemon-cherry-gelato.webp',
    'midnight-kush': 'assets/webp/prerolls/midnight-kush.webp',
    'purple-haze': 'assets/webp/prerolls/purple-haze.webp',
  };

  // The brochure shots, matched on the product name ("ECS 3.5", "Pain Relax").
  const WELLNESS_ART = [
    [/^ecs?-?3-5/, 'assets/webp/wellness/ec-3-5.webp'],
    [/^ecs?-?7-5/, 'assets/webp/wellness/ec-7-5.webp'],
    [/^ecs?-?30($|-)/, 'assets/webp/wellness/ec-30.webp'],
    [/neuro-?2600/, 'assets/webp/wellness/neuro-2600mg.webp'],
    [/neuro/, 'assets/webp/wellness/neuro-plus.webp'],
    [/pain-relax/, 'assets/webp/wellness/pain-relax.webp'],
    [/happy-pet/, 'assets/webp/wellness/happy-pet.webp'],
    [/balance/, 'assets/webp/wellness/natural-balance.webp'],
  ];

  // Pack shots for individual products, keyed by the CDASH-synced product slug.
  // The file is named after the slug: assets/webp/products/<slug>.webp.
  // Keep in step with PRODUCT_ART in lib/storefront.ts.
  const PRODUCT_ART = new Set([
    'accessories-lifted-vape-battery-lifted-battery',
    'accessories-raw-drawstring-bag-black-raw',
    'accessories-raw-drawstring-bag-tan-raw',
    'accessories-raw-tray-key-chain-raw',
    'accessories-raw-wooden-pokers-raw',
    'edibles-astroman-raspberry-gummy',
    'edibles-blaze-blocks',
    'edibles-buzz-pops-dlc',
    'edibles-caramel',
    'edibles-chocolate-chip-cookie',
    'edibles-chocolate-chip-cookies',
    'edibles-death-by-chocolate-cups',
    'edibles-fruity-pastilles',
    'edibles-fudge-bloom-bakery',
    'edibles-gummies-peach-watermelon-lucky-club',
    'edibles-gummy-bear-indica-dlc',
    'edibles-heart-stopper-gummies',
    'edibles-lifted-love-bites-150mg',
    'edibles-lifted-rainbow-stripz',
    'edibles-lifted-wacky-worms',
    'edibles-loaded-leaf-gummies',
    'edibles-mango-lollipop',
    'edibles-nano-infused-gummies-nugg-nano',
    'edibles-nougat-jane-s',
    'edibles-red-vine-stripz',
    'edibles-share-square-gummies',
    'edibles-stoned-pineapple-stoned-edibles',
    'edibles-strawberry-donut-jellies',
    'edibles-sugar-coated-gummies',
    'edibles-tangerine-gummies-gobbles',
    'edibles-tropical-sour-cubes',
    'rolling-papers-black-classic-kingsize-3-cones-raw',
    'rolling-papers-black-raw-classic-1-1-4-size-6-cones-raw',
    'rolling-papers-black-raw-classic-connoisseur-king-size-slim-tips-raw',
    'rolling-papers-culture-paper-culture',
    'rolling-papers-mary-jane-cones-mary-jane',
    'rolling-papers-ocb-platinum-slim-ocb',
    'rolling-papers-raw-classic-connoisseur-1-1-4-tips-raw',
    'rolling-papers-raw-ethereal-raw',
    'vapes-blood-orange-jackpot',
    'vapes-chocolope-nugg',
    'vapes-super-lemon-haze-lifted',
    'wellness-cbd-colorado-snow-cannabinoid-nutrition',
    'wellness-cbd-ecs-7-5-cannabinoid-nutrition',
    'wellness-cbd-ecs-900-cannabinoid-nutrition',
    'wellness-cbd-happy-pet-cannabinoid-nutrition',
    'wellness-cbd-pain-relax-cannabinoid-nutrition',
  ]);

  // Bumped when artwork was swapped while browsers still kept images for a
  // week, so those stored copies are skipped. Keep in step with ART_VERSION in
  // lib/storefront.ts and script.js.
  const ART_VERSION = '2026-10-05';

  function artFor(product) {
    if (PRODUCT_ART.has(product.slug)) return `assets/webp/products/${product.slug}.webp`;
    if (/moonstick/.test(fold(product.productType)) && /indoor/.test(fold(product.grade))) return 'assets/webp/moonsticks/indoor.webp';
    const { category, tier } = classify(product);
    const key = slugify(product.name);
    if (category === 'flower') return `assets/webp/flower/${tier}.webp`;
    if (category === 'prerolls') return PREROLL_ART[key] || `assets/webp/preroll-tiers/${tier}.webp`;
    if (category === 'wellness') return WELLNESS_ART.find(([pattern]) => pattern.test(key))?.[1] || null;
    return null;
  }

  /** A real product photo when CDASH has one, else our pack shot, else the closest DLC artwork, else null. */
  function imageFor(product) {
    if (product.imageUrl) return product.imageUrl;
    const art = artFor(product);
    return art ? `${art}?v=${ART_VERSION}` : null;
  }

  // DLC amounts are credits, never currency. Keep in step with credits() in lib/format.ts.
  // A no-break space, so "C 79.99" never splits across two lines.
  const price = value => `C\u00a0${Number(value || 0).toFixed(2)}`;

  function productUrl(product) {
    const { category, tier } = classify(product);
    return `product.html?category=${encodeURIComponent(category)}&tier=${encodeURIComponent(tier)}&id=${encodeURIComponent(product.id)}`;
  }

  function collectionUrl(category, tier) {
    if (category === 'wellness') return 'strains.html?category=wellness&tier=wellness';
    return `strains.html?category=${encodeURIComponent(category)}${tier ? `&tier=${encodeURIComponent(tier)}` : ''}`;
  }

  // ── Loading bar ────────────────────────────────────────────────────────
  // A thin light-blue bar at the top of the page while any request is in
  // flight, so a slow connection always shows that something is happening.
  // Shown after a short delay so fast requests never flash it.
  let pending = 0;
  let bar = null;
  let barTimer = null;
  function barStart() {
    pending++;
    if (pending > 1 || barTimer) return;
    barTimer = setTimeout(() => {
      barTimer = null;
      if (!pending) return;
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dlc-loadbar';
        bar.setAttribute('aria-hidden', 'true');
        bar.innerHTML = '<span></span>';
        document.body.appendChild(bar);
      }
      bar.classList.remove('is-done');
      // Checked again inside the frame: a frame can arrive late on a busy
      // device, after the request already finished.
      requestAnimationFrame(() => { if (pending) bar.classList.add('is-active'); });
    }, 150);
  }
  function barEnd() {
    pending = Math.max(0, pending - 1);
    if (pending) return;
    clearTimeout(barTimer);
    barTimer = null;
    if (!bar) return;
    bar.classList.add('is-done');
    setTimeout(() => { if (!pending) bar?.classList.remove('is-active', 'is-done'); }, 400);
  }

  // The silent sign-in check for a returning member is the first wait on a
  // slow connection; show the bar for it too, until the member is in or the
  // gate appears (the gate has its own progress indicator).
  if (window.DLCGate?.silent) {
    const whenBody = fn => document.body ? fn() : document.addEventListener('DOMContentLoaded', fn, { once: true });
    whenBody(() => {
      barStart();
      let ended = false;
      const end = () => { if (!ended) { ended = true; barEnd(); } };
      gateReady.then(end);
      window.addEventListener('dlc:gate-shown', end, { once: true });
    });
  }

  const SLOW_AFTER_MS = 4000;
  const TIMEOUT_MS = 20000;

  /**
   * One request to the store API. Reads time out rather than hang, and are
   * retried once — a dropped packet on a weak signal should not cost the
   * member a blank page. Writes are never retried automatically. Anything
   * still waiting after a few seconds fires `dlc:slow` so the page can say so.
   */
  async function api(path, options = {}) {
    await gateReady;
    const isRead = !options.method || options.method === 'GET';
    barStart();
    const slowTimer = setTimeout(() => window.dispatchEvent(new CustomEvent('dlc:slow', { detail: { path } })), SLOW_AFTER_MS);
    try {
      for (let attempt = 0; ; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await fetch(path, { credentials: 'same-origin', ...options, signal: controller.signal });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw Object.assign(new Error(data.error || 'The store could not be reached'), { status: response.status });
          return data;
        } catch (error) {
          const network = !error.status;
          if (isRead && network && attempt === 0) continue;
          if (network) throw new Error(navigator.onLine === false ? 'You appear to be offline. Check your connection and try again' : 'Your connection is too slow to reach the store right now. Please try again');
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      clearTimeout(slowTimer);
      barEnd();
    }
  }

  // ── Catalogue, cached for this tab ─────────────────────────────────────
  // Every page needs the catalogue, and on a slow connection downloading it
  // again on each click is most of the wait. A copy is kept in session
  // storage (this tab only, cleared when it closes — see cookies.html): used
  // as-is for two minutes, and after that only as a fallback if the network
  // fails. Stock is always re-checked by the server when the bag changes.
  const CATALOG_KEY = 'dlc_catalog_cache_v1';
  const CATALOG_FRESH_MS = 2 * 60 * 1000;
  const CATALOG_FALLBACK_MS = 30 * 60 * 1000;
  function readCatalogCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CATALOG_KEY) || 'null');
      return cached && Array.isArray(cached.products) ? cached : null;
    } catch (e) { return null; }
  }

  let catalogPromise = null;
  function catalog() {
    if (!catalogPromise) {
      const cached = readCatalogCache();
      if (cached && Date.now() - cached.at < CATALOG_FRESH_MS) {
        catalogPromise = gateReady.then(() => cached.products);
      } else {
        catalogPromise = api('/api/catalog')
          .then(data => {
            const products = data.products || [];
            try { sessionStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), products })); } catch (e) {}
            return products;
          })
          .catch(error => {
            if (cached && Date.now() - cached.at < CATALOG_FALLBACK_MS) return cached.products;
            throw error;
          });
        catalogPromise.catch(() => { catalogPromise = null; });
      }
    }
    return catalogPromise;
  }

  /**
   * True only when the lounge video would do more harm than good: Data Saver
   * on, or a 2G-class connection. 3G still gets the video — it streams in
   * behind the poster, and the scroll-scrubbed lounge is the site's centrepiece.
   */
  function slowConnection() {
    const c = navigator.connection;
    return !!c && (c.saveData || ['slow-2g', '2g'].includes(c.effectiveType));
  }

  let lines = [];
  let cartPromise = null;
  const announceCart = () => window.dispatchEvent(new CustomEvent('dlc:cart', { detail: { lines, count: cartCount() } }));
  const cartCount = () => lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  function cart() {
    if (!cartPromise) {
      cartPromise = api('/api/cart').then(data => { lines = data.lines || []; announceCart(); return lines; });
      cartPromise.catch(() => { cartPromise = null; });
    }
    return cartPromise;
  }

  /** Absolute, like the API: the server caps it at what the shelf holds. */
  async function setQuantity(productId, quantity) {
    const data = await api('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, quantity }) });
    lines = data.lines || [];
    cartPromise = Promise.resolve(lines);
    announceCart();
    return lines;
  }

  async function addToCart(productId, quantity) {
    await cart().catch(() => []);
    const current = lines.find(line => line.id === productId)?.quantity || 0;
    return setQuantity(productId, current + quantity);
  }

  const inCart = productId => lines.find(line => line.id === productId)?.quantity || 0;

  // The bag pill in the header follows the member's saved bag on every page.
  let lastCount = null;
  window.addEventListener('dlc:cart', event => {
    const count = event.detail.count;
    document.querySelectorAll('[data-bag-count]').forEach(el => {
      el.textContent = count > 99 ? '99+' : String(count);
      el.hidden = count === 0;
    });
    document.querySelectorAll('[data-bag-link]').forEach(link => {
      link.setAttribute('aria-label', `Your bag, ${count} ${count === 1 ? 'item' : 'items'}`);
      if (lastCount !== null && count > lastCount) {
        link.classList.remove('is-bumped');
        void link.offsetWidth;
        link.classList.add('is-bumped');
      }
    });
    lastCount = count;
  });
  // As soon as the member is confirmed, start the catalogue and bag downloads
  // — on a slow line every page needs them, so waiting to be asked wastes time.
  gateReady.then(member => { if (member) { cart().catch(() => {}); catalog().catch(() => {}); } });

  window.DLCStore = {
    TIERS, classify, tierForGrade, imageFor, price, productUrl, collectionUrl, slugify,
    catalog, cart, setQuantity, addToCart, inCart, slowConnection, api,
  };
})();
