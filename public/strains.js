(() => {
  // store.js did not load (a failed request, or a browser that refused it).
  // Say so plainly rather than throwing on the first use and leaving a blank page.
  if (!window.DLCStore) {
    window.DLCPageLoader?.done();
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.style.cssText = 'padding:24px 16px;text-align:center';
    message.textContent = "We couldn't load the shop. Please reload the page.";
    (document.querySelector('main') || document.body).prepend(message);
    return;
  }
  const S = window.DLCStore;
  const params = new URLSearchParams(location.search);
  // No category is the main shop: everything on the shelf in one place.
  const category = ['flower', 'prerolls', 'wellness', 'more'].includes(params.get('category')) ? params.get('category') : 'all';
  const isAll = category === 'all';
  // No tier in the URL shows the whole category; the tier chips narrow it.
  let tier = category === 'wellness' ? 'wellness' : (params.get('tier') || '');
  const tierLabel = slug => S.TIERS.find(t => t.slug === slug)?.label || '';
  const titleCase = value => value.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const categoryName = isAll ? 'All products' : category === 'prerolls' ? 'Prerolls' : category === 'wellness' ? 'Wellness' : category === 'more' ? 'More' : 'Flower';
  const CATEGORY_LABEL = { flower: 'FLOWER', prerolls: 'PREROLLS', wellness: 'WELLNESS', more: 'MORE' };
  let tierName = tierLabel(tier) || titleCase(tier || 'all');
  const showsAllTiers = () => !isAll && category !== 'wellness' && !tier;
  // Dabsticks are picked by the grade of the flower that was infused, so that
  // shelf gets grade chips (see infusedTier in store.js).
  const infused = () => category === 'more' && tier === 'dabsticks';
  let grade = S.TIERS.some(t => t.slug === params.get('grade')) ? params.get('grade') : '';

  const COLLECTION_STATE_KEY = 'dlcCollectionState';
  const COLLECTION_SCROLL_KEY = 'dlcCollectionCrossScroll';
  const FILTER_HINT_KEY = 'dlcFiltersSeen';
  const saveCrossCategoryScroll = () => {
    sessionStorage.setItem(COLLECTION_SCROLL_KEY, JSON.stringify({ scrollY: window.scrollY, savedAt: Date.now(), fromCategory: category, fromTier: tier }));
  };
  const restoreCrossCategoryScroll = () => {
    try {
      const raw = sessionStorage.getItem(COLLECTION_SCROLL_KEY);
      const state = raw ? JSON.parse(raw) : null;
      if (!state || !Number.isFinite(state.scrollY) || Date.now() - state.savedAt > 15000) return;
      sessionStorage.removeItem(COLLECTION_SCROLL_KEY);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.min(state.scrollY, maxScroll));
      }));
    } catch (e) {}
  };
  window.addEventListener('pageshow', () => {
    document.documentElement.classList.remove('product-leaving');
    document.querySelectorAll('.strain-card.is-product-source').forEach(card => card.classList.remove('is-product-source'));
  });

  const collectionHref = (dest) => dest === 'all' ? 'strains.html' : dest === 'wellness' ? S.collectionUrl('wellness') : dest === 'more' ? S.collectionUrl('more') : S.collectionUrl(dest);
  // Every other product type sits in the bar as its own collection, in the
  // lounge row's order, between prerolls and wellness.
  const shopJump = document.querySelector('.shop-jump');
  const bindShopLink = link => {
    const destination = link.dataset.shop;
    const [shopCategory, shopTier] = destination.split(':');
    const active = shopCategory === category && (!shopTier || shopTier === tier);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    link.dataset.analytics = `collection_${destination.replace(':', '_')}_jump_click`;
    link.href = shopTier ? S.collectionUrl(shopCategory, shopTier) : collectionHref(destination);
    if (!active) link.addEventListener('click', saveCrossCategoryScroll);
  };
  // On a phone the bar is one swipeable row; keep the open collection in view.
  const revealActiveShop = () => {
    const active = shopJump?.querySelector('a.active');
    if (!active || shopJump.scrollWidth <= shopJump.clientWidth) return;
    shopJump.scrollLeft = active.offsetLeft - (shopJump.clientWidth - active.offsetWidth) / 2;
  };
  function paintMoreShops(products) {
    const wellness = shopJump.querySelector('[data-shop="wellness"]');
    shopJump.querySelectorAll('[data-shop^="more:"]').forEach(link => link.remove());
    S.moreShelves(products).forEach(({ slug, label }) => {
      const link = document.createElement('a');
      link.dataset.shop = `more:${slug}`;
      link.textContent = label.toUpperCase();
      shopJump.insertBefore(link, wellness);
      bindShopLink(link);
    });
    revealActiveShop();
  }
  document.querySelectorAll('[data-shop]').forEach(bindShopLink);
  revealActiveShop();
  restoreCrossCategoryScroll();
  document.querySelectorAll('[data-global-collection]').forEach(link => {
    const destination = link.dataset.globalCollection;
    link.href = collectionHref(destination);
    if (destination !== category) link.addEventListener('click', saveCrossCategoryScroll);
  });

  const grid = document.getElementById('strainGrid');
  const note = document.querySelector('.placeholder-note');
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  function paintHeader(count, fromPrice) {
    if (isAll) {
      setText('crumbCategory', 'SHOP');
      document.getElementById('crumbCategory').href = 'strains.html';
      setText('crumbTier', 'ALL PRODUCTS');
      setText('overviewCount', count == null ? '…' : String(count));
      setText('overviewCountLabel', count === 1 ? 'ITEM' : 'ITEMS');
      setText('overviewPrice', fromPrice == null ? '' : `FROM ${S.price(fromPrice)}`);
      setText('categoryLabel', 'THE DLC SHELF');
      document.getElementById('pageTitle').textContent = 'All products';
      setText('pageDescription', 'Everything on the DLC shelf right now. Pick a collection or use Filters to narrow it down.');
      document.getElementById('bandTitle').innerHTML = 'MORE FROM<br/>THE LOUNGE';
      setText('bandCopy', 'Prefer a single collection? Pick one from the collections bar.');
      document.title = 'DLC | Browse all products';
      return;
    }
    const allTiers = showsAllTiers();
    const shelf = category === 'wellness' ? 'PRODUCTS' : allTiers ? 'ALL' : tierName.toUpperCase();
    setText('crumbCategory', categoryName.toUpperCase());
    document.getElementById('crumbCategory').href = collectionHref(category);
    setText('crumbTier', shelf);
    setText('overviewCategory', categoryName.toUpperCase());
    setText('overviewTier', category === 'wellness' ? 'WELLNESS' : shelf);
    setText('overviewCount', count == null ? '…' : String(count));
    setText('overviewCountLabel', count === 1 ? 'ITEM' : 'ITEMS');
    setText('overviewPrice', fromPrice == null ? '' : `FROM ${S.price(fromPrice)}`);
    setText('categoryLabel', `${categoryName.toUpperCase()} / ${shelf}`);
    document.getElementById('bandTitle').innerHTML = `MORE FROM<br/>${escapeHtml(category === 'wellness' ? 'WELLNESS' : allTiers ? categoryName.toUpperCase() : tierName.toUpperCase())}`;

    const titleWord = category === 'wellness' ? 'WELLNESS' : tierName.toUpperCase();
    const titleTail = category === 'flower' || category === 'prerolls' ? (category === 'prerolls' ? 'PREROLLS' : 'STRAINS') : category === 'wellness' ? 'PRODUCTS' : '';
    document.getElementById('pageTitle').textContent = allTiers
      ? `All ${category === 'more' ? 'other products' : categoryName.toLowerCase()}`
      : `${titleWord} ${titleTail}`.trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
    document.title = `${category === 'wellness' ? 'Wellness Products' : allTiers ? (category === 'more' ? 'Other products' : categoryName) : `${tierName} ${category === 'more' ? '' : categoryName}`.trim()} | DLC`;

    // The old overview card is gone; keep the wording logic but write to a detached link.
    const intro = document.querySelector('.intro-actions .primary') || document.createElement('a');
    if (category === 'wellness') {
      setText('pageDescription', 'The DLC wellness range. Open a product for its format, measured serving and credits.');
      setText('bandCopy', 'Open any product above for its full details.');
      intro.textContent = 'WELLNESS COLLECTION';
    } else if (category === 'more' && grade) {
      setText('pageDescription', `Dabsticks infused with ${tierLabel(grade).toLowerCase()} flower. Pick another grade to switch.`);
      setText('bandCopy', 'Open any dabstick above for its details, or try another grade.');
      intro.textContent = 'FULL MENU';
      intro.href = '/menu';
    } else if (category === 'more' && !allTiers) {
      setText('pageDescription', `Browsing ${tierName.toLowerCase()} on the DLC shelf. Pick another collection to switch.`);
      setText('bandCopy', 'Want one list you can filter and search? Open the full menu.');
      intro.textContent = 'FULL MENU';
      intro.href = '/menu';
    } else if (allTiers) {
      const noun = category === 'more' ? 'other product' : category === 'prerolls' ? 'preroll' : 'flower strain';
      setText('pageDescription', `Every ${noun} on the DLC shelf right now. ${category === 'more' ? 'Pick a collection to narrow it down.' : 'Open Filters to narrow it down by tier or strain type.'}`);
      setText('bandCopy', 'Pick another collection, or open any product above for its details.');
      intro.textContent = `${categoryName.toUpperCase()} COLLECTION`;
    } else {
      setText('pageDescription', `The ${tierName} ${categoryName.toLowerCase()} on the DLC shelf right now. Open a ${category === 'prerolls' ? 'preroll' : 'strain'} for its full details.`);
      setText('bandCopy', `Open any ${category === 'prerolls' ? 'preroll' : 'strain'} above for its details, or try another collection.`);
      intro.textContent = `${categoryName.toUpperCase()} COLLECTION`;
    }
    if (category !== 'more') intro.href = collectionHref(category);
    setText('introCopy', 'Credits and stock are live from the DLC lounge. Add to your bag from any product page; your bag is saved to your Member ID.');
  }

  /** Tier chips for flower/prerolls, grade chips for dabsticks. */
  function paintShelves(shelves, current = tier, href = slug => S.collectionUrl(category, slug), rowLabel = 'TIER') {
    let row = document.getElementById('tierJump');
    if (!row) {
      row = document.createElement('nav');
      row.id = 'tierJump';
      row.className = 'tier-jump';
      row.setAttribute('aria-label', rowLabel === 'TIER' ? 'Cultivation tiers' : 'Infused grades');
      const holder = document.getElementById('tierRow');
      holder.appendChild(row);
      holder.hidden = false;
      document.getElementById('tierRowLabel').textContent = rowLabel;
    }
    const total = shelves.reduce((sum, shelf) => sum + shelf.count, 0);
    row.innerHTML = [{ slug: '', label: 'All', count: total }, ...shelves].map(shelf => `<a class="${shelf.slug === current ? 'active' : ''} ${shelf.count ? '' : 'is-empty'}" href="${href(shelf.slug)}"${shelf.slug === current ? ' aria-current="page"' : ''}>${escapeHtml(shelf.label.toUpperCase())} <small>${shelf.count}</small></a>`).join('');
  }

  function paintState(title, detail, isError) {
    grid.removeAttribute('aria-busy');
    grid.innerHTML = `<div class="store-state${isError ? ' is-error' : ''}"><strong>${escapeHtml(title)}</strong>${detail}</div>`;
  }

  function describe(product) {
    if (product.description) return product.description;
    if (isAll) return [product.grade, product.brand || product.productType].filter(Boolean).join(' · ') || product.productType || 'From the DLC shelf.';
    if (category === 'wellness') return `${product.name} from the DLC wellness range${product.grade ? ` by ${product.grade}` : ''}.`;
    if (category === 'more') return [product.grade, product.brand].filter(Boolean).join(' · ') || product.productType;
    const productTier = tier ? tierName : tierLabel(S.classify(product).tier);
    return `${product.name} from the ${productTier ? `${productTier.toLowerCase()} ` : ''}${category === 'prerolls' ? 'preroll' : 'flower'} collection.`;
  }

  function paintGrid(items) {
    grid.removeAttribute('aria-busy');
    grid.innerHTML = '';
    items.forEach((product, index) => {
      const card = document.createElement('article');
      card.className = 'strain-card';
      const image = S.imageFor(product);
      const place = S.classify(product);
      const cardCategory = isAll ? place.category : category;
      const packClass = cardCategory === 'flower' ? 'flower-pack' : cardCategory === 'prerolls' ? 'preroll-pack' : '';
      const pack = image
        ? `<div class="strain-pack dlc-cloud-stage ${packClass}"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" width="900" height="900" loading="lazy" decoding="async"></div>`
        : `<div class="strain-pack dlc-cloud-stage placeholder"><span>DLC</span></div>`;
      const low = product.availableQuantity <= 3;
      // On a whole shelf each card names its own tier (or product type).
      const shelf = infused() ? (tierLabel(S.infusedTier(product)) || 'DABSTICKS').toUpperCase() : isAll || showsAllTiers() ? (tierLabel(place.tier) || product.productType || '').toUpperCase() : category === 'wellness' ? 'PRODUCTS' : tierName.toUpperCase();
      const cardLabel = isAll ? CATEGORY_LABEL[place.category] : categoryName.toUpperCase();
      card.innerHTML = `${pack}<div class="strain-meta"><div class="strain-number">${String(index + 1).padStart(2, '0')} / ${cardLabel}${shelf && shelf !== cardLabel ? ` / ${escapeHtml(shelf)}` : ''}</div><h2>${escapeHtml(product.name)}</h2><div class="strain-price">${S.price(product.price)}</div>${product.strainType ? `<span class="strain-type strain-type--${product.strainType}">${product.strainType.toUpperCase()}</span>` : ''}<p>${escapeHtml(describe(product))}</p><span class="strain-stock${low ? ' is-low' : ''}">${low ? `ONLY ${product.availableQuantity} LEFT` : 'IN STOCK'}</span><span class="strain-action">VIEW PRODUCT →</span></div>`;
      card.setAttribute('role', 'link');
      card.tabIndex = 0;
      card.setAttribute('aria-label', `View ${product.name}`);
      card.dataset.analytics = `${category}_${tier || 'all'}_${S.slugify(product.name).replace(/-/g, '_')}_click`;
      const productUrl = S.productUrl(product);
      const prefetchProduct = () => {
        if (image) { const img = new Image(); img.src = image; }
      };
      const openProduct = () => {
        sessionStorage.setItem(COLLECTION_STATE_KEY, JSON.stringify({ url: location.href, scrollY: window.scrollY, category, tier }));
        if (window.DLCPageLoader) { card.classList.add('is-product-source'); window.DLCPageLoader.go(productUrl); return; }
        location.href = productUrl;
      };
      card.addEventListener('pointerenter', prefetchProduct, { once: true });
      card.addEventListener('focus', prefetchProduct, { once: true });
      card.addEventListener('click', openProduct);
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openProduct(); } });
      grid.appendChild(card);
    });
  }

  // Specials with something from this shelf in them, each shown as its
  // products together on one cloud. Read-only: they are rung up at the counter.
  function paintSpecials(products) {
    const section = document.getElementById('shelfSpecials');
    S.specials().then(list => {
      const here = S.specialsOn(list, category, category === 'wellness' ? '' : tier, grade)
        .sort((a, b) => (b.kind === 'bundle') - (a.kind === 'bundle'));
      if (!here.length) return;
      const where = isAll ? 'at the lounge' : category === 'more' && !tier ? 'on these shelves' : category === 'more' ? `with ${tierName.toLowerCase()}` : tier ? `with ${tierName.toLowerCase()} ${categoryName.toLowerCase()}` : `with ${categoryName.toLowerCase()}`;
      setText('shelfSpecialsTitle', `Specials ${where}`);
      document.getElementById('shelfSpecialsTrack').innerHTML = here.map(sp => {
        const amount = sp.credits != null ? S.price(sp.credits) : sp.percentOff != null ? `${sp.percentOff}% off` : '';
        const tags = [sp.kind === 'bundle' ? 'BUNDLE' : 'SPECIAL', sp.cashOnly ? 'SETTLE IN CASH' : null].filter(Boolean)
          .map((t, i) => `<span class="special-card__tag${i ? ' special-card__tag--cash' : ''}">${t}</span>`).join('');
        const items = S.specialItems(sp);
        return `<a class="special-card" href="specials.html#special-${encodeURIComponent(sp.id)}">${S.bundleArt(sp, products)}<div class="special-card__meta"><div class="special-card__tags">${tags}</div><h3>${escapeHtml(sp.name)}</h3>${amount ? `<strong>${escapeHtml(amount)}</strong>` : ''}<p>${escapeHtml(items)}</p></div></a>`;
      }).join('');
      section.hidden = false;
    }).catch(() => {});
  }

  function restoreScroll() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(COLLECTION_STATE_KEY) || 'null');
      if (saved && saved.url === location.href && Number.isFinite(saved.scrollY)) requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    } catch (e) {}
    window.addEventListener('scroll', () => {
      sessionStorage.setItem(COLLECTION_STATE_KEY, JSON.stringify({ url: location.href, scrollY: window.scrollY, category, tier }));
    }, { passive: true });
  }

  paintHeader(null, null);
  // Placeholder cards in the real grid while the shelf loads, so the page is
  // laid out at once and nothing jumps when the products arrive.
  function paintSkeleton() {
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = Array.from({ length: 6 }, () => `<article class="strain-card is-skeleton" aria-hidden="true"><div class="strain-pack"><span class="sk sk-art"></span></div><div class="strain-meta"><span class="sk sk-line sk-w40"></span><span class="sk sk-title"></span><span class="sk sk-line sk-w90"></span><span class="sk sk-line sk-w60"></span></div></article>`).join('')
      + '<p class="store-loading-line" role="status" aria-live="polite"></p>';
    window.DLCLoadingLines?.rotate(grid.querySelector('.store-loading-line'), 'shelf');
  }
  paintSkeleton();
  note.textContent = 'STOCK UPDATES LIVE FROM THE LOUNGE. POTENCY: CONFIRM IN STORE.';

  S.catalog().then(products => {
    paintMoreShops(products);
    const inCategory = isAll ? products : products.filter(p => S.classify(p).category === category);

    let shelves = [];
    if (category === 'flower' || category === 'prerolls') {
      shelves = S.TIERS.map(t => ({ slug: t.slug, label: t.label, count: inCategory.filter(p => S.classify(p).tier === t.slug).length }));
      if (tier && !shelves.some(s => s.slug === tier)) {
        tier = '';
        history.replaceState(null, '', S.collectionUrl(category));
      }
    } else if (category === 'more') {
      // One shelf per product type with stock; none are empty, so the page
      // never offers a blank shelf. No shelf in the URL: show every type.
      const byType = new Map();
      inCategory.forEach(p => {
        const slug = S.classify(p).tier;
        const entry = byType.get(slug) || { slug, label: p.productType, count: 0 };
        entry.count++;
        byType.set(slug, entry);
      });
      shelves = [...byType.values()].sort((a, b) => a.label.localeCompare(b.label));
      if (tier && !shelves.some(s => s.slug === tier)) {
        tier = '';
        history.replaceState(null, '', S.collectionUrl(category));
      }
      tierName = shelves.find(s => s.slug === tier)?.label || 'All';
    }
    if (shelves.length && category !== 'more') paintShelves(shelves);
    if (infused()) {
      const onShelf = inCategory.filter(p => S.classify(p).tier === tier);
      const grades = S.TIERS.map(t => ({ slug: t.slug, label: t.label, count: onShelf.filter(p => S.infusedTier(p) === t.slug).length })).filter(g => g.count);
      if (grade && !grades.some(g => g.slug === grade)) {
        grade = '';
        history.replaceState(null, '', S.collectionUrl(category, tier));
      }
      if (grades.length) paintShelves(grades, grade, slug => S.collectionUrl(category, tier, slug), 'INFUSED GRADE');
      if (grade) tierName = `${tierLabel(grade)} ${tierName}`;
    } else {
      grade = '';
    }

    const shelfItems = inCategory.filter(p => (isAll || category === 'wellness' || !tier || S.classify(p).tier === tier) && (!grade || S.infusedTier(p) === grade));
    paintSpecials(products);
    sessionStorage.setItem(COLLECTION_STATE_KEY, JSON.stringify({ url: location.href, scrollY: 0, category, tier }));

    // Strain type and sort are applied here, without a reload, and kept in
    // the URL so a filtered shelf can be shared or come back to.
    const TYPES = [['all', 'All'], ['indica', 'Indica'], ['sativa', 'Sativa'], ['hybrid', 'Hybrid']];
    const url = new URL(location.href);
    let type = TYPES.some(([key]) => key === url.searchParams.get('type')) ? url.searchParams.get('type') : 'all';
    let sort = ['recommended', 'low', 'high', 'name'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'recommended';
    const sortSelect = document.getElementById('sortSelect');
    sortSelect.value = sort;

    const typeCounts = { all: shelfItems.length };
    shelfItems.forEach(p => { if (p.strainType) typeCounts[p.strainType] = (typeCounts[p.strainType] || 0) + 1; });
    const hasTypes = TYPES.slice(1).some(([key]) => typeCounts[key]);
    const typeRow = document.getElementById('typeRow');
    typeRow.hidden = !hasTypes;
    if (!hasTypes) type = 'all';

    const remember = () => {
      const next = new URL(location.href);
      if (type === 'all') next.searchParams.delete('type'); else next.searchParams.set('type', type);
      if (sort === 'recommended') next.searchParams.delete('sort'); else next.searchParams.set('sort', sort);
      history.replaceState(null, '', next);
    };

    const paintTypes = () => {
      document.getElementById('typeJump').innerHTML = TYPES
        .filter(([key]) => key === 'all' || typeCounts[key])
        .map(([key, label]) => `<button type="button" class="type-chip type-chip--${key}" data-type="${key}" aria-pressed="${key === type}">${label} <small>${typeCounts[key] || 0}</small></button>`).join('');
    };

    const sorters = {
      recommended: (a, b) => b.availableQuantity - a.availableQuantity || a.name.localeCompare(b.name),
      low: (a, b) => a.price - b.price || a.name.localeCompare(b.name),
      high: (a, b) => b.price - a.price || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    };

    const featured = document.getElementById('featuredProductLink');
    // Filters sit behind a toggle so the page opens on the categories alone.
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');
    const setFiltersOpen = open => {
      filterToggle.setAttribute('aria-expanded', String(open));
      filterPanel.classList.toggle('is-open', open);
      filterPanel.inert = !open;
    };
    if (!filterToggle.dataset.bound) {
      filterToggle.dataset.bound = '1';
      filterToggle.addEventListener('click', () => {
        setFiltersOpen(filterToggle.getAttribute('aria-expanded') !== 'true');
        filterToggle.classList.remove('is-hinting');
        try { localStorage.setItem(FILTER_HINT_KEY, '1'); } catch (e) {}
      });
      let filtersSeen = false;
      try { filtersSeen = localStorage.getItem(FILTER_HINT_KEY) === '1'; } catch (e) {}
      filterToggle.classList.toggle('is-hinting', !filtersSeen);
    }
    const clearButton = document.getElementById('clearFilters');
    // A chosen tier counts as a filter too; clearing it opens the whole category.
    const tierFiltered = ((category === 'flower' || category === 'prerolls') && !!tier) || !!grade;
    clearButton.addEventListener('click', () => {
      if (tierFiltered) { location.href = grade ? S.collectionUrl(category, tier) : S.collectionUrl(category); return; }
      type = 'all'; sort = 'recommended'; sortSelect.value = sort; remember(); apply();
    });
    const apply = () => {
      const active = tierFiltered + (type !== 'all') + (sort !== 'recommended');
      clearButton.hidden = !active;
      const countBadge = document.getElementById('filterCount');
      countBadge.hidden = !active;
      countBadge.textContent = String(active);
      filterToggle.classList.toggle('has-active', active > 0);
      filterToggle.setAttribute('aria-label', active ? `Filters, ${active} active` : 'Filters');
      const items = shelfItems.filter(p => type === 'all' || p.strainType === type).sort(sorters[sort]);
      paintHeader(items.length, items.length ? Math.min(...items.map(p => p.price)) : null);
      paintTypes();
      if (items.length) {
        paintGrid(items);
        if (featured) { featured.href = S.productUrl(items[0]); featured.hidden = false; }
      } else if (shelfItems.length) {
        paintState(`No ${type} ${isAll ? 'products' : categoryName.toLowerCase()} here`, `Nothing on this shelf is recorded as ${type}. <a href="#" data-clear-type>Show all types</a>.`);
      } else {
        const stocked = shelves.filter(s => s.count);
        const suggestions = stocked.length ? ` Try ${stocked.map(s => `<a href="${S.collectionUrl(category, s.slug)}">${escapeHtml(s.label)}</a>`).join(', ')}.` : '';
        if (isAll) paintState('The shelf is empty right now', 'Stock changes through the day, so check back soon.');
        else if (!tier) paintState(`Nothing on this shelf right now`, `The lounge has no ${categoryName.toLowerCase()} in stock. Stock changes through the day, so check back soon.`);
        else paintState(`Nothing on this shelf right now`, `The lounge has no ${escapeHtml(tierName.toLowerCase())} ${categoryName.toLowerCase()} in stock.${suggestions}`);
        if (featured) featured.hidden = true;
      }
    };

    document.getElementById('typeJump').addEventListener('click', event => {
      const chip = event.target.closest('[data-type]');
      if (!chip || chip.dataset.type === type) return;
      type = chip.dataset.type;
      remember();
      apply();
    });
    grid.addEventListener('click', event => {
      if (!event.target.closest('[data-clear-type]')) return;
      event.preventDefault();
      type = 'all'; remember(); apply();
    });
    sortSelect.addEventListener('change', () => { sort = sortSelect.value; remember(); apply(); });
    apply();
    restoreScroll();
    window.DLCPageLoader?.done();
  }).catch(error => {
    paintState('The shelf could not be loaded', `${escapeHtml(error.message)}. <a href="${escapeHtml(location.href)}">Try again</a>.`, true);
    window.DLCPageLoader?.done();
  });

  if (document.documentElement.classList.contains('dlc-arriving')) {
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('dlc-arrival-reveal')));
    window.setTimeout(() => {
      document.documentElement.classList.remove('dlc-arriving', 'dlc-arrival-reveal');
      sessionStorage.removeItem('dlcTransitionIn');
    }, 1050);
  } else {
    sessionStorage.removeItem('dlcTransitionIn');
  }
})();
