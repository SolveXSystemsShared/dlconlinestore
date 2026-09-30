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

  /** A real product photo when CDASH has one, else the closest DLC artwork, else null. */
  function imageFor(product) {
    if (product.imageUrl) return product.imageUrl;
    const { category, tier } = classify(product);
    const key = slugify(product.name);
    if (category === 'flower') return `assets/webp/flower/${tier}.webp`;
    if (category === 'prerolls') return PREROLL_ART[key] || `assets/webp/preroll-tiers/${tier}.webp`;
    if (category === 'wellness') return WELLNESS_ART.find(([pattern]) => pattern.test(key))?.[1] || null;
    return null;
  }

  // DLC amounts are credits, never currency. Keep in step with credits() in lib/format.ts.
  const price = value => `C ${Number(value || 0).toFixed(2)}`;

  function productUrl(product) {
    const { category, tier } = classify(product);
    return `product.html?category=${encodeURIComponent(category)}&tier=${encodeURIComponent(tier)}&id=${encodeURIComponent(product.id)}`;
  }

  function collectionUrl(category, tier) {
    if (category === 'wellness') return 'strains.html?category=wellness&tier=wellness';
    return `strains.html?category=${encodeURIComponent(category)}${tier ? `&tier=${encodeURIComponent(tier)}` : ''}`;
  }

  async function api(path, options) {
    await gateReady;
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The store could not be reached');
    return data;
  }

  let catalogPromise = null;
  function catalog() {
    if (!catalogPromise) {
      catalogPromise = api('/api/catalog').then(data => data.products || []);
      catalogPromise.catch(() => { catalogPromise = null; });
    }
    return catalogPromise;
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
  window.addEventListener('dlc:cart', event => {
    document.querySelectorAll('[data-bag-count]').forEach(el => { el.textContent = String(event.detail.count).padStart(2, '0'); });
  });
  gateReady.then(member => { if (member) cart().catch(() => {}); });

  window.DLCStore = {
    TIERS, classify, tierForGrade, imageFor, price, productUrl, collectionUrl, slugify,
    catalog, cart, setQuantity, addToCart, inCart,
  };
})();
