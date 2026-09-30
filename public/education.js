/*
 * DLC Decoder, site search, guidance mode and recently viewed.
 *
 * The decoder is a plain-language reference that never gets in the way of
 * shopping: open it from the ? button, any [data-open-education] trigger, the
 * ? key, or a #decoder-<topic> link. Its "For you" tab explains whatever is on
 * screen — on a product page that is the actual CDASH product type — and the
 * tier ladder reads live stock from DLCStore when the member is signed in.
 */
(() => {
  const GUIDANCE_KEY = 'dlc_guidance_enabled_v1';
  const RECENT_KEY = 'dlc_recent_products_v1';
  const TOPIC_KEY = 'dlc_decoder_topic_v1';
  const S = window.DLCStore;
  const body = document.body;
  const params = new URLSearchParams(location.search);
  const onProduct = body.classList.contains('product-page');
  const onCollection = body.classList.contains('strains-page');
  const category = params.get('category') || (onProduct || onCollection ? 'flower' : '');
  const tier = params.get('tier') || '';
  const categoryLabel = category === 'prerolls' ? 'Prerolls' : category === 'wellness' ? 'Wellness' : category === 'flower' ? 'Flower' : category === 'more' ? 'More' : '';
  const tierLabel = tier && tier !== 'wellness' ? tier.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let lastFocus = null;
  // Preference storage is opt-in (cookies.js). Without it, choices last for this page only.
  const mayRemember = () => !!window.DLCConsent?.allows('preferences');

  // ── Content ──────────────────────────────────────────────────────────────
  // Each item: [term, explanation, optional { href, label } to browse it].
  const shelf = (href, label) => ({ href, label });

  const FORMATS = {
    flower: ['FLOWER', 'Dried cannabis flower, available loose by the gram. At DLC it is graded by how it was cultivated — see the tier guide.', shelf('strains.html?category=flower', 'Browse flower')],
    prerolls: ['PREROLLS', 'Cannabis flower already ground and rolled, ready to use. Graded by the same cultivation tiers as flower.', shelf('strains.html?category=prerolls', 'Browse prerolls')],
    moonsticks: ['MOONSTICKS', 'A preroll boosted with concentrate — typically flower infused or coated with extract. Noticeably stronger than a standard preroll, so treat one as more than one.', shelf('strains.html?category=more&tier=moonsticks', 'Browse moonsticks')],
    shooters: ['SHOOTERS', 'A smaller-format DLC roll, listed by cultivation tier like flower. Ask the team for the current size.', shelf('strains.html?category=more&tier=shooters', 'Browse shooters')],
    edibles: ['EDIBLES', 'Cannabis in food — gummies, chocolates, baked goods. Eaten cannabis is processed by the liver, so it takes longer to arrive and lasts longer than smoking.', shelf('strains.html?category=more&tier=edibles', 'Browse edibles')],
    vapes: ['VAPES', 'Cartridges of cannabis oil heated by a battery rather than burned. Carts need a compatible battery, found under accessories.', shelf('strains.html?category=more&tier=vapes', 'Browse vapes')],
    concentrates: ['CONCENTRATES', 'Extracts that keep the cannabinoids and terpenes and leave most of the plant behind. Much stronger per gram than flower — see the concentrates glossary.', shelf('strains.html?category=more&tier=concentrates', 'Browse concentrates')],
    'dab-hits': ['DAB HITS', 'A single serving of concentrate, prepared for you in the lounge rather than taken home in bulk.', shelf('strains.html?category=more&tier=dab-hits', 'See dab hits')],
    wellness: ['WELLNESS', 'Non-smoking cannabinoid formats — capsules, oils and balms — with a measured amount per serving printed on the product.', shelf('strains.html?category=wellness&tier=wellness', 'Browse wellness')],
    drinks: ['DRINKS', 'Soft drinks, energy drinks and water for the lounge.', shelf('strains.html?category=more&tier=drinks', 'See drinks')],
    'rolling-papers': ['PAPERS & ACCESSORIES', 'Rolling papers, trays, grinders, lighters and vape batteries.', shelf('strains.html?category=more&tier=accessories', 'See accessories')],
  };
  FORMATS.accessories = FORMATS['rolling-papers'];

  const TIER_INFO = {
    outdoor: 'Grown outdoors in natural sun and weather. The most accessible tier.',
    greenhouse: 'Grown under glass: natural light with more control over conditions than open outdoor growing.',
    'executive-greenhouse': 'DLC’s premium greenhouse selection, graded to DLC’s own internal standard.',
    indoor: 'Grown fully indoors, with light, temperature and humidity closely controlled.',
    hydro: 'Grown hydroponically — roots fed through a water-based nutrient system instead of soil. The top of the DLC tier range.',
  };
  const TIER_ORDER = ['outdoor', 'greenhouse', 'executive-greenhouse', 'indoor', 'hydro'];
  const TIER_NAMES = { outdoor: 'Outdoor', greenhouse: 'Greenhouse', 'executive-greenhouse': 'Executive Greenhouse', indoor: 'Indoor', hydro: 'Hydro' };

  const CONCENTRATE_TERMS = {
    shatter: ['SHATTER', 'Glass-like, brittle and translucent. Snaps rather than bends.'],
    badder: ['BADDER', 'Whipped to a soft, cake-batter texture. Easy to scoop.'],
    crumble: ['CRUMBLE', 'Dry and crumbly, somewhere between wax and powder.'],
    honeycomb: ['HONEYCOMB', 'A porous, sponge-like wax with a honeycomb pattern.'],
    diamonds: ['DIAMONDS', 'Crystals of near-pure THCA, often presented in terpene-rich “sauce”. Among the strongest formats.'],
    'live-rosin': ['LIVE ROSIN', 'Pressed from fresh-frozen plants using only heat and pressure — no solvents. Prized for flavour.'],
    'live-resin': ['LIVE RESIN', 'Extracted from fresh-frozen plants, keeping more of the original aroma than dried-plant extracts.'],
    'thc-shot': ['THC SHOT', 'A measured liquid serving. Absorbed like an edible — allow time before judging the effect.'],
  };

  const topics = {
    basics: {
      tab: 'Basics',
      title: 'CANNABIS 101',
      copy: 'The handful of words that come up everywhere on the DLC site.',
      items: [
        ['THC', 'The cannabinoid behind the “high”. A bigger number is not automatically a better experience.'],
        ['CBD', 'A cannabinoid that does not produce the intoxicating effect of THC. Common in the wellness range.'],
        ['TERPENES', 'Aromatic compounds that give each strain its smell and flavour — citrus, pine, earth, fuel.'],
        ['STRAIN', 'A named variety of the plant, like Gorilla Glue or Blue Dream. Names describe genetics, not potency.'],
        ['TIER', 'How DLC flower and prerolls were cultivated: Outdoor, Greenhouse, Executive Greenhouse, Indoor or Hydro.', shelf('#decoder-tiers', 'Open the tier guide')],
        ['FORMAT', 'The form it comes in — flower, preroll, edible, vape, concentrate, wellness.', shelf('#decoder-formats', 'See every format')],
      ],
    },
    formats: {
      tab: 'Formats',
      title: 'EVERY FORMAT ON THE SHELF',
      copy: 'Same plant, very different experiences. Choose the format that matches what you actually want.',
      items: ['flower', 'prerolls', 'moonsticks', 'shooters', 'edibles', 'vapes', 'concentrates', 'dab-hits', 'wellness', 'drinks', 'rolling-papers'].map(key => FORMATS[key]),
    },
    tiers: {
      tab: 'Tiers',
      title: 'UNDERSTANDING DLC TIERS',
      copy: 'Tiers describe how flower was grown, from Outdoor up to Hydro. They say a lot about care and consistency — not the exact potency of one product.',
      ladder: true,
      items: [],
    },
    concentrates: {
      tab: 'Concentrates',
      title: 'CONCENTRATES, DECODED',
      copy: 'All concentrates are stronger per gram than flower. The names describe texture and how they were made.',
      items: Object.values(CONCENTRATE_TERMS),
    },
    potency: {
      tab: 'THC & CBD',
      title: 'THC, CBD & POTENCY',
      copy: 'Potency is most useful when it comes from the tested product itself. Where the site says “Confirm in store”, the team has the current figures.',
      items: [
        ['THC', 'Associated with the intoxicating effects of cannabis. Individual response varies a lot.'],
        ['CBD', 'Not intoxicating in the way THC is. Often paired with THC or used on its own in wellness products.'],
        ['% VS MG', 'Flower lists a percentage of the dried weight. Edibles and wellness list milligrams per serving — easier to measure.'],
        ['WHY NUMBERS AREN’T EVERYTHING', 'Terpenes, format, tolerance and setting all shape the experience. The highest number is not the “best”.'],
      ],
    },
    buying: {
      tab: 'Exchanges',
      title: 'HOW EXCHANGES AT DLC WORK',
      copy: 'The online store is for registered DLC members. Here is the whole flow, start to finish.',
      items: [
        ['YOUR MEMBER ID', 'The DLC-1234-56 number from the lounge. It is how DLC knows you, your bag and your exchanges.', shelf('/account', 'Your account')],
        ['YOUR BAG', 'Saved to your Member ID, so it follows you across devices. Credits and stock are live from the lounge.', shelf('/bag', 'Open your bag')],
        ['NOTHING SETTLED ONLINE', 'Sending an exchange request passes it to the DLC team. They confirm the credits and settle the exchange with you at hand-over.'],
        ['CASH OR CARD', 'Your member discount depends on how you settle, so your bag shows both totals. Settling in cash comes out a little lower.'],
        ['DLC CREDITS', 'If you have credits, you can put them toward an exchange — up to a share of the bag, shown when you review it.'],
        ['POINTS', 'Earned on what you actually settle, once the exchange is complete.'],
      ],
    },
    care: {
      tab: 'Start low',
      title: 'START LOW, GO SLOW',
      copy: 'A few habits that make any session better, whatever you choose.',
      items: [
        ['NEW OR RETURNING?', 'Begin with a small amount and a lower-tier or lower-strength product. You can always have more; you cannot have less.'],
        ['EDIBLES TAKE TIME', 'Effects can take 30 minutes to 2 hours to arrive and last several hours. Wait before having more.'],
        ['STRONGER FORMATS', 'Moonsticks, dab hits and concentrates hit harder than flower. Pace yourself accordingly.'],
        ['DON’T MIX & DRIVE', 'Avoid combining with alcohol, and never drive or operate machinery under the influence.'],
        ['STORE IT SAFELY', 'Keep products sealed and out of reach of children and pets — edibles especially look like ordinary sweets.'],
      ],
    },
  };
  const ALIASES = { categories: 'formats', 'current-product': 'context', learn: 'basics' };
  const TAB_ORDER = ['context', 'basics', 'formats', 'tiers', 'concentrates', 'potency', 'buying', 'care'];

  // ── Context ("For you") ──────────────────────────────────────────────────
  let contextProduct = null;
  // CDASH grades can carry the tier inside a longer label ("Executive
  // Greenhouse Dab Infused"), so look for the longest tier name within it.
  const tierInGrade = grade => {
    const g = String(grade || '').toLowerCase().replace('hydroponic', 'hydro');
    return [...TIER_ORDER].sort((a, b) => b.length - a.length).find(key => g.includes(TIER_NAMES[key].toLowerCase())) || null;
  };
  function formatKeyFor(product) {
    const type = S ? S.slugify(product.productType) : '';
    if (/flower|bud/.test(type)) return 'flower';
    if (/pre-?roll/.test(type)) return 'prerolls';
    if (/wellness/.test(type)) return 'wellness';
    return FORMATS[type] ? type : null;
  }
  function contextTopic() {
    if (contextProduct) {
      const p = contextProduct;
      const place = S.classify(p);
      const formatKey = formatKeyFor(p);
      const items = [];
      if (formatKey) items.push(FORMATS[formatKey]);
      const tierKey = (place.category === 'flower' || place.category === 'prerolls') ? place.tier : tierInGrade(p.grade);
      if (tierKey) items.push([`${TIER_NAMES[tierKey].toUpperCase()} TIER`, TIER_INFO[tierKey], shelf('#decoder-tiers', 'Compare all tiers')]);
      const conc = CONCENTRATE_TERMS[S.slugify(p.grade)];
      if (conc) items.push(conc);
      if (/moonstick|dab|concentrate/.test(S.slugify(p.productType))) items.push(topics.care.items[2]);
      if (/edible/.test(S.slugify(p.productType)) || S.slugify(p.grade) === 'thc-shot') items.push(topics.care.items[1]);
      items.push(['POTENCY', 'Tested THC and CBD figures for this exact product are available from the team in store.']);
      return { title: `WHAT IS ${p.name.toUpperCase()}?`, copy: `${p.name} is listed as ${p.productType}${p.grade ? ` · ${p.grade}` : ''}. Here is what that means.`, items };
    }
    if (onCollection && category === 'more' && tier) {
      const f = FORMATS[tier];
      return { title: f ? `ABOUT ${f[0]}` : 'THIS SHELF', copy: 'What you are browsing right now.', items: f ? [f, topics.care.items[0]] : topics.basics.items };
    }
    if ((onCollection || onProduct) && category) {
      const f = FORMATS[category] || FORMATS.flower;
      const items = [f];
      if (tierLabel && TIER_INFO[tier]) items.push([`${tierLabel.toUpperCase()} TIER`, TIER_INFO[tier], shelf('#decoder-tiers', 'Compare all tiers')]);
      if (category === 'wellness') items.push(topics.potency.items[2]);
      return { title: category === 'wellness' ? 'ABOUT WELLNESS' : `ABOUT ${tierLabel ? tierLabel.toUpperCase() + ' ' : ''}${categoryLabel.toUpperCase()}`, copy: 'What you are browsing right now.', items };
    }
    return { title: 'WELCOME TO THE DECODER', copy: 'Plain-language answers for anything on the DLC site. Pick a topic above, or search for a term.', items: [topics.basics.items[4], topics.basics.items[5], topics.buying.items[2], topics.care.items[0]] };
  }
  topics.context = { tab: 'For you', dynamic: true };

  // ── Sheet ────────────────────────────────────────────────────────────────
  const sheet = document.createElement('div');
  sheet.className = 'education-overlay';
  sheet.id = 'educationOverlay';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `<section class="education-sheet decoder" role="dialog" aria-modal="true" aria-labelledby="educationTitle">
    <div class="decoder__head">
      <div class="education-sheet__top"><div><div class="education-sheet__eyebrow">DLC DECODER</div><h2 id="educationTitle">CANNABIS 101</h2></div><button class="education-close" type="button" aria-label="Close the DLC Decoder">×</button></div>
      <label class="decoder__search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Look up a term — e.g. hydro, badder, edibles" aria-label="Search the DLC Decoder" autocomplete="off"></label>
      <div class="decoder__tabs" role="tablist" aria-label="Decoder topics">${TAB_ORDER.map(key => `<button type="button" role="tab" data-topic="${key}" aria-selected="false">${topics[key].tab}</button>`).join('')}</div>
    </div>
    <div class="decoder__body" id="decoderBody">
      <p class="education-sheet__copy" id="educationCopy"></p>
      <div class="decoder__ladder" id="decoderLadder" hidden></div>
      <div class="education-list" id="educationList"></div>
    </div>
    <div class="guidance-toggle"><div><strong>GUIDANCE MODE</strong><small>Show extra explanations while you browse. You can switch this off at any time.</small></div><button class="guidance-switch" id="guidanceSwitch" type="button" aria-pressed="false" aria-label="Toggle guidance mode"><span></span></button></div>
  </section>`;
  document.body.appendChild(sheet);

  const decoder = document.createElement('button');
  decoder.className = 'dlc-decoder-btn';
  decoder.type = 'button';
  decoder.setAttribute('aria-label', 'Open the DLC Decoder (press ? on your keyboard)');
  decoder.setAttribute('aria-haspopup', 'dialog');
  decoder.textContent = '?';
  document.body.appendChild(decoder);

  const titleEl = sheet.querySelector('#educationTitle');
  const copyEl = sheet.querySelector('#educationCopy');
  const listEl = sheet.querySelector('#educationList');
  const ladderEl = sheet.querySelector('#decoderLadder');
  const searchEl = sheet.querySelector('.decoder__search input');
  const tabs = [...sheet.querySelectorAll('[data-topic]')];
  let currentTopic = 'context';

  function itemHtml([term, copy, link], meta) {
    const action = link ? `<a class="decoder__link" href="${esc(link.href)}"${link.href.startsWith('#decoder-') ? ' data-decoder-jump' : ''}>${esc(link.label)} →</a>` : '';
    return `<div class="education-item">${meta ? `<span class="decoder__meta">${esc(meta)}</span>` : ''}<strong>${esc(term)}</strong><p>${esc(copy)}</p>${action}</div>`;
  }

  // Live counts and "from" prices per tier, when the catalogue is available.
  let tierStats = null;
  if (S && window.DLCGate) {
    window.DLCGate.ready.then(() => S.catalog()).then(products => {
      tierStats = {};
      products.forEach(p => {
        const place = S.classify(p);
        if (place.category !== 'flower' && place.category !== 'prerolls') return;
        const s = tierStats[place.tier] ||= { flower: 0, prerolls: 0, from: Infinity };
        s[place.category]++;
        if (place.category === 'flower') s.from = Math.min(s.from, p.price);
      });
      if (currentTopic === 'tiers' && sheet.classList.contains('is-open')) renderTopic('tiers');
      const id = params.get('id');
      if (onProduct && id) {
        contextProduct = products.find(p => p.id === id) || null;
        if (contextProduct && currentTopic === 'context' && sheet.classList.contains('is-open')) renderTopic('context');
      }
    }).catch(() => {});
  }

  function renderLadder() {
    const activeTier = TIER_ORDER.includes(tier) ? tier : (contextProduct ? tierInGrade(contextProduct.grade) : '');
    ladderEl.innerHTML = TIER_ORDER.map((key, i) => {
      const stats = tierStats?.[key];
      const stock = !tierStats ? '' : stats ? `${stats.flower} flower · ${stats.prerolls} ${stats.prerolls === 1 ? 'preroll' : 'prerolls'}${Number.isFinite(stats.from) ? ` · from ${S.price(stats.from)}` : ''}` : 'Nothing on the shelf right now';
      return `<a class="decoder__rung${key === activeTier ? ' is-current' : ''}" href="strains.html?category=flower&tier=${key}" style="--rung:${i}">
        <span class="decoder__rung-step">${String(i + 1).padStart(2, '0')}</span>
        <span class="decoder__rung-copy"><strong>${TIER_NAMES[key].toUpperCase()}${key === activeTier ? ' <em>YOU ARE HERE</em>' : ''}</strong><small>${esc(TIER_INFO[key])}</small>${stock ? `<i>${esc(stock)}</i>` : ''}</span>
        <span class="decoder__rung-go" aria-hidden="true">→</span></a>`;
    }).join('');
  }

  function renderTopic(key) {
    key = ALIASES[key] || key;
    if (!topics[key]) key = 'basics';
    currentTopic = key;
    if (mayRemember()) try { sessionStorage.setItem(TOPIC_KEY, key); } catch (e) {}
    const topic = topics[key].dynamic ? contextTopic() : topics[key];
    searchEl.value = '';
    titleEl.textContent = topic.title;
    copyEl.textContent = topic.copy;
    ladderEl.hidden = !topic.ladder;
    if (topic.ladder) renderLadder();
    listEl.innerHTML = (topic.items || []).map(item => itemHtml(item)).join('');
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.topic === key)));
    sheet.querySelector(`[data-topic="${key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    sheet.querySelector('#decoderBody').scrollTop = 0;
  }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) { renderTopic(currentTopic); return; }
    const seen = new Set();
    const matches = [];
    TAB_ORDER.filter(key => !topics[key].dynamic).forEach(key => {
      topics[key].items.forEach(item => {
        if (seen.has(item[0])) return;
        if (`${item[0]} ${item[1]}`.toLowerCase().includes(q)) { seen.add(item[0]); matches.push([item, topics[key].tab]); }
      });
    });
    TIER_ORDER.forEach(key => {
      if (`${TIER_NAMES[key]} ${TIER_INFO[key]}`.toLowerCase().includes(q) && !seen.has(key)) matches.push([[`${TIER_NAMES[key].toUpperCase()} TIER`, TIER_INFO[key], shelf(`strains.html?category=flower&tier=${key}`, `Browse ${TIER_NAMES[key]}`)], 'Tiers']);
    });
    titleEl.textContent = `“${query.trim().toUpperCase()}”`;
    copyEl.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'answer' : 'answers'} in the decoder.` : '';
    ladderEl.hidden = true;
    tabs.forEach(tab => tab.setAttribute('aria-selected', 'false'));
    listEl.innerHTML = matches.length
      ? matches.map(([item, meta]) => itemHtml(item, meta)).join('')
      : `<div class="decoder__empty"><strong>Nothing for that yet.</strong><p>Try a broader word like “flower”, “edibles” or “tier” — or ask the DLC team in the lounge.</p></div>`;
  }
  searchEl.addEventListener('input', () => renderSearchResults(searchEl.value));

  function openEducation(key) {
    if (!sheet.classList.contains('is-open')) lastFocus = document.activeElement;
    renderTopic(key || (onProduct || onCollection ? 'context' : (() => { try { return sessionStorage.getItem(TOPIC_KEY) || 'context'; } catch (e) { return 'context'; } })()));
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('education-open');
    decoder.setAttribute('aria-expanded', 'true');
    setTimeout(() => (sheet.querySelector('[aria-selected="true"]') || sheet.querySelector('.education-close')).focus(), 30);
  }
  function closeEducation() {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('education-open');
    decoder.setAttribute('aria-expanded', 'false');
    if (location.hash.startsWith('#decoder')) history.replaceState(null, '', location.pathname + location.search);
    lastFocus?.focus?.();
  }

  decoder.addEventListener('click', () => openEducation());
  sheet.querySelector('.education-close').addEventListener('click', closeEducation);
  sheet.addEventListener('click', e => {
    if (e.target === sheet) { closeEducation(); return; }
    const tab = e.target.closest('[data-topic]');
    if (tab) { renderTopic(tab.dataset.topic); return; }
    const jump = e.target.closest('[data-decoder-jump]');
    if (jump) { e.preventDefault(); renderTopic(jump.getAttribute('href').replace('#decoder-', '')); }
  });
  // Arrow keys move between topic tabs, as a tablist should.
  sheet.querySelector('.decoder__tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    renderTopic(next.dataset.topic);
  });
  sheet.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button,a[href],input')].filter(el => el.offsetParent !== null);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-open-education]');
    if (!trigger) return;
    e.preventDefault();
    openEducation(trigger.dataset.openEducation || 'basics');
  });
  const openFromHash = () => { if (location.hash.startsWith('#decoder')) openEducation(location.hash.replace(/^#decoder-?/, '') || undefined); };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  // ── Guidance mode ────────────────────────────────────────────────────────
  const guidanceSwitch = sheet.querySelector('#guidanceSwitch');
  let guidanceThisPage = false;
  const getGuidance = () => { if (!mayRemember()) return guidanceThisPage; try { return localStorage.getItem(GUIDANCE_KEY) === 'yes'; } catch (e) { return false; } };
  const updateGuidanceHint = enabled => {
    const hint = document.getElementById('productGuidanceHint');
    const collectionHint = document.getElementById('collectionGuidanceHint');
    if (collectionHint) {
      if (!enabled) collectionHint.hidden = true;
      else {
        const ctext = category === 'wellness'
          ? 'Guidance is on: Wellness contains non-smoking cannabinoid-focused formats. Open any product for its specific format and measured serving information.'
          : category === 'more'
          ? 'Guidance is on: this shelf holds every other format — edibles, vapes, concentrates and more. Open the DLC Decoder’s Formats tab for what each one is.'
          : `Guidance is on: you are browsing ${categoryLabel} in the ${tierLabel || 'selected'} cultivation tier. Tap “What do these tiers mean?” whenever you want the cultivation terms explained.`;
        collectionHint.innerHTML = `<strong>GUIDANCE MODE</strong> ${ctext}`;
        collectionHint.hidden = false;
      }
    }
    if (!hint) return;
    if (!enabled) { hint.hidden = true; return; }
    const text = category === 'wellness'
      ? 'Guidance is on: this is a wellness-format product. Use the measured serving information on this page and open the DLC Decoder whenever a term is unfamiliar.'
      : category === 'prerolls'
      ? `Guidance is on: this is a preroll from the ${tierLabel || 'selected'} tier. The cultivation tier and product format are separate pieces of information.`
      : category === 'more'
      ? 'Guidance is on: tap “What is this?” for a plain-language explanation of this exact format.'
      : `Guidance is on: this is flower from the ${tierLabel || 'selected'} tier. Cultivation tier does not by itself tell you the exact potency or experience.`;
    hint.innerHTML = `<strong>NEW TO THIS?</strong> ${text}`;
    hint.hidden = false;
  };
  const setGuidance = enabled => {
    guidanceThisPage = enabled;
    if (mayRemember()) try { localStorage.setItem(GUIDANCE_KEY, enabled ? 'yes' : 'no'); } catch (e) {}
    guidanceSwitch.setAttribute('aria-pressed', String(enabled));
    document.documentElement.classList.toggle('guidance-enabled', enabled);
    updateGuidanceHint(enabled);
  };
  setGuidance(getGuidance());
  guidanceSwitch.addEventListener('click', () => setGuidance(!getGuidance()));

  // ── Site search ──────────────────────────────────────────────────────────
  const search = document.createElement('div');
  search.className = 'search-overlay';
  search.setAttribute('aria-hidden', 'true');
  search.innerHTML = `<div class="search-shell" role="dialog" aria-modal="true" aria-labelledby="searchTitle"><div class="search-top"><h2 id="searchTitle">FIND IT FAST.</h2><button class="search-close" type="button" aria-label="Close search">×</button></div><input class="search-input" type="search" placeholder="Search products, categories or tiers…" aria-label="Search DLC"><div class="search-results" aria-live="polite"></div></div>`;
  document.body.appendChild(search);

  const navActions = document.querySelector('.nav-actions');
  if (navActions) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'nav-search-btn'; btn.textContent = 'SEARCH'; btn.setAttribute('aria-label', 'Search DLC');
    navActions.insertBefore(btn, navActions.firstChild);
    btn.addEventListener('click', () => openSearch());
  }

  // Categories and tiers are always searchable; live products join them once
  // the member's catalogue has loaded (see store.js).
  const searchData = [
    ['FLOWER', 'CATEGORY', 'strains.html?category=flower'], ['PREROLLS', 'CATEGORY', 'strains.html?category=prerolls'], ['WELLNESS', 'CATEGORY', 'strains.html?category=wellness&tier=wellness'], ['MORE', 'CATEGORY', 'strains.html?category=more'],
    ...TIER_ORDER.map(key => [TIER_NAMES[key].toUpperCase(), 'FLOWER TIER', `strains.html?category=flower&tier=${key}`]),
  ];
  if (S) {
    S.catalog().then(products => {
      const seen = new Set();
      products.forEach(p => {
        const place = S.classify(p);
        if (place.category === 'more' && !seen.has(place.tier)) {
          seen.add(place.tier);
          searchData.push([p.productType.toUpperCase(), 'CATEGORY', S.collectionUrl('more', place.tier)]);
        }
        searchData.push([p.name.toUpperCase(), `${p.productType}${p.grade ? ' · ' + p.grade : ''} · ${S.price(p.price)}`.toUpperCase(), S.productUrl(p)]);
      });
      if (search.classList.contains('is-open')) renderSearch(input.value);
    }).catch(() => {});
  }
  const input = search.querySelector('.search-input'), results = search.querySelector('.search-results');
  function renderSearch(q = '') {
    const query = q.trim().toLowerCase();
    const matches = (query ? searchData.filter(x => `${x[0]} ${x[1]}`.toLowerCase().includes(query)) : searchData.slice(0, 8)).slice(0, 10);
    const decoderHint = query ? `<button type="button" class="search-result search-result--decoder" data-search-decoder><div><span>DLC DECODER</span><strong>WHAT IS “${esc(q.trim().toUpperCase())}”?</strong></div><em>?</em></button>` : '';
    results.innerHTML = (matches.length ? matches.map(x => `<a class="search-result" href="${esc(x[2])}"><div><span>${esc(x[1])}</span><strong>${esc(x[0])}</strong></div><em>→</em></a>`).join('') : '<div class="search-empty">No matching DLC products or categories found.</div>') + decoderHint;
  }
  function openSearch() { lastFocus = document.activeElement; renderSearch(''); search.classList.add('is-open'); search.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('search-open'); setTimeout(() => input.focus(), 20); }
  function closeSearch() { search.classList.remove('is-open'); search.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('search-open'); lastFocus?.focus?.(); }
  input.addEventListener('input', () => renderSearch(input.value));
  search.querySelector('.search-close').addEventListener('click', closeSearch);
  // "What is X?" hands the query straight to the decoder's term search.
  results.addEventListener('click', e => {
    if (!e.target.closest('[data-search-decoder]')) return;
    const q = input.value;
    closeSearch();
    openEducation('basics');
    searchEl.value = q;
    renderSearchResults(q);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (search.classList.contains('is-open')) closeSearch();
      else if (sheet.classList.contains('is-open')) closeEducation();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if (e.key === '?' && !typing && !document.documentElement.classList.contains('age-gate-active') && !search.classList.contains('is-open')) {
      e.preventDefault();
      if (sheet.classList.contains('is-open')) closeEducation(); else openEducation();
    }
  });

  // ── Recently viewed ──────────────────────────────────────────────────────
  // Local to this browser, no account required. Waits for the live product to
  // be painted so it records the real name and image, not the loading state.
  if (onProduct) {
    const record = () => {
      const productTitle = document.getElementById('productTitle');
      const image = document.querySelector('#productVisual img');
      if (!productTitle || !image || productTitle.textContent.trim() === 'Loading…') return false;
      const current = { name: productTitle.textContent.trim(), href: location.href, image: image.getAttribute('src'), meta: `${categoryLabel}${tierLabel ? ' / ' + tierLabel : ''}` };
      let recent = []; try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []; } catch (e) {}
      const previous = recent.filter(x => x && x.href !== current.href && x.name !== current.name).slice(0, 4);
      const mount = document.getElementById('recentlyViewed'), track = document.getElementById('recentlyViewedTrack');
      if (mount && track && previous.length) { track.innerHTML = previous.map(x => `<a class="recent-view-card" href="${esc(x.href)}"><div class="recent-view-card__art"><img src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy"></div><span>${esc(x.meta || 'DLC PRODUCT')}</span><strong>${esc(x.name)}</strong></a>`).join(''); mount.hidden = false; }
      if (mayRemember()) try { localStorage.setItem(RECENT_KEY, JSON.stringify([current, ...previous].slice(0, 5))); } catch (e) {}
      return true;
    };
    let tries = 0;
    const poll = setInterval(() => { if (record() || ++tries > 40) clearInterval(poll); }, 250);
  }
})();
