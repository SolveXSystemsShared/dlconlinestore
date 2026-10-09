/*
 * Cloudy, the member helper.
 *
 * Replaces the floating ? button. It stays out of the way until a visitor has
 * scrolled to the shelf, then settles into the corner. It answers from a fixed
 * set of approved answers about how the store works (exchanges, collection,
 * credits, rewards, the lounge). It does not take free-form advice, and it does
 * not guess: anything it cannot match points to the team at the lounge.
 *
 * The DLC Decoder (what tiers and formats mean) is still one tap away, and the
 * ? key still opens it. Where a member is signed in, Cloudy also looks up the
 * state of their latest exchange from their own session.
 *
 * Self-contained, like cookies.js: it brings its own styles so the React pages
 * share it.
 */
(() => {
  const MASCOT = '/assets/dlc-mascot-small.png';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const root = document.documentElement;
  root.classList.add('cloudy-on');

  // ── Approved answers ──────────────────────────────────────────────────────
  // text: paragraphs. links: [label, href]. run: a named action in `actions`.
  const ANSWERS = [
    {
      id: 'how', label: 'How does an exchange work?',
      words: 'exchange order bag checkout start place request settle pay card process steps',
      text: ['Add what you want to your bag, then settle by card. Once it is settled, the team prepares it and messages you when it is ready.', 'Collect it at the lounge and bring your ID.'],
      links: [['Open my bag', '/bag']],
    },
    {
      id: 'collect', label: 'Where do I collect?',
      words: 'collect collection pickup pick lounge address where deliver delivery uber ready bring id',
      text: ['Online exchanges are collection only, and we do not deliver. When the team messages you that your exchange is ready, book your own Uber to the lounge and collect it there.', 'Bring your ID.'],
      run: 'collectionPoint',
    },
    {
      id: 'status', label: 'Where is my exchange?', member: true,
      words: 'status track tracking where exchange order ready prepared preparing late waiting update latest my',
      run: 'latestExchange',
    },
    {
      id: 'credits', label: 'What are credits?',
      words: 'credits credit cost rand money currency price balance dlc',
      text: ['Everything in the store is shown in credits. Online exchanges are settled by card.', 'The DLC Credits balance on your membership is used at the lounge, not online.'],
    },
    {
      id: 'rewards', label: 'Points and rewards',
      words: 'points rewards reward tier cloud member membership discount earn benefits loyalty',
      text: ['Members earn points on exchanges, and the higher your cloud, the more comes off every exchange.', 'The lounge packages page shows what each membership gives you.'],
      links: [['See lounge packages', '/packages.html']],
    },
    {
      id: 'referral', label: 'How do referrals work?',
      words: 'referral refer friend code invite share bonus',
      text: ['Give a friend your code. They enter it when they register, and once their first exchange is complete, points are added to your account.', 'Referrals are for new members only.'],
      links: [['Referral page', '/referrals.html']],
    },
    {
      id: 'lounge', label: 'Lounge packages and specials',
      words: 'lounge package packages special specials playstation day access squad squads bundle in-store instore',
      text: ['The lounge has memberships, day access, squads and PlayStation time. Specials are rung up at the counter, so they cannot be added to your bag online.'],
      links: [['Lounge packages', '/packages.html'], ['In-store specials', '/specials.html']],
    },
    {
      id: 'decoder', label: 'What do tiers and formats mean?',
      words: 'tier tiers format formats flower preroll prerolls hydro indoor outdoor greenhouse edibles vapes concentrates wellness decoder meaning mean explain what',
      text: ['The DLC Decoder explains the cultivation tiers and every format, in plain language.'],
      run: 'decoder',
    },
    {
      id: 'signin', label: 'I cannot sign in',
      words: 'sign login log pin otp sms code member id number forgot cannot cant register join',
      text: ['Use the Member ID registered at the lounge. The PIN is sent by SMS to the South African number on your membership.', 'If your number has changed, the team at the lounge can update it. New here? You can register online.'],
      links: [['Register', '/register']],
    },
    {
      id: 'app', label: 'Install the app and get updates',
      words: 'app install pwa notification notifications updates push home screen phone download',
      text: ['You can add the store to your home screen and turn on updates about your exchanges.'],
      run: 'app',
    },
    {
      id: 'team', label: 'Contact the team',
      words: 'contact team phone call number help support talk speak human someone staff',
      text: ['The team at the lounge can help with anything I cannot.'],
      run: 'collectionPoint',
    },
  ];

  const FALLBACK = 'I am not sure about that one. The team at the lounge can help, or pick a topic below.';

  // ── Actions that need the page or the server ──────────────────────────────
  const STATUS_TEXT = {
    draft: 'is still being put together.',
    pending_payment: 'is waiting for you to settle it by card. Open it to finish.',
    paid: 'is settled. The team will prepare it next.',
    preparing: 'is being prepared by the team.',
    ready: 'is ready to collect at the lounge.',
    out_for_delivery: 'is on its way.',
    completed: 'has been collected.',
    cancelled: 'was cancelled.',
  };

  const actions = {
    async collectionPoint(add) {
      try {
        const response = await fetch('/api/collection-point');
        const data = response.ok ? await response.json() : null;
        const point = data && data.collectionPoint;
        if (point && point.name) {
          add({ text: [`You collect from ${point.name}${point.address ? `, ${point.address}` : ''}.${point.phone ? ` You can reach the team on ${point.phone}.` : ''}`] });
          return;
        }
      } catch (e) {}
      add({ text: ['Ask the team at the lounge where to collect. Sign in to see the lounge details.'] });
    },
    async latestExchange(add) {
      try {
        const response = await fetch('/api/orders?period=3m');
        if (response.status === 401) return add({ text: ['Sign in with your Member ID and I can look up your latest exchange.'] });
        const data = response.ok ? await response.json() : null;
        const latest = data && data.orders && data.orders[0];
        if (!latest) return add({ text: ['You have no exchanges in the last three months.'], links: [['Browse the shelf', '/strains.html']] });
        const state = STATUS_TEXT[latest.status] || 'is with the team.';
        add({ text: [`Your latest exchange, ${latest.orderNumber}, ${state}`], links: [['Open it', `/exchange/${latest.id}`]] });
      } catch (e) {
        add({ text: ['I could not look that up just now. Your exchanges are on your account page.'], links: [['My account', '/account']] });
      }
    },
    decoder(add) {
      const trigger = document.querySelector('.dlc-decoder-btn');
      if (trigger) { closePanel(); trigger.click(); return; }
      add({ links: [['Open the DLC Decoder', '/#decoder-tiers']] });
    },
    app(add) {
      if (window.DLCApp) { closePanel(); window.DLCApp.open(); return; }
      add({ text: ['Open the store in your phone browser, then use its menu to add it to your home screen.'] });
    },
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
  html.cloudy-on .dlc-decoder-btn{display:none!important}
  .cloudy-fab{position:fixed;z-index:1250;right:max(14px,env(safe-area-inset-right));bottom:calc(var(--float-gap,max(18px,env(safe-area-inset-bottom))) + var(--float-lift,0px));width:62px;height:62px;border-radius:50%;border:2px solid #fff;padding:0;cursor:pointer;background:#41a8fc url(${MASCOT}) center 6%/78% no-repeat;box-shadow:0 14px 34px rgba(26,110,240,.38);opacity:0;transform:translateY(16px) scale(.8);pointer-events:none;transition:opacity .3s ease,transform .3s ease,bottom .25s ease}
  .cloudy-fab.is-shown{opacity:1;transform:none;pointer-events:auto}
  .cloudy-fab:hover{transform:translateY(-2px) scale(1.04)}
  .cloudy-fab[aria-expanded="true"]{opacity:0;pointer-events:none}
  .cloudy-hello{position:fixed;z-index:1250;right:max(14px,env(safe-area-inset-right));bottom:calc(var(--float-gap,max(18px,env(safe-area-inset-bottom))) + var(--float-lift,0px) + 74px);max-width:210px;padding:10px 14px;border-radius:16px 16px 4px 16px;background:#fff;color:#06213d;font-weight:700;font-size:13px;line-height:1.35;box-shadow:0 12px 30px rgba(6,33,61,.2);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .3s ease,transform .3s ease}
  .cloudy-hello.is-shown{opacity:1;transform:none}
  .cloudy{position:fixed;z-index:1260;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));width:min(380px,calc(100vw - 28px));height:min(560px,calc(100dvh - 28px));display:none;flex-direction:column;background:#fff;color:#06213d;border-radius:24px;overflow:hidden;box-shadow:0 30px 70px rgba(6,33,61,.32);font-family:inherit}
  .cloudy.is-open{display:flex}
  .cloudy__head{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#41a8fc;color:#06213d}
  .cloudy__avatar{flex:0 0 44px;width:44px;height:44px;border-radius:50%;border:2px solid #fff;background:#8ccaff url(${MASCOT}) center 6%/78% no-repeat}
  .cloudy__head strong{display:block;font-size:17px;letter-spacing:-.02em}
  .cloudy__head small{display:block;font-size:10px;font-weight:800;letter-spacing:1.1px;opacity:.8}
  .cloudy__close{margin-left:auto;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.5);color:#06213d;font-size:20px;cursor:pointer}
  .cloudy__log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f6faff;overscroll-behavior:contain}
  .cloudy__msg{max-width:88%;padding:11px 14px;border-radius:16px;font-size:14px;line-height:1.5}
  .cloudy__msg--bot{align-self:flex-start;background:#fff;border:1px solid #dbe9f7;border-bottom-left-radius:4px}
  .cloudy__msg--me{align-self:flex-end;background:#41a8fc;color:#06213d;font-weight:700;border-bottom-right-radius:4px}
  .cloudy__msg p{margin:0}.cloudy__msg p+p{margin-top:8px}
  .cloudy__msg a{display:inline-block;margin:8px 8px 0 0;color:#1a6ef0;font-weight:800;font-size:13px;text-decoration:underline;text-underline-offset:3px}
  .cloudy__chips{padding:10px 12px 4px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;border-top:1px solid #e3eefa;background:#fff;flex:0 0 auto}
  .cloudy__chips::-webkit-scrollbar{display:none}
  .cloudy__chip{flex:0 0 auto;min-height:38px;padding:0 14px;border-radius:999px;border:1px solid #cfe3f7;background:#f1f8ff;color:#06213d;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
  .cloudy__chip:hover{background:#41a8fc;border-color:#41a8fc}
  .cloudy__form{display:flex;gap:8px;padding:8px 12px max(12px,env(safe-area-inset-bottom));background:#fff}
  .cloudy__form input{flex:1;min-width:0;min-height:44px;border-radius:999px;border:1px solid #cfe3f7;padding:0 16px;font:inherit;font-size:16px;color:#06213d;background:#fff}
  .cloudy__form button{flex:0 0 auto;min-height:44px;padding:0 18px;border-radius:999px;border:0;background:#41a8fc;color:#06213d;font:inherit;font-size:11px;font-weight:900;letter-spacing:1px;cursor:pointer}
  @media(max-width:520px){.cloudy{right:0;bottom:0;width:100vw;height:min(78dvh,620px);border-radius:24px 24px 0 0}}
  @media(prefers-reduced-motion:reduce){.cloudy-fab,.cloudy-hello{transition:none}}
  `;
  document.head.appendChild(style);

  // ── Elements ──────────────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'cloudy-fab';
  fab.setAttribute('aria-label', 'Chat with Cloudy, the DLC helper');
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('aria-expanded', 'false');

  const hello = document.createElement('div');
  hello.className = 'cloudy-hello';
  hello.setAttribute('aria-hidden', 'true');
  hello.textContent = 'Need a hand? Ask Cloudy.';

  const panel = document.createElement('section');
  panel.className = 'cloudy';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Cloudy, the DLC helper');
  panel.innerHTML = `<div class="cloudy__head"><div class="cloudy__avatar" aria-hidden="true"></div><div><strong>Cloudy</strong><small>DLC MEMBER HELPER</small></div><button class="cloudy__close" type="button" aria-label="Close Cloudy">×</button></div>
    <div class="cloudy__log" role="log" aria-live="polite"></div>
    <div class="cloudy__chips"></div>
    <form class="cloudy__form"><input type="text" maxlength="200" placeholder="Ask about exchanges, credits, the lounge" aria-label="Ask Cloudy a question" autocomplete="off" enterkeyhint="send"><button type="submit">SEND</button></form>`;
  document.body.append(fab, hello, panel);

  const log = panel.querySelector('.cloudy__log');
  const chips = panel.querySelector('.cloudy__chips');
  const form = panel.querySelector('.cloudy__form');
  const input = form.querySelector('input');
  let member = window.DLCGate && window.DLCGate.member || null;
  let greeted = false;
  let lastFocus = null;

  const firstName = () => {
    const name = member && (member.name || member.fullName);
    return name ? String(name).trim().split(/\s+/)[0] : '';
  };

  function add(who, parts) {
    const el = document.createElement('div');
    el.className = `cloudy__msg cloudy__msg--${who}`;
    el.innerHTML = (parts.text || []).map(t => `<p>${esc(t)}</p>`).join('') +
      (parts.links || []).map(([label, href]) => `<a href="${esc(href)}">${esc(label)} →</a>`).join('');
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }
  const bot = parts => add('bot', parts);

  function renderChips() {
    const list = ANSWERS.filter(a => !a.member || member);
    chips.innerHTML = list.map(a => `<button type="button" class="cloudy__chip" data-id="${a.id}">${esc(a.label)}</button>`).join('');
  }

  async function answer(entry) {
    if (entry.text || entry.links) bot({ text: entry.text, links: entry.links });
    if (entry.run && actions[entry.run]) await actions[entry.run](parts => bot(parts));
  }

  // Match a typed question to the closest approved answer by shared words.
  // Everyday words are ignored, and endings are trimmed so "referrals" meets "referral".
  const IGNORE = new Set('how what where when why can could would should does did the and for you your are was were with from this that have has get got about please tell need want work works'.split(' '));
  const stem = w => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
  const tokens = text => text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !IGNORE.has(w)).map(stem);
  function match(question) {
    const asked = new Set(tokens(question));
    let best = null, bestScore = 0;
    for (const entry of ANSWERS) {
      if (entry.member && !member) continue;
      const score = tokens(entry.words).reduce((n, w) => n + (asked.has(w) ? 1 : 0), 0);
      if (score > bestScore) { best = entry; bestScore = score; }
    }
    return bestScore ? best : null;
  }

  chips.addEventListener('click', event => {
    const chip = event.target.closest('[data-id]');
    if (!chip) return;
    const entry = ANSWERS.find(a => a.id === chip.dataset.id);
    if (!entry) return;
    add('me', { text: [entry.label] });
    answer(entry);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    add('me', { text: [question] });
    const entry = match(question);
    if (entry) return answer(entry);
    bot({ text: [FALLBACK] });
    actions.collectionPoint(parts => bot(parts));
  });

  async function loadMember() {
    if (member) return;
    try {
      const response = await fetch('/api/members/session');
      const data = response.ok ? await response.json() : null;
      if (data && data.member) member = data.member;
    } catch (e) {}
  }

  async function openPanel() {
    lastFocus = document.activeElement;
    await loadMember();
    if (!greeted) {
      greeted = true;
      const name = firstName();
      bot({ text: [`Howdy${name ? `, ${name}` : ''}! I am Cloudy. I can help with exchanges, collection, credits, rewards and the lounge.`] });
    }
    renderChips();
    panel.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
    hello.classList.remove('is-shown');
    input.focus({ preventScroll: true });
  }
  function closePanel() {
    panel.classList.remove('is-open');
    fab.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  fab.addEventListener('click', openPanel);
  panel.querySelector('.cloudy__close').addEventListener('click', closePanel);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && panel.classList.contains('is-open')) closePanel(); });
  window.addEventListener('dlc:member', event => { member = event.detail || member; });

  // ── When Cloudy appears ───────────────────────────────────────────────────
  // On the landing page: when the shelf categories scroll into view. Elsewhere:
  // once the visitor has scrolled a little. After that it stays.
  let shown = false;
  function reveal() {
    if (shown) return;
    shown = true;
    fab.classList.add('is-shown');
    // One quiet hello per visit, so it never nags.
    try {
      if (!sessionStorage.getItem('dlc_cloudy_hello')) {
        sessionStorage.setItem('dlc_cloudy_hello', '1');
        setTimeout(() => { if (!panel.classList.contains('is-open')) hello.classList.add('is-shown'); setTimeout(() => hello.classList.remove('is-shown'), 5000); }, 700);
      }
    } catch (e) {}
  }

  const categories = document.querySelector('.category-row');
  if (categories && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) reveal(); }, { threshold: 0.2 }).observe(categories);
  } else {
    const onScroll = () => { if (window.scrollY > 160) { reveal(); window.removeEventListener('scroll', onScroll); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
