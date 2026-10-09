/*
 * The DLC app: install prompt and exchange updates.
 *
 * Registers the service worker (sw.js) and, once a member is signed in, offers
 * once to add the store to their home screen and turn on updates about their
 * exchanges. Nothing here is required to shop. The prompt can be dismissed, is
 * not shown again for two weeks, and can always be reopened from Cloudy
 * (window.DLCApp.open()).
 *
 * Updates need a signed-in member, so the device is registered against the
 * member from the session cookie on the server (POST /api/push/subscribe).
 * iPhones only allow updates from an app added to the Home Screen, so there the
 * steps come first and the switch appears once the app is opened from there.
 *
 * Self-contained, like cookies.js: it brings its own styles so the React pages
 * share it.
 */
(() => {
  const DISMISS_KEY = 'dlc_app_prompt_dismissed_v1';
  const QUIET_MS = 14 * 24 * 60 * 60 * 1000;
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const mayRemember = () => !!window.DLCConsent?.allows('preferences');
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  let installEvent = null;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event; refresh(); });
  window.addEventListener('appinstalled', () => { installEvent = null; refresh(); });

  if ('serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    document.readyState === 'complete' ? register() : window.addEventListener('load', register);
  }

  // ── Updates (web push) ────────────────────────────────────────────────────
  const urlBase64ToBytes = value => {
    const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };

  async function currentSubscription() {
    if (!canPush()) return null;
    try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch (e) { return null; }
  }

  // 'unsupported' | 'install-first' | 'blocked' | 'on' | 'off'
  async function updatesState() {
    if (isIOS && !isStandalone()) return 'install-first';
    if (!canPush()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && await currentSubscription() ? 'on' : 'off';
  }

  async function turnOnUpdates() {
    const keyResponse = await fetch('/api/push/key', { cache: 'no-store' });
    if (!keyResponse.ok) throw new Error('Updates are not switched on yet. Please try again soon.');
    const { publicKey } = await keyResponse.json();
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) });
    const saved = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
    if (!saved.ok) throw new Error('We could not turn on updates just now. Please try again.');
  }

  async function turnOffUpdates() {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }

  // ── Sheet ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
  .dlc-app{position:fixed;inset:0;z-index:100000;display:none;align-items:flex-end;justify-content:center;padding:16px;background:rgba(6,33,61,.45);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  .dlc-app.is-open{display:flex}
  .dlc-app__card{width:min(460px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;background:#fff;color:#06213d;border-radius:24px;padding:24px 22px 22px;box-shadow:0 30px 70px rgba(6,33,61,.35);font-family:inherit}
  .dlc-app__eyebrow{font-size:9px;font-weight:900;letter-spacing:1.6px;color:#1a6ef0}
  .dlc-app__card h2{margin:8px 0 8px;font-size:clamp(26px,7vw,32px);line-height:.98;letter-spacing:-.04em;text-transform:uppercase}
  .dlc-app__card p{margin:0 0 14px;font-size:14px;line-height:1.5;color:#3d5170}
  .dlc-app__steps{margin:0 0 16px;padding:0;list-style:none;display:grid;gap:8px;counter-reset:step}
  .dlc-app__steps li{counter-increment:step;display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start;padding:10px 12px;border-radius:14px;background:#f1f8ff;font-size:13.5px;line-height:1.45;color:#06213d}
  .dlc-app__steps li::before{content:counter(step);display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#41a8fc;color:#06213d;font-weight:900;font-size:13px}
  .dlc-app__row{display:grid;gap:8px}
  .dlc-app__btn{min-height:46px;border-radius:999px;border:1px solid #d6e6f7;background:#fff;color:#06213d;font:inherit;font-size:11px;font-weight:900;letter-spacing:1.1px;cursor:pointer;padding:0 18px}
  .dlc-app__btn--main{background:#41a8fc;border-color:#41a8fc}
  .dlc-app__btn[disabled]{opacity:.6;cursor:default}
  .dlc-app__note{margin:12px 0 0;font-size:12.5px;line-height:1.45;color:#3d5170;min-height:1em}
  .dlc-app__note--bad{color:#a32a1f}
  .dlc-app__ok{display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:10px 12px;border-radius:14px;background:#f3faf1;color:#1f6a33;font-size:13px;font-weight:800}
  @media(min-width:640px){.dlc-app{align-items:center}}
  `;
  document.head.appendChild(style);

  const sheet = document.createElement('div');
  sheet.className = 'dlc-app';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `<section class="dlc-app__card" role="dialog" aria-modal="true" aria-labelledby="dlcAppTitle">
    <div class="dlc-app__eyebrow">THE DLC APP</div>
    <h2 id="dlcAppTitle">Keep DLC on your phone.</h2>
    <p id="dlcAppCopy"></p>
    <div id="dlcAppBody"></div>
    <div class="dlc-app__row" id="dlcAppActions"></div>
    <p class="dlc-app__note" id="dlcAppNote" role="status" aria-live="polite"></p>
  </section>`;
  document.body.appendChild(sheet);
  const copyEl = sheet.querySelector('#dlcAppCopy');
  const bodyEl = sheet.querySelector('#dlcAppBody');
  const actionsEl = sheet.querySelector('#dlcAppActions');
  const noteEl = sheet.querySelector('#dlcAppNote');
  let lastFocus = null;

  const steps = list => `<ol class="dlc-app__steps">${list.map(item => `<li><span>${item}</span></li>`).join('')}</ol>`;
  const note = (text, bad) => { noteEl.textContent = text || ''; noteEl.classList.toggle('dlc-app__note--bad', !!bad); };
  const button = (label, onClick, main) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'dlc-app__btn' + (main ? ' dlc-app__btn--main' : '');
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  };

  function installSteps() {
    if (isStandalone()) return '';
    if (isIOS) return steps(['Tap the <strong>Share</strong> button in Safari.', 'Scroll down and tap <strong>Add to Home Screen</strong>.', 'Open <strong>DLC</strong> from your Home Screen, then come back here to turn on updates.']);
    if (installEvent) return '';
    if (isAndroid) return steps(['Open your browser menu (the three dots).', 'Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.', 'Open <strong>DLC</strong> from your home screen.']);
    return steps(['Look for the install icon at the right end of the address bar, or open the browser menu.', 'Choose <strong>Install DLC</strong> (Safari on a Mac: File, then <strong>Add to Dock</strong>).']);
  }

  async function render() {
    const state = await updatesState();
    actionsEl.innerHTML = '';
    note('');
    const installed = isStandalone();
    copyEl.textContent = installed
      ? 'DLC is on this device. Turn on updates and we will tell you about your exchanges.'
      : 'Add the store to your home screen for one tap access, and turn on updates so we can tell you about your exchanges.';
    bodyEl.innerHTML = installSteps();

    if (state === 'on') bodyEl.insertAdjacentHTML('afterbegin', '<div class="dlc-app__ok">Updates are on for this device.</div>');
    if (installEvent && !installed) {
      actionsEl.appendChild(button('INSTALL THE APP', async () => {
        installEvent.prompt();
        try { await installEvent.userChoice; } catch (e) {}
        installEvent = null;
        render();
      }, true));
    }
    if (state === 'off') {
      actionsEl.appendChild(button('TURN ON UPDATES', async event => {
        const el = event.currentTarget;
        el.disabled = true;
        try { await turnOnUpdates(); render(); } catch (error) { el.disabled = false; note(error.message || 'We could not turn on updates just now.', true); }
      }, !installEvent || installed));
    } else if (state === 'on') {
      actionsEl.appendChild(button('TURN OFF UPDATES', async () => { await turnOffUpdates(); render(); }));
    } else if (state === 'blocked') {
      note('Notifications are blocked for this site. Allow them in your browser or phone settings, then reopen this.', true);
    } else if (state === 'install-first') {
      note('iPhone only allows updates from the app on your Home Screen. Add it first, then open it from there.');
    } else if (state === 'unsupported' && !installEvent && installed) {
      note('This browser cannot receive updates.');
    }
    actionsEl.appendChild(button(state === 'on' || installed ? 'CLOSE' : 'NOT NOW', () => close(true)));
  }

  function open() {
    lastFocus = document.activeElement;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    render().then(() => (actionsEl.querySelector('button') || sheet).focus?.());
  }
  function close(remember) {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    if (remember) quiet();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  sheet.addEventListener('click', event => { if (event.target === sheet) close(true); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && sheet.classList.contains('is-open')) close(true); });

  function refresh() { if (sheet.classList.contains('is-open')) render(); }

  // ── When to offer it ──────────────────────────────────────────────────────
  const quiet = () => {
    const stamp = String(Date.now());
    try { (mayRemember() ? localStorage : sessionStorage).setItem(DISMISS_KEY, stamp); } catch (e) {}
  };
  const recentlyDismissed = () => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0) || Number(sessionStorage.getItem(DISMISS_KEY) || 0);
      return at && Date.now() - at < QUIET_MS;
    } catch (e) { return false; }
  };

  async function offerOnce(attempt = 0) {
    if (sheet.classList.contains('is-open') || recentlyDismissed()) return;
    const state = await updatesState();
    // Already installed and subscribed, or nothing this device can do about either.
    if (state === 'on' || state === 'blocked') return;
    if (state === 'unsupported' && (isStandalone() || !installEvent)) return;
    // Do not stack on the consent banner or another dialog; look again shortly.
    const busy = document.querySelector('.dlc-consent, .education-overlay.is-open, .age-gate');
    if (busy) { if (attempt < 6) setTimeout(() => offerOnce(attempt + 1), 4000); return; }
    open();
  }

  if (window.DLCGate?.ready) {
    window.DLCGate.ready.then(member => { if (member && member.memberId) setTimeout(offerOnce, 6000); }).catch(() => {});
  }

  window.DLCApp = { open, updatesState, isStandalone };
})();
