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

  // Infused products (dabsticks) carry their grade as free text: "Executive
  // Greenhouse Dab Infused", "Indoor Dab Infused Preroll". The grade leads and
  // the name is the fallback (grade "Dab Stick", name "Greenhouse Dab Infused
  // Moonstick"). Longest names first, so Executive Greenhouse never reads as
  // plain Greenhouse.
  const TIER_WORDS = TIERS.flatMap(tier => tier.grades.map(word => [word, tier.slug])).sort((a, b) => b[0].length - a[0].length);
  function infusedTier(product) {
    for (const text of [product.grade, product.name]) {
      const t = fold(text);
      const hit = TIER_WORDS.find(([word]) => new RegExp(`(^|[^a-z])${word}($|[^a-z])`).test(t));
      if (hit) return hit[1];
    }
    return null;
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
    'drinks-coke-soft-drinks',
    'drinks-fanta-soft-drinks',
    'drinks-redbull-original-energy-drinks',
    'drinks-sprite-soft-drinks',
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
    'vapes-amnesia-mountain-awaken-duo-2ml',
    'vapes-blood-orange-jackpot',
    'vapes-chocolope-nugg',
    'vapes-fuji-sugar-awaken-duo-2ml',
    'vapes-sour-slapper-awaken-duo-2ml',
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
    if (/moonstick|dabstick/.test(fold(product.productType))) return 'assets/webp/moonsticks/indoor.webp';
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

  /** `grade` narrows an infused shelf (dabsticks) to one cultivation tier. */
  function collectionUrl(category, tier, grade) {
    if (category === 'wellness') return 'strains.html?category=wellness&tier=wellness';
    return `strains.html?category=${encodeURIComponent(category)}${tier ? `&tier=${encodeURIComponent(tier)}` : ''}${grade ? `&grade=${encodeURIComponent(grade)}` : ''}`;
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
          // A membership stopped in CDASH: the server has already cleared the
          // cookie, so reloading puts the gate up and it explains why.
          if (data.code === 'membership_inactive') location.reload();
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
  // Every product type outside flower, prerolls and wellness, as its own
  // collection, in the lounge row's order. Shared by the header's Browse menu
  // and the shelf's collections bar so they always list the same shelves.
  const MORE_ORDER = ['concentrates', 'shooters', 'moonsticks', 'dabsticks', 'edibles', 'drinks', 'vapes', 'rolling-papers', 'accessories', 'dab-hits'];
  function moreShelves(products) {
    const types = new Map();
    products.forEach(p => {
      const place = classify(p);
      if (place.category !== 'more') return;
      const entry = types.get(place.tier) || { slug: place.tier, label: p.productType, count: 0 };
      entry.count++;
      types.set(place.tier, entry);
    });
    const rank = slug => { const i = MORE_ORDER.indexOf(slug); return i === -1 ? MORE_ORDER.length : i; };
    return [...types.values()].sort((a, b) => rank(a.slug) - rank(b.slug) || a.label.localeCompare(b.label));
  }

  // ── In-store specials ──────────────────────────────────────────────────
  // Run by the till, not the bag (see lib/specials.ts): shown on the shelf so a
  // member knows what to ask for, never added to a bag from here.
  let specialsPromise = null;
  function specials() {
    if (!specialsPromise) {
      specialsPromise = api('/api/specials').then(data => data.specials || []);
      specialsPromise.catch(() => { specialsPromise = null; });
    }
    return specialsPromise;
  }

  /** Where one line of a special sits on the site, read the way a product is. */
  function lineShelf(line) {
    const type = fold(line.productType);
    // Same rule as shelfType in lib/catalog.ts: dab-infused moonsticks are dabsticks.
    const dab = /moonstick/.test(type) && /\bdab/.test(fold(`${line.grade || ''} ${line.name || ''}`));
    const place = classify({ productType: dab ? 'Dabsticks' : line.productType, grade: line.grade });
    // A flower or preroll line with no grade means any tier of it.
    if (place.category === 'more' && /flower|bud/.test(type)) return { category: 'flower', tier: null };
    if (place.category === 'more' && /^pre-?rolls?$/.test(type)) return { category: 'prerolls', tier: null };
    if (dab) return { ...place, grade: infusedTier(line) };
    return place;
  }

  /** The specials with at least one line on this shelf. No category: all of them. */
  function specialsOn(list, category, tier, grade) {
    if (!category || category === 'all') return list;
    return list.filter(sp => sp.lines.some(line => {
      const place = lineShelf(line);
      if (place.category !== category) return false;
      if (tier && place.tier && place.tier !== tier) return false;
      return !grade || !place.grade || place.grade === grade;
    }));
  }

  // A bundle listing every flavour of one product type means "pick one", the
  // same reading the Specials page gives it.
  const isChoice = sp => sp.lines.length > 1 && sp.lines.every(l => l.name && l.productType === sp.lines[0].productType && l.quantity === 1);

  /** What a special holds, in one plain line: "1× Outdoor preroll + 1× any drink". */
  function specialItems(sp) {
    if (isChoice(sp)) return `Pick one: ${sp.lines.map(l => l.name).join(', ')}`;
    return sp.lines.map(l => {
      const type = l.productType.replace(/^pre-?rolls?$/i, 'preroll').replace(/s$/i, '').toLowerCase();
      return `${l.quantity}× ${l.name || `${l.grade ? `${l.grade} ` : 'any '}${type}`}`;
    }).join(' + ');
  }

  /** The picture for one line: its own pack shot, else the closest shelf artwork. */
  function lineImage(line, products) {
    const place = lineShelf(line);
    // "Any outdoor preroll" is the tier, not one strain: the tier artwork says that.
    // The preroll tier shots are cropped tight for bundles (assets/webp/bundle):
    // the shelf versions sit on a tall canvas and would look tiny beside a pack shot.
    if (!line.name && place.category === 'prerolls' && place.tier) return `assets/webp/bundle/preroll-${place.tier}.webp?v=${ART_VERSION}`;
    if (!line.name && place.category === 'flower' && place.tier) return imageFor({ productType: line.productType, grade: line.grade, name: '', slug: '' });
    const onShelf = products.filter(p => {
      const at = classify(p);
      return at.category === place.category && (!place.tier || at.tier === place.tier);
    });
    // Till names and shelf names are typed differently ("Watermelon Gummie",
    // "Gummies (Peach/Watermelon)"), so they are compared word by word.
    const words = value => fold(value).split(/[^a-z0-9]+/).filter(w => w.length > 2).map(w => w.replace(/(ies|es|s)$/, ''));
    const wanted = words(line.name);
    const score = p => { const have = words(p.name); return wanted.filter(w => have.some(h => h.startsWith(w) || w.startsWith(h))).length; };
    // Every word must match, with at most one word to spare, so "Tropical"
    // never borrows the picture of "Tropical Sour Cubes".
    const named = wanted.length ? onShelf.filter(p => score(p) === wanted.length && words(p.name).length <= wanted.length + 1) : [];
    const graded = line.grade ? onShelf.filter(p => fold(p.grade) === fold(line.grade)) : [];
    // Outside flower, the grade is the brand ("Awaken", "Awaken Carts"): any
    // product of that brand stands in, never one from another brand.
    const brand = fold(line.grade).split(/\s+/)[0];
    const branded = brand ? onShelf.filter(p => fold(p.grade).split(/\s+/)[0] === brand) : [];
    const pick = [named, graded, branded, line.name || line.grade ? [] : onShelf]
      .map(set => set.find(p => p.imageUrl || PRODUCT_ART.has(p.slug)) || set.find(p => imageFor(p)))
      .find(Boolean);
    return pick ? imageFor(pick) : imageFor({ productType: line.productType, grade: line.grade, name: line.name || '', slug: '' });
  }

  /**
   * The special's products side by side on one cloud: each line's picture,
   * repeated for its quantity, up to four. A "pick one" bundle shows one.
   */
  function bundleArt(sp, products) {
    const pictured = sp.lines.map(line => ({ line, src: lineImage(line, products) }));
    // A "pick one" bundle shows one flavour: the first that has a picture.
    const lines = isChoice(sp) ? [pictured.find(x => x.src) || pictured[0]] : pictured;
    const pieces = [];
    lines.forEach(({ line, src }) => {
      for (let i = 0; i < Math.min(line.quantity, 4); i++) pieces.push({ src, label: line.name || line.grade || line.productType });
    });
    const shown = pieces.slice(0, 4);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const centre = (shown.length - 1) / 2;
    const items = shown.map((piece, i) => {
      const off = i - centre;
      const style = `--off:${off.toFixed(2)};--lift:${Math.abs(off).toFixed(2)};z-index:${10 - Math.round(Math.abs(off) * 2)}`;
      return piece.src
        ? `<img class="bundle-art__piece" style="${style}" src="${esc(piece.src)}" alt="" loading="lazy" decoding="async">`
        : `<span class="bundle-art__piece bundle-art__piece--blank" style="${style}">${esc(piece.label)}</span>`;
    }).join('');
    return `<div class="bundle-art dlc-cloud-stage" data-count="${shown.length}" aria-hidden="true"><div class="bundle-art__set">${items}</div></div>`;
  }

  // As soon as the member is confirmed, start the catalogue and bag downloads
  // — on a slow line every page needs them, so waiting to be asked wastes time.
  gateReady.then(member => { if (member) { cart().catch(() => {}); catalog().catch(() => {}); } });

  window.DLCStore = {
    TIERS, classify, tierForGrade, infusedTier, imageFor, price, productUrl, collectionUrl, slugify, moreShelves,
    specials, specialsOn, specialItems, bundleArt, isChoice,
    catalog, cart, setQuantity, addToCart, inCart, slowConnection, api,
  };
})();
