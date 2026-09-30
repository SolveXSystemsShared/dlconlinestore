/*
 * Cookie & storage consent (POPIA).
 *
 * Strictly necessary storage — the 18+ and member session, this consent record,
 * and session-only navigation state — runs without consent because the member
 * area cannot work without it. Everything else waits for an explicit opt-in:
 *
 *   preferences — guidance mode, recently viewed, the Decoder's last topic
 *   analytics   — none in use today; window.dlcAnalytics only fires with consent
 *
 * The choice lives in the first-party `dlc_consent` cookie for 12 months, then
 * the banner asks again. Anything can be changed later from "Cookie settings"
 * in the footer ([data-cookie-settings]). Self-contained on purpose: it brings
 * its own styles so the React pages (which do not load styles.css) share it.
 *
 * Other scripts ask: window.DLCConsent.allows('preferences' | 'analytics').
 * A change fires a `dlc:consent` event on window.
 */
(() => {
  const COOKIE = 'dlc_consent';
  const VERSION = 1;
  const MAX_AGE = 60 * 60 * 24 * 365;
  const PREFERENCE_KEYS = ['dlc_guidance_enabled_v1', 'dlc_recent_products_v1', 'dlc_decoder_topic_v1'];

  function read() {
    const raw = document.cookie.split('; ').find(part => part.startsWith(`${COOKIE}=`));
    if (!raw) return null;
    try {
      const value = JSON.parse(decodeURIComponent(raw.slice(COOKIE.length + 1)));
      return value && value.v === VERSION ? value : null;
    } catch (e) { return null; }
  }

  function write(choice) {
    const record = { v: VERSION, preferences: !!choice.preferences, analytics: !!choice.analytics, at: new Date().toISOString() };
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(record))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    // Withdrawing consent removes what was stored under it, not just future writes.
    if (!record.preferences) PREFERENCE_KEYS.forEach(key => { try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (e) {} });
    current = record;
    window.dispatchEvent(new CustomEvent('dlc:consent', { detail: record }));
    return record;
  }

  let current = read();
  window.DLCConsent = {
    get: () => current,
    allows: category => category === 'necessary' || !!(current && current[category]),
    open: () => openPanel(),
  };

  const css = `
  .dlc-consent{position:fixed;z-index:100001;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));margin:0 auto;width:min(760px,100%);background:#fff;color:#11131a;border:1px solid #dfe2e8;box-shadow:0 24px 70px rgba(3,6,40,.28);font-family:Arial,Helvetica,sans-serif;padding:20px 22px;display:grid;gap:14px;transform:translateY(12px);opacity:0;transition:transform .25s ease,opacity .25s ease}
  .dlc-consent.is-in{transform:none;opacity:1}
  .dlc-consent h2{margin:0;font-size:20px;line-height:1;letter-spacing:-.03em;text-transform:uppercase}
  .dlc-consent p{margin:0;font-size:12.5px;line-height:1.6;color:#555b66}
  .dlc-consent a{color:#1a6ef0;font-weight:900;text-decoration:underline;text-underline-offset:2px}
  .dlc-consent__eyebrow{font-size:8px;font-weight:950;letter-spacing:1.5px;color:#7c818a;margin-bottom:8px}
  .dlc-consent__actions{display:flex;flex-wrap:wrap;gap:8px}
  .dlc-consent__actions button{min-height:44px;padding:0 18px;border:1px solid #1a6ef0;font:inherit;font-size:9px;font-weight:950;letter-spacing:1.2px;text-transform:uppercase;cursor:pointer;background:#fff;color:#1a6ef0}
  .dlc-consent__actions button.is-primary{background:#1a6ef0;color:#fff}
  .dlc-consent__actions button:focus-visible,.dlc-consent input:focus-visible{outline:2px solid #1a6ef0;outline-offset:3px}
  .dlc-consent__cats{display:grid;gap:8px}
  .dlc-consent__cat{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;border:1px solid #e6e9ee;background:#fafbfc;padding:12px 14px}
  .dlc-consent__cat strong{display:block;font-size:11px;font-weight:950;letter-spacing:.6px;text-transform:uppercase;margin-bottom:4px}
  .dlc-consent__cat span{font-size:12px;line-height:1.5;color:#676d77}
  .dlc-consent__cat input{width:20px;height:20px;accent-color:#1a6ef0}
  .dlc-consent__cat em{font-style:normal;font-size:8px;font-weight:950;letter-spacing:1px;color:#4f8a45}
  .dlc-consent[hidden]{display:none}
  @media(max-width:520px){.dlc-consent{padding:18px 16px}.dlc-consent__actions{display:grid;grid-template-columns:1fr}}
  @media(prefers-reduced-motion:reduce){.dlc-consent{transition:none}}`;

  let panel = null;
  let detailed = false;

  function render() {
    const c = current || { preferences: false, analytics: false };
    panel.innerHTML = `
      <div>
        <div class="dlc-consent__eyebrow">DOWN LOW CANNABIS · YOUR PRIVACY</div>
        <h2 id="dlcConsentTitle">${detailed ? 'Cookie settings' : 'We respect your privacy'}</h2>
      </div>
      <p>We use strictly necessary cookies to keep the 18+ check and your member session working. With your permission, we would also remember your browsing preferences on this device. We do not use advertising cookies. <a href="/cookies.html">Cookie Policy</a> · <a href="/privacy.html">Privacy Policy</a></p>
      ${detailed ? `<div class="dlc-consent__cats">
        <label class="dlc-consent__cat"><div><strong>Strictly necessary</strong><span>18+ confirmation, member sign-in, this consent choice and page navigation. The member area cannot work without these.</span></div><em>ALWAYS ON</em></label>
        <label class="dlc-consent__cat"><div><strong>Preferences</strong><span>Remembers guidance mode, recently viewed products and your last DLC Decoder topic on this device.</span></div><input type="checkbox" data-cat="preferences" ${c.preferences ? 'checked' : ''}></label>
        <label class="dlc-consent__cat"><div><strong>Analytics</strong><span>Anonymous statistics on how the site is used. Not currently in use — if we enable it, it will only run with this switched on.</span></div><input type="checkbox" data-cat="analytics" ${c.analytics ? 'checked' : ''}></label>
      </div>` : ''}
      <div class="dlc-consent__actions">
        <button type="button" class="is-primary" data-consent="all">Accept all</button>
        <button type="button" data-consent="necessary">Necessary only</button>
        ${detailed ? '<button type="button" data-consent="save">Save my choices</button>' : '<button type="button" data-consent="manage">Manage settings</button>'}
      </div>`;
  }

  function mount() {
    if (panel) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    panel = document.createElement('section');
    panel.className = 'dlc-consent';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'dlcConsentTitle');
    panel.setAttribute('aria-live', 'polite');
    panel.hidden = true;
    document.body.appendChild(panel);
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-consent]')?.dataset.consent;
      if (!action) return;
      if (action === 'manage') { detailed = true; render(); panel.querySelector('input')?.focus(); return; }
      if (action === 'all') write({ preferences: true, analytics: true });
      if (action === 'necessary') write({ preferences: false, analytics: false });
      if (action === 'save') {
        const pick = cat => !!panel.querySelector(`[data-cat="${cat}"]`)?.checked;
        write({ preferences: pick('preferences'), analytics: pick('analytics') });
      }
      closePanel();
    });
    panel.addEventListener('keydown', event => { if (event.key === 'Escape' && current) closePanel(); });
  }

  let returnFocus = null;
  function openPanel(showDetails = true) {
    mount();
    detailed = showDetails;
    render();
    returnFocus = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-in'));
    if (showDetails) setTimeout(() => panel.querySelector('input, button')?.focus(), 40);
  }

  function closePanel() {
    panel.classList.remove('is-in');
    setTimeout(() => { panel.hidden = true; }, 250);
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus?.();
  }

  // Footer "Cookie settings" links, wherever they are (static or React).
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-cookie-settings]')) return;
    event.preventDefault();
    openPanel(true);
  });

  const start = () => { if (!current) openPanel(false); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
