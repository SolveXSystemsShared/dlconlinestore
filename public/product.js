(() => {
  // store.js did not load (a failed request, or a browser that refused it).
  // Say so plainly rather than throwing on the first use and leaving a blank page.
  if (!window.DLCStore) {
    window.DLCPageLoader?.done();
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.style.cssText = 'padding:24px 16px;text-align:center';
    message.textContent = "We couldn't load the product. Please reload the page.";
    (document.querySelector('main') || document.body).prepend(message);
    return;
  }
  const S = window.DLCStore;
  const params = new URLSearchParams(location.search);
  const requestedId = params.get('id') || '';
  const requestedName = (params.get('name') || '').trim();
  let category = params.get('category') || 'flower';
  let tier = params.get('tier') || 'outdoor';
  const titleCase = value => value.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const setText = (id, text) => { document.getElementById(id).textContent = text; };
  // Names typed by hand in CDASH vs the lounge ("EC 3.5" / "ECS 3.5").
  const nameKey = value => S.slugify(value).replace(/^ecs-/, 'ec-');

  const cta = document.querySelector('.product-primary-cta');
  const note = document.createElement('p');
  note.className = 'product-cart-note';
  note.hidden = true;
  document.querySelector('.product-purchase-actions').after(note);
  const showNote = (html, isError) => { note.innerHTML = html; note.className = `product-cart-note${isError ? ' is-error' : ''}`; note.hidden = !html; };

  let quantity = 1;
  let maxQuantity = 1;
  const qtyValue = document.getElementById('qtyValue');
  const paintQty = () => { qtyValue.value = quantity; qtyValue.textContent = quantity; };
  document.getElementById('qtyMinus').addEventListener('click', () => { quantity = Math.max(1, quantity - 1); paintQty(); });
  document.getElementById('qtyPlus').addEventListener('click', () => { quantity = Math.min(Math.max(1, maxQuantity), quantity + 1); paintQty(); });
  // Back to the shelf the member came from (whole category or the tier they
  // picked); straight to a product, back to the whole category.
  const backUrl = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dlcCollectionState') || 'null');
      if (saved?.url && (saved.category === category || saved.category === 'all')) return saved.url;
    } catch (e) {}
    return S.collectionUrl(category);
  };
  document.getElementById('backToCollection').addEventListener('click', () => { (window.DLCPageLoader ? window.DLCPageLoader.go(backUrl()) : location.href = backUrl()); });

  function lock(label, sub) {
    cta.disabled = true;
    cta.setAttribute('aria-disabled', 'true');
    cta.innerHTML = `${label}${sub ? ` <span>${sub}</span>` : ''}`;
  }

  function notFound(message) {
    doneLoading();
    setText('productTitle', 'Not on the shelf');
    setText('productPrice', '…');
    setText('productCopy', message);
    setText('crumbProduct', 'UNAVAILABLE');
    lock('UNAVAILABLE');
    document.querySelector('.related-products').hidden = true;
    const link = document.getElementById('moreProductsLink');
    showNote(`<a href="${S.collectionUrl(category, tier)}">Browse the rest of the collection →</a>`);
    link.href = S.collectionUrl(category, tier);
  }

  function paintAvailability(product) {
    const pill = document.querySelector('.product-availability');
    const left = product.availableQuantity - S.inCart(product.id);
    maxQuantity = Math.max(0, Math.min(10, left));
    quantity = Math.min(quantity, Math.max(1, maxQuantity));
    paintQty();
    pill.classList.toggle('is-low', left > 0 && left <= 3);
    pill.classList.toggle('is-out', left <= 0);
    pill.innerHTML = `<i aria-hidden="true"></i> ${product.availableQuantity <= 3 ? `ONLY ${product.availableQuantity} LEFT` : 'IN STOCK'}`;
    if (left <= 0) lock('ALL IN YOUR BAG', 'NONE LEFT TO ADD');
    else {
      cta.disabled = false;
      cta.removeAttribute('aria-disabled');
      cta.removeAttribute('title');
      if (!cta.classList.contains('is-added')) cta.innerHTML = `ADD TO BAG <span>${S.price(product.price)}</span>`;
    }
  }

  function paint(product, siblings) {
    doneLoading();
    const place = S.classify(product);
    // Strain type and measured amount, where CDASH records them, shown before
    // the member adds anything to the bag.
    const typeLabel = product.strainType ? product.strainType[0].toUpperCase() + product.strainType.slice(1) : '';
    const typePill = document.getElementById('strainTypePill');
    typePill.hidden = !product.strainType;
    typePill.className = `strain-type strain-type--${product.strainType || 'none'}`;
    typePill.textContent = typeLabel.toUpperCase();
    document.getElementById('strainTypeChip').hidden = !product.strainType;
    document.getElementById('factStrainTypeRow').hidden = !product.strainType;
    setText('factStrainType', typeLabel);
    document.getElementById('factMgRow').hidden = !product.mgAmount;
    if (product.mgAmount) setText('factMg', `${product.mgAmount} mg`);
    category = place.category;
    tier = place.tier;
    const tierLabel = category === 'wellness' ? 'Wellness' : S.TIERS.find(t => t.slug === tier)?.label || product.productType;
    const categoryName = category === 'prerolls' ? 'Prerolls' : category === 'wellness' ? 'Wellness' : category === 'more' ? product.productType : 'Flower';
    const shelf = category === 'wellness' ? 'PRODUCTS' : tierLabel.toUpperCase();
    const collection = S.collectionUrl(category, tier);
    const image = S.imageFor(product);
    const displayPrice = S.price(product.price);

    document.title = `${product.name} | DLC`;
    setText('productTitle', product.name);
    setText('tierPill', category === 'more' ? (product.grade || product.productType).toUpperCase() : shelf === 'PRODUCTS' ? 'WELLNESS' : shelf);
    setText('productFormat', product.productType);
    setText('productSize', product.grade || product.brand || 'DLC');
    setText('productPrice', displayPrice);
    setText('factCategory', product.productType);
    setText('factTier', category === 'more' ? (product.grade || 'Not listed') : tierLabel);
    setText('factPrice', displayPrice);
    setText('crumbCategory', categoryName.toUpperCase());
    document.getElementById('crumbCategory').href = S.collectionUrl(category);
    setText('crumbTier', category === 'more' ? product.productType.toUpperCase() : shelf);
    document.getElementById('crumbTier').href = collection;
    setText('crumbProduct', product.name.toUpperCase());
    setText('stageLabel', `DLC / ${category === 'more' ? product.productType.toUpperCase() : shelf}`);
    setText('relatedTier', category === 'more' ? product.productType.toUpperCase() : shelf === 'PRODUCTS' ? 'WELLNESS' : shelf);
    document.getElementById('moreProductsLink').href = collection;

    const kind = category === 'prerolls' ? 'preroll' : category === 'flower' ? 'flower' : category === 'wellness' ? 'wellness product' : product.productType.toLowerCase();
    const kindPhrase = category === 'flower' || category === 'prerolls' ? `${tierLabel.toLowerCase()} ${kind}` : kind;
    const copy = product.description || `${product.name}. ${kindPhrase.charAt(0).toUpperCase()}${kindPhrase.slice(1)}${product.brand ? ` from ${product.brand}` : ''}, on the DLC shelf now at ${displayPrice}.`;
    setText('productCopy', copy);
    setText('detailsCopy', product.description || `${product.name} is a ${product.productType.toLowerCase()}${product.grade ? ` · ${product.grade}` : ''}. ${image && !product.imageUrl && !image.includes('/products/') ? 'The image shown is DLC collection artwork, not a photograph of this exact product.' : ''}`.trim());
    const availability = document.querySelectorAll('#productAccordions details p')[2];
    if (availability) availability.textContent = 'Only products in stock are listed, and anything that sells out is hidden. Adding to your bag does not hold stock. The team confirms your items when you send your exchange request, and the final credits at hand-over.';

    const art = image
      ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" width="900" height="900" decoding="async">`
      : `<div class="strain-pack placeholder" style="height:100%;display:grid;place-items:center;font-size:64px;font-weight:950;color:#1a6ef0">DLC</div>`;
    document.getElementById('productVisual').innerHTML = art;
    // Flower and preroll tier artwork has a fifth of empty space above and below
    // the product, so the stage lowers and enlarges it to sit on the cloud.
    document.getElementById('productStage').dataset.art = /\/(flower|preroll-tiers|prerolls)\//.test(image || '') ? 'padded' : 'tight';
    // The zoom buttons only make sense when there is a picture to zoom.
    document.getElementById('productThumbs').hidden = !image;

    const position = siblings.findIndex(p => p.id === product.id);
    setText('stageIndex', `${String(position + 1).padStart(2, '0')} / ${String(siblings.length).padStart(2, '0')}`);

    const relatedGrid = document.getElementById('relatedGrid');
    relatedGrid.innerHTML = '';
    const related = [];
    for (let step = 1; step < siblings.length && related.length < 12; step++) related.push(siblings[(position + step) % siblings.length]);
    document.querySelector('.related-products').hidden = !related.length;
    related.forEach((item, i) => {
      const card = document.createElement('a');
      card.className = 'related-card';
      card.href = S.productUrl(item);
      card.dataset.analytics = `related_product_${i + 1}_click`;
      const itemImage = S.imageFor(item);
      card.innerHTML = `
        <div class="related-card-art dlc-cloud-stage">${itemImage ? `<img src="${escapeHtml(itemImage)}" alt="${escapeHtml(item.name)}" width="520" height="520" loading="lazy" decoding="async">` : '<span style="font-size:40px;font-weight:950;color:#1a6ef0">DLC</span>'}</div>
        <div class="related-card-meta"><span>${escapeHtml(shelf)} / ${escapeHtml(item.productType.toUpperCase())}</span><h3>${escapeHtml(item.name)}</h3><strong>${S.price(item.price)}</strong><small>VIEW PRODUCT →</small></div>`;
      relatedGrid.appendChild(card);
    });

    // The URL is the shareable address of this product from now on.
    history.replaceState(null, '', S.productUrl(product));
    paintAvailability(product);

    cta.addEventListener('click', async () => {
      if (cta.disabled) return;
      lock('ADDING…');
      showNote('');
      try {
        await S.addToCart(product.id, quantity);
        cta.classList.add('is-added');
        cta.innerHTML = 'ADDED TO BAG <span>✓</span>';
        showNote(`${quantity} × ${escapeHtml(product.name)} is in your bag. <a href="/bag">Review your bag →</a>`);
        setTimeout(() => { cta.classList.remove('is-added'); paintAvailability(product); }, 1600);
        paintAvailability(product);
      } catch (error) {
        paintAvailability(product);
        showNote(escapeHtml(error.message || 'Could not add to your bag'), true);
      }
    });
  }

  // Shimmer placeholders over the real layout until the product arrives.
  const detailGrid = document.querySelector('.product-detail-grid');
  detailGrid.classList.add('is-loading');
  detailGrid.setAttribute('aria-busy', 'true');
  let stopLines = () => {};
  const doneLoading = () => { window.DLCPageLoader?.done(); stopLines(); detailGrid.classList.remove('is-loading'); detailGrid.removeAttribute('aria-busy'); };
  setText('productTitle', 'Loading…');
  setText('productPrice', '…');
  stopLines = window.DLCLoadingLines?.rotate(document.getElementById('productCopy'), 'product') || stopLines;
  lock('ADD TO BAG', 'LOADING');

  Promise.all([S.catalog(), S.cart().catch(() => [])]).then(([products]) => {
    let product = requestedId ? products.find(p => p.id === requestedId) : null;
    if (!product && requestedName) {
      const wanted = nameKey(requestedName);
      const pool = products.filter(p => S.classify(p).category === category);
      product = pool.find(p => nameKey(p.name) === wanted) || pool.find(p => nameKey(p.name).startsWith(wanted) || wanted.startsWith(nameKey(p.name)));
    }
    if (!product) {
      notFound('This product is out of stock or no longer listed. Stock changes through the day, so browse the collection to see what is on the shelf now.');
      return;
    }
    const place = S.classify(product);
    const siblings = products.filter(p => { const c = S.classify(p); return c.category === place.category && (place.category === 'wellness' || c.tier === place.tier); })
      .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    paint(product, siblings);
  }).catch(error => {
    notFound(`${error.message}. Please refresh to try again.`);
  });

  // "More from" is one swipeable row; the arrows page through it on desktop.
  document.querySelectorAll('[data-scroll-related]').forEach(button => {
    button.addEventListener('click', () => {
      const row = document.getElementById('relatedGrid');
      row.scrollBy({ left: Number(button.dataset.scrollRelated) * row.clientWidth * 0.85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });
  document.querySelectorAll('.product-zoom__btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.product-zoom__btn').forEach(item => {
        item.classList.toggle('is-active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      document.getElementById('productStage').dataset.view = button.dataset.view;
    });
  });

  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('product-page-ready')));
})();
