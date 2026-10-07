(() => {
  const experience = document.querySelector('.experience');
  const video = document.getElementById('loungeVideo');
  const heroCopy = document.getElementById('heroCopy');
  const tableUi = document.getElementById('tableUi');
  const videoShade = document.getElementById('videoShade');
  const progressFill = document.getElementById('progressFill');
  const categories = [...document.querySelectorAll('.category')];
  const cards = [...document.querySelectorAll('.product-card')];
  const productCloudReveal = document.getElementById('productCloudReveal');
  const loungeLoader = document.getElementById('loungeLoader');
  const loungeLoaderBar = document.getElementById('loungeLoaderBar');
  // Rotating lines while the lounge buffers; stops itself when the loader goes.
  window.DLCLoadingLines?.rotate(loungeLoader?.querySelector('.lounge-loader__text'), 'lounge');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) document.documentElement.classList.add('reduced-motion');
  const liteVideo = !!window.DLCStore?.slowConnection?.();
  if (liteVideo) document.documentElement.classList.add('lite-video');

  const STATE_KEY = 'dlcLoungeState';
  const RETURN_KEY = 'dlcReturnToLounge';

  // A logo click from an inner page is a true Home action, not a return-to-lounge action.
  // Clear remembered browsing state so the homepage always opens from the beginning.
  const homeParams = new URLSearchParams(window.location.search);
  const isExplicitHomeEntry = homeParams.get('home') === '1';
  if (isExplicitHomeEntry) {
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    sessionStorage.removeItem('dlcCollectionState');
    sessionStorage.removeItem('dlcCollectionScrollTransfer');
    sessionStorage.removeItem('dlcTransitionIn');
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    history.replaceState(null, '', window.location.pathname);
    window.scrollTo(0, 0);
  }

  const flowerTierVisuals = {
    outdoor: { src: 'assets/webp/flower/outdoor.webp', small: 'assets/webp/flower/small/outdoor.webp', alt: 'Cannabis flower bud for Outdoor' },
    greenhouse: { src: 'assets/webp/flower/greenhouse.webp', small: 'assets/webp/flower/small/greenhouse.webp', alt: 'Cannabis flower bud for Greenhouse' },
    'executive-greenhouse': { src: 'assets/webp/flower/executive-greenhouse.webp', small: 'assets/webp/flower/small/executive-greenhouse.webp', alt: 'Cannabis flower bud for Executive Greenhouse' },
    indoor: { src: 'assets/webp/flower/indoor.webp', small: 'assets/webp/flower/small/indoor.webp', alt: 'Cannabis flower bud for Indoor' },
    hydro: { src: 'assets/webp/flower/hydro.webp', small: 'assets/webp/flower/small/hydro.webp', alt: 'Cannabis flower bud for Hydro' }
  };

  const prerollTierVisuals = {
    outdoor: { src: 'assets/webp/preroll-tiers/outdoor.webp', alt: 'DLC Outdoor preroll' },
    greenhouse: { src: 'assets/webp/preroll-tiers/greenhouse.webp', alt: 'DLC Greenhouse preroll' },
    'executive-greenhouse': { src: 'assets/webp/preroll-tiers/executive-greenhouse.webp', alt: 'DLC Executive Greenhouse preroll' },
    indoor: { src: 'assets/webp/preroll-tiers/indoor.webp', alt: 'DLC Indoor preroll' },
    hydro: { src: 'assets/webp/preroll-tiers/hydro.webp?v=2026-10-05', alt: 'DLC Hydro preroll' }
  };

  function saveLoungeState(category){
    const active = category || document.querySelector('.category.active')?.dataset.category || 'flower';
    sessionStorage.setItem(STATE_KEY, JSON.stringify({
      category: active,
      scrollY: window.scrollY,
      savedAt: Date.now()
    }));
    sessionStorage.setItem(RETURN_KEY, '1');
  }

  function getSavedLoungeState(){
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch(e) { return null; }
  }

  const VIDEO_PROFILES = {
    desktop: { src: video.dataset.desktopSrc, poster: video.dataset.desktopPoster, scrubEnd: 8.0 },
    tablet: { src: video.dataset.tabletSrc, poster: video.dataset.tabletPoster, scrubEnd: 9.8 },
    phone: { src: video.dataset.phoneSrc, poster: video.dataset.phonePoster, scrubEnd: 9.99 }
  };

  function getVideoProfileName(){
    const portrait = window.innerHeight >= window.innerWidth;
    if (!portrait) return 'desktop';
    if (window.innerWidth <= 600) return 'phone';
    if (window.innerWidth <= 1180) return 'tablet';
    return 'desktop';
  }

  let activeVideoProfile = '';
  let targetTime = 0;
  let currentTime = 0;
  let durationReady = false;
  let rafId = null;
  let sourceSwapTimer = null;

  function getScrubEnd(){
    const profile = VIDEO_PROFILES[activeVideoProfile || getVideoProfileName()];
    return profile.effectiveScrubEnd || profile.scrubEnd;
  }
  function isTouchLayout(){ return activeVideoProfile === 'phone' || activeVideoProfile === 'tablet'; }

  let loungeReady = false;
  function getBufferedEnd(){
    try {
      if (!video.buffered.length) return 0;
      return video.buffered.end(video.buffered.length - 1);
    } catch(e) { return 0; }
  }
  function updateLoungeLoader(){
    if (!loungeLoader || loungeReady) return;
    const needed = Math.max(1, getScrubEnd());
    const buffered = Math.min(needed, getBufferedEnd());
    const progress = Math.max(video.readyState >= 2 ? .16 : .04, buffered / needed);
    if (loungeLoaderBar) loungeLoaderBar.style.width = `${Math.round(progress * 100)}%`;
    if ((buffered >= Math.min(needed, 1.6) && video.readyState >= 2) || video.readyState >= 3) {
      loungeReady = true;
      loungeLoader.classList.add('is-ready');
      document.documentElement.classList.add('lounge-ready');
      setTimeout(() => loungeLoader?.remove(), 520);
    }
  }
  video.addEventListener('progress', updateLoungeLoader);
  video.addEventListener('loadeddata', updateLoungeLoader);
  video.addEventListener('canplay', updateLoungeLoader);
  const loungeLoaderTimeout = setTimeout(() => {
    if (!loungeReady && loungeLoader) {
      loungeReady = true;
      loungeLoader.classList.add('is-ready');
      document.documentElement.classList.add('lounge-ready');
      setTimeout(() => loungeLoader?.remove(), 520);
    }
  }, 2600);

  function prefetchImage(src){
    if (!src) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
  // Priority-load the first visible Flower assets while the lounge video buffers.
  Object.values(flowerTierVisuals).forEach((visual, index) => { if (index < 3) prefetchImage(window.innerWidth <= 600 ? visual.small : visual.src); });


  // Lightweight cloud-navigation transition. This deliberately uses only
  // transform/opacity + CSS gradients so product navigation does not require
  // another large video download.
  const transitionLayer = document.createElement('div');
  transitionLayer.className = 'dlc-cloud-transition';
  transitionLayer.setAttribute('aria-hidden', 'true');
  transitionLayer.innerHTML = '<div class="dlc-cloud-transition__field"></div><div class="dlc-cloud-transition__white"></div>';
  document.body.appendChild(transitionLayer);

  const prefetchedPages = new Set();
  function prefetchPage(href){
    if (!href || prefetchedPages.has(href)) return;
    prefetchedPages.add(href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'document';
    document.head.appendChild(link);
  }

  let navigationTransitioning = false;
  function resetCloudTransition(){
    navigationTransitioning = false;
    document.documentElement.classList.remove('dlc-transition-active');
    transitionLayer.classList.remove('is-active');
    cards.forEach(card => card.classList.remove('is-transition-source'));
    if (stageVisible && !rafId) render();
  }

  function navigateWithCloud(card){
    const href = card?.dataset.href;
    if (!href || navigationTransitioning) return;

    const activeCategory = document.querySelector('.category.active')?.dataset.category || 'flower';
    saveLoungeState(activeCategory);
    prefetchPage(href);

    // Reduced-motion visitors get immediate, predictable navigation.
    if (reducedMotion) {
      window.location.assign(href);
      return;
    }

    navigationTransitioning = true;
    sessionStorage.setItem('dlcTransitionIn', JSON.stringify({href: new URL(href, location.href).href, at: Date.now()}));
    document.documentElement.classList.add('dlc-transition-active');
    card.classList.add('is-transition-source');

    // Stop scroll-scrubbing while the white transition fully covers the video.
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    video.pause();

    requestAnimationFrame(() => transitionLayer.classList.add('is-active'));
    window.setTimeout(() => window.location.assign(href), 680);
  }

  function applyResponsiveVideoSource(force = false){
    const nextProfile = getVideoProfileName();
    if (!force && nextProfile === activeVideoProfile) return;
    const next = VIDEO_PROFILES[nextProfile];
    if (!next?.src) return;

    activeVideoProfile = nextProfile;
    video.poster = next.poster || '';
    document.documentElement.dataset.videoProfile = nextProfile;
    // Reduced motion, a slow connection or Data Saver: keep the still poster
    // and skip the multi-megabyte video. The scroll experience still works.
    if (reducedMotion || liteVideo) {
      durationReady = false;
      video.removeAttribute('src');
      video.load();
      if (loungeLoader) loungeLoader.classList.add('is-ready');
      return;
    }

    const restoreTime = Math.min(currentTime || video.currentTime || 0.01, next.scrubEnd);
    durationReady = false;
    video.pause();
    video.src = next.src;
    video.load();

    const restore = () => {
      const actualDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : next.scrubEnd;
      next.effectiveScrubEnd = Math.max(0.15, Math.min(next.scrubEnd, Math.max(0.15, actualDuration - 0.06)));
      durationReady = true;
      currentTime = Math.min(restoreTime, next.effectiveScrubEnd);
      targetTime = currentTime;
      try { video.currentTime = Math.max(0.01, currentTime); } catch(e) {}
      video.removeEventListener('loadedmetadata', restore);
      updateLoungeLoader();
    };
    video.addEventListener('loadedmetadata', restore);
  }

  applyResponsiveVideoSource(true);
  video.addEventListener('error', () => {
    document.documentElement.classList.add('video-fallback');
    if (loungeLoader) loungeLoader.classList.add('is-ready');
    durationReady = false;
  });


  function clamp(v, min = 0, max = 1){ return Math.min(max, Math.max(min, v)); }
  function smoothstep(a,b,x){ const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); }

  function getProgress(){
    const rect = experience.getBoundingClientRect();
    const scrollable = experience.offsetHeight - window.innerHeight;
    return clamp((-rect.top) / Math.max(1, scrollable));
  }

  // Scroll-driven category sequence inside the lounge. The video keeps its original
  // perceived scrub distance; the additional page height walks the category row
  // left to right (Flower → Prerolls → … → Wellness) before the sticky lounge
  // releases into the next content.
  let scrollDrivenCategory = null;
  // The three the lounge scroll moves through; every other CDASH category is
  // filled from the live catalogue and shown on demand.
  const CORE_CATEGORIES = ['flower', 'prerolls', 'wellness'];
  let manualCategoryOverride = null;
  let manualCategoryOverrideUntil = 0;

  // Scroll phases. The base numbers are the original design for three
  // categories; every category in categoryOrder gets the same scroll distance
  // as one of those, the video keeps its original length, and the lounge
  // (.experience) is made taller to fit. With three categories the maths
  // gives back exactly the original phases.
  const BASE_PHASES = {
    phone: { videoEnd:0.52, uiStart:0.49, flower:0.52, release:0.975 },
    tablet: { videoEnd:0.595, uiStart:0.57, flower:0.595, release:0.98 },
    desktop: { videoEnd:0.585, uiStart:0.56, flower:0.585, release:0.98 },
  };
  let categoryOrder = ['flower', 'prerolls', 'wellness'];

  function getScrollPhases(){
    const b = BASE_PHASES[activeVideoProfile] || BASE_PHASES.desktop;
    const n = Math.max(1, categoryOrder.length);
    const slice0 = (b.release - b.flower) / 3;
    const total = b.flower + n * slice0 + (1 - b.release);
    const k = 1 / total;
    const slice = slice0 * k;
    const flower = b.flower * k;
    return {
      total, slice, flower,
      videoEnd: b.videoEnd * k,
      uiStart: b.uiStart * k,
      prerolls: flower + slice,
      release: flower + n * slice,
    };
  }

  // Taller lounge for more categories: the CSS height covers the original
  // three, the extra length is added in pixels so each category keeps the
  // same scroll distance on every screen size.
  function fitExperienceHeight(){
    experience.style.height = '';
    const total = getScrollPhases().total;
    if (Math.abs(total - 1) < 0.001) return;
    const base = experience.offsetHeight - window.innerHeight;
    experience.style.height = `${Math.round(base * total + window.innerHeight)}px`;
  }

  function categoryForProgress(p){
    const phases = getScrollPhases();
    if (p < phases.flower) return null;
    const index = Math.min(categoryOrder.length - 1, Math.floor((p - phases.flower) / phases.slice));
    return categoryOrder[Math.max(0, index)];
  }

  function progressForCategory(category){
    const phases = getScrollPhases();
    const index = Math.max(0, categoryOrder.indexOf(category));
    return phases.flower + phases.slice * (index + 0.3);
  }

  function scrollToCategoryPhase(category, behavior = 'smooth'){
    const targetProgress = progressForCategory(category);
    const scrollable = Math.max(1, experience.offsetHeight - window.innerHeight);
    const targetY = experience.offsetTop + scrollable * targetProgress;

    // Keep the clicked category authoritative while the browser moves through
    // intermediate scroll positions. Without this lock a Flower → Wellness click
    // briefly passes through the Prerolls phase and visually flashes back.
    manualCategoryOverride = category;
    manualCategoryOverrideUntil = performance.now() + (behavior === 'smooth' ? 1400 : 180);
    window.scrollTo({top: targetY, left: 0, behavior});
  }

  function activateCategory(category, {persist=true, animate=true} = {}){
    if (!category || !categoryProducts[category]) return;
    const current = document.querySelector('.category.active')?.dataset.category;
    if (current === category && scrollDrivenCategory === category) return;
    prefetchCategory(category);
    categories.forEach(b => {
      const active = b.dataset.category === category;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    renderCategory(category, animate);
    scrollDrivenCategory = category;
    revealCategoryButton(category);
    if (persist) {
      const prior = getSavedLoungeState() || {};
      sessionStorage.setItem(STATE_KEY, JSON.stringify({...prior, category, scrollY:window.scrollY, savedAt:Date.now()}));
    }
  }

  function revealCategoryButton(category){
    const row = document.querySelector('.category-row');
    const btn = categories.find(b => b.dataset.category === category);
    if (!row || !btn || row.scrollWidth <= row.clientWidth) return;
    const left = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  let lastSeekAt = 0;
  function render(now = performance.now()){
    const p = getProgress();
    progressFill.style.height = `${p * 100}%`;

    // Preserve the perceived duration of the lounge camera move, then use the
    // remaining scroll distance for the three product-category phases.
    const isPhoneProfile = activeVideoProfile === 'phone';
    const phases = getScrollPhases();
    const videoP = clamp(p / phases.videoEnd);
    const scrubEnd = getScrubEnd();
    targetTime = videoP * scrubEnd;

    const heroFade = 1 - smoothstep(reducedMotion ? 0.04 : 0.08, reducedMotion ? 0.18 : Math.min(0.30, phases.uiStart - 0.12), p);
    heroCopy.style.opacity = heroFade.toFixed(3);
    heroCopy.style.transform = `translateY(${(-44 - smoothstep(0.06,Math.max(.3, phases.uiStart - .08),p)*9)}%)`;

    const uiIn = smoothstep(reducedMotion ? 0.30 : phases.uiStart, reducedMotion ? 0.43 : phases.flower + 0.035, p);
    const uiOut = 1 - smoothstep(phases.release, 1, p);
    const uiOpacity = uiIn * uiOut;
    tableUi.style.opacity = uiOpacity.toFixed(3);
    tableUi.classList.toggle('ready', uiOpacity > .75);
    // While the category row is on screen, the floating ? and ↑ buttons lift
    // above it instead of covering the categories.
    document.documentElement.classList.toggle('lounge-row-visible', uiOpacity > 0.05);
    videoShade.style.opacity = (0.55 + uiIn * 0.17).toFixed(3);

    // Once the product table is reached, scrolling itself changes the category.
    // We only render when crossing a phase boundary, so normal RAF updates stay cheap.
    let nextScrollCategory = categoryForProgress(p);
    if (manualCategoryOverride) {
      const overrideTarget = progressForCategory(manualCategoryOverride);
      const reachedTarget = Math.abs(p - overrideTarget) < 0.018;
      const overrideExpired = now > manualCategoryOverrideUntil;

      if (!reachedTarget && !overrideExpired) {
        nextScrollCategory = manualCategoryOverride;
      } else {
        manualCategoryOverride = null;
        manualCategoryOverrideUntil = 0;
        nextScrollCategory = categoryForProgress(p);
      }
    }
    if (nextScrollCategory && nextScrollCategory !== scrollDrivenCategory) {
      activateCategory(nextScrollCategory, {persist:true, animate:!reducedMotion});
    }

    if (productCloudReveal && !reducedMotion) {
      const cloudIn = smoothstep(phases.uiStart - 0.025, phases.flower + 0.02, p);
      const cloudOut = 1 - smoothstep(phases.flower + 0.07, phases.prerolls - 0.015, p);
      const cloudOpacity = cloudIn * cloudOut;
      productCloudReveal.style.opacity = cloudOpacity.toFixed(3);
      productCloudReveal.style.transform = `translate(-50%, ${18 - cloudIn * 18}px) scale(${0.96 + cloudIn * 0.07})`;
    }

    updateLoungeLoader();

    if (durationReady) {
      currentTime += (targetTime - currentTime) * 0.19;
      if (!reducedMotion && now - lastSeekAt > 30 && Math.abs(video.currentTime - currentTime) > 0.035) {
        lastSeekAt = now;
        try { video.currentTime = Math.min(getScrubEnd(), currentTime); } catch(e) {}
      }
    }

    rafId = stageVisible && !navigationTransitioning ? requestAnimationFrame(render) : null;
  }

  // Keyed by the card label slug; names match the CDASH wellness products.
  // ?v= is ART_VERSION from store.js — it skips copies browsers kept from before the artwork swap.
  const wellnessVisuals = {
    'ecs-3.5': 'assets/webp/wellness/ec-3-5.webp?v=2026-10-05',
    'ecs-7.5': 'assets/webp/products/wellness-cbd-ecs-7-5-cannabinoid-nutrition.webp?v=2026-10-05',
    'ecs-30': 'assets/webp/wellness/ec-30.webp?v=2026-10-05',
    'pain-relax': 'assets/webp/products/wellness-cbd-pain-relax-cannabinoid-nutrition.webp?v=2026-10-05',
    'happy-pet': 'assets/webp/products/wellness-cbd-happy-pet-cannabinoid-nutrition.webp?v=2026-10-05'
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const categoryProducts = {
    flower: [
      ['FLOWER','Outdoor'],
      ['FLOWER','Greenhouse'],
      ['FLOWER','Executive Greenhouse'],
      ['FLOWER','Indoor'],
      ['FLOWER','Hydro']
    ],
    prerolls: [
      ['PREROLLS','Outdoor'],
      ['PREROLLS','Greenhouse'],
      ['PREROLLS','Executive Greenhouse'],
      ['PREROLLS','Indoor'],
      ['PREROLLS','Hydro']
    ],
    wellness: [
      ['WELLNESS','ECS 3.5','product.html?category=wellness&tier=wellness&name=ECS%203.5'],
      ['WELLNESS','ECS 7.5','product.html?category=wellness&tier=wellness&name=ECS%207.5'],
      ['WELLNESS','ECS 30','product.html?category=wellness&tier=wellness&name=ECS%2030'],
      ['WELLNESS','Pain Relax','product.html?category=wellness&tier=wellness&name=Pain%20Relax'],
      ['WELLNESS','Happy Pet','product.html?category=wellness&tier=wellness&name=Happy%20Pet']
    ],
  };

  function renderCategory(category, animate = true){
    const items = categoryProducts[category] || categoryProducts.flower;
    const fiveUp = items.length === 5;
    document.getElementById('productDock').classList.toggle('five-up', fiveUp);
    document.getElementById('productDock').classList.toggle('three-up', !fiveUp);

    cards.forEach((card, i) => {
      const item = items[i];
      card.classList.toggle('is-hidden', !item);
      if (!item) return;
      const pack = card.querySelector('.pack');
      const tierSlug = item[1].toLowerCase().replaceAll(' ','-');
      card.querySelector('.product-type').textContent = item[0];
      const displayName = (window.matchMedia('(max-width: 640px) and (orientation: portrait)').matches && item[1] === 'Executive Greenhouse')
        ? 'Exe Greenhouse'
        : item[1];
      card.querySelector('strong').textContent = displayName;
      const button = card.querySelector('.product-action');
      const canOpenStrains = category === 'flower' || category === 'prerolls';
      const directHref = item[2] || '';
      button.textContent = canOpenStrains ? 'VIEW STRAINS →' : item[4] ? item[4] : (directHref ? 'VIEW PRODUCT →' : 'VIEW PRODUCT →');
      card.dataset.analytics = `${category}_${tierSlug}_click`;
      card.dataset.href = canOpenStrains
        ? `strains.html?category=${encodeURIComponent(category)}&tier=${encodeURIComponent(tierSlug)}`
        : directHref;
      card.setAttribute('role', card.dataset.href ? 'link' : 'article');
      card.tabIndex = card.dataset.href ? 0 : -1;

      if (card.dataset.href) {
        card.onpointerenter = () => prefetchPage(card.dataset.href);
        card.onpointerdown = () => prefetchPage(card.dataset.href);
        card.onfocus = () => prefetchPage(card.dataset.href);
      } else {
        card.onpointerenter = null;
        card.onpointerdown = null;
        card.onfocus = null;
      }

      const isFlower = category === 'flower';
      const isPrerolls = category === 'prerolls';
      const isWellness = category === 'wellness';
      card.classList.toggle('flower-card', isFlower || isWellness);
      card.classList.toggle('preroll-card', isPrerolls);
      card.classList.toggle('wellness-card', isWellness);
      // A real pack shot on a MORE shelf: no glass placeholder behind it.
      card.classList.toggle('photo-card', !isFlower && !isPrerolls && !isWellness && Boolean(item[3] || item[4]));
      if (isWellness) {
        const src = wellnessVisuals[tierSlug];
        pack.innerHTML = src ? `<img class="pack-figure" src="${src}" alt="${item[1]} wellness product" width="520" height="780" decoding="async">` : '<span>DLC</span>';
      } else if (isFlower) {
        const visual = flowerTierVisuals[tierSlug];
        if (visual) {
          pack.innerHTML = `<img class="pack-figure" src="${visual.src}" srcset="${visual.small} 300w, ${visual.src} 600w" sizes="(max-width: 600px) 90px, 150px" alt="${visual.alt}" width="600" height="900" decoding="async">`;
        } else {
          pack.innerHTML = '<span>DLC</span>';
        }
      } else if (isPrerolls) {
        const visual = prerollTierVisuals[tierSlug];
        if (visual) {
          pack.innerHTML = `<img class="pack-figure" src="${visual.src}" alt="${visual.alt}" width="520" height="780" decoding="async">`;
        } else {
          pack.innerHTML = '<span>DLC</span>';
        }
      } else if (item[3]) {
        pack.innerHTML = `<img class="pack-figure" src="${escapeHtml(item[3])}" alt="${escapeHtml(item[1])}" width="520" height="780" decoding="async">`;
      } else if (item[4]) {
        // The "All ..." tile stands for the whole shelf, not one brand: cloud only, no icon.
        pack.innerHTML = '';
      } else {
        pack.innerHTML = `<span>DLC</span><small class="pack-name">${escapeHtml(item[1])}</small>`;
      }

      if (animate && !reducedMotion && typeof card.animate === 'function') {
        card.animate([
          {opacity:0, transform:'translateY(22px) scale(.96)'},
          {opacity:1, transform:getComputedStyle(card).transform}
        ], {duration:430 + i*55, easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    });
  }

  cards.forEach((card) => {
    const openCard = () => navigateWithCloud(card);
    card.addEventListener('click', openCard);
    card.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && card.dataset.href) {
        event.preventDefault();
        openCard();
      }
    });
  });

  const categoryImageSets = {
    flower: Object.values(flowerTierVisuals).map(v => window.innerWidth <= 600 ? v.small : v.src),
    prerolls: Object.values(prerollTierVisuals).map(v => v.src),
    wellness: Object.values(wellnessVisuals)
  };
  const prefetchedCategories = new Set();
  function prefetchCategory(category){
    if (prefetchedCategories.has(category)) return;
    (categoryImageSets[category] || []).forEach(prefetchImage);
    prefetchedCategories.add(category);
  }

  categories.forEach((btn) => {
    btn.addEventListener('mouseenter', () => prefetchCategory(btn.dataset.category), {once:true});
    btn.addEventListener('focus', () => prefetchCategory(btn.dataset.category), {once:true});
    btn.addEventListener('touchstart', () => prefetchCategory(btn.dataset.category), {once:true, passive:true});
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      const current = document.querySelector('.category.active')?.dataset.category;
      const targetProgress = progressForCategory(category);
      const alreadyInTargetPhase = categoryForProgress(getProgress()) === category && Math.abs(getProgress() - targetProgress) < 0.06;

      // Clicking the already-active category should not cause a flash/re-render.
      if (current === category && alreadyInTargetPhase) return;

      if (!categoryProducts[category]) { window.location.assign(`strains.html?category=more&tier=${encodeURIComponent(category)}`); return; }
      activateCategory(category, {persist:true, animate: current !== category});
      scrollToCategoryPhase(category, reducedMotion ? 'auto' : 'smooth');
    });
  });

  // Every other CDASH category with stock gets its button and up to four live
  // products, plus a card for the whole shelf. Categories with nothing in
  // stock stay hidden rather than open onto an empty table.
  window.DLCStore?.catalog().then(products => {
    const S = window.DLCStore;
    const byShelf = new Map();
    products.forEach(p => {
      const place = S.classify(p);
      if (place.category !== 'more') return;
      if (!byShelf.has(place.tier)) byShelf.set(place.tier, { label: p.productType, items: [] });
      byShelf.get(place.tier).items.push(p);
    });
    let shown = 0;
    categories.filter(b => b.hasAttribute('data-extra')).forEach(btn => {
      const shelf = byShelf.get(btn.dataset.category);
      btn.hidden = !shelf;
      if (!shelf) return;
      shown++;
      const label = shelf.label.toUpperCase();
      const picks = [...shelf.items].sort((a, b) => b.availableQuantity - a.availableQuantity);
      const count = picks.length >= 4 ? 4 : picks.length >= 2 ? 2 : 1;
      categoryProducts[btn.dataset.category] = [
        ...picks.slice(0, count).map(p => [label, p.name, S.productUrl(p), S.imageFor(p)]),
        [label, `All ${shelf.label.toLowerCase()}`, S.collectionUrl('more', btn.dataset.category), null, `VIEW ALL ${shelf.items.length} →`],
      ];
    });
    document.querySelector('.category-row')?.classList.toggle('is-extended', shown > 0);
    // Scroll order = the row's order, so scrolling walks the row left to right.
    categoryOrder = categories.filter(b => !b.hidden && categoryProducts[b.dataset.category]).map(b => b.dataset.category);
    const saved = getSavedLoungeState();
    fitExperienceHeight();
    // A member coming back to a category further along lands on it again.
    if (sessionStorage.getItem(RETURN_KEY) !== '1' && saved?.category && !CORE_CATEGORIES.includes(saved.category) && categoryProducts[saved.category] && window.scrollY > experience.offsetTop) {
      scrollToCategoryPhase(saved.category, 'auto');
    }
    if (!rafId) render();
  }).catch(() => {});

  const savedState = getSavedLoungeState();
  const initialCategory = isExplicitHomeEntry || !CORE_CATEGORIES.includes(savedState?.category) ? 'flower' : savedState.category;
  categories.forEach(b => { const active = b.dataset.category === initialCategory; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  renderCategory(initialCategory, false);
  scrollDrivenCategory = initialCategory;

  if (isExplicitHomeEntry) {
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({top:0, left:0, behavior:'auto'})));
  }

  // When returning from a collection/product page, restore the exact lounge/table position
  // rather than replaying the homepage experience from the beginning.
  if (!isExplicitHomeEntry && sessionStorage.getItem(RETURN_KEY) === '1' && savedState) {
    sessionStorage.removeItem(RETURN_KEY);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const phaseProgress = progressForCategory(savedState.category);
        const fallbackTarget = experience.offsetTop + (experience.offsetHeight - window.innerHeight) * phaseProgress;
        const savedTarget = Number.isFinite(savedState.scrollY) && savedState.scrollY > experience.offsetTop ? savedState.scrollY : fallbackTarget;
        window.scrollTo({top: savedTarget, behavior: 'auto'});
      });
    });
  }

  function scheduleResponsiveVideoCheck(){
    clearTimeout(sourceSwapTimer);
    sourceSwapTimer = setTimeout(() => {
      const before = activeVideoProfile;
      applyResponsiveVideoSource(false);
      fitExperienceHeight();
      if (before === activeVideoProfile) {
        currentTime = Math.min(currentTime, getScrubEnd());
        targetTime = Math.min(targetTime, getScrubEnd());
      }
    }, 180);
  }
  window.addEventListener('resize', scheduleResponsiveVideoCheck, {passive:true});
  window.addEventListener('orientationchange', scheduleResponsiveVideoCheck);

  // Safari/Chrome may restore the lounge from the back-forward cache. Remove
  // transition classes immediately so returning users land back at the table.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted || document.documentElement.classList.contains('dlc-transition-active')) {
      resetCloudTransition();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && rafId) cancelAnimationFrame(rafId);
    if (!document.hidden && !navigationTransitioning) render();
  });

  let stageVisible = true;
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      stageVisible = entry.isIntersecting;
      if (stageVisible && !rafId) render();
      if (!stageVisible && rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }, {rootMargin:'200px 0px'});
    observer.observe(experience);
  }

  render();
})();
