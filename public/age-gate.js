/*
 * The storefront gate: 18+ first, then an active CDASH Member ID.
 *
 * Both answers live in the server's signed HTTP-only cookies (the same ones the
 * React checkout/account pages read), so this script only ever asks the API.
 * localStorage holds two hints to avoid flashing the gate at people who have
 * already passed it — never the decision itself; /api/members/session is
 * re-checked on every load so a membership stopped in CDASH loses access.
 *
 * Pages that only need the age check (privacy, terms) load this with
 * data-gate="age". Everything else waits on window.DLCGate.ready, which
 * resolves with { memberId, name } once the member is verified.
 */
(() => {
  const AGE_KEY = 'dlc_age_verified_v1';
  const MEMBER_HINT_KEY = 'dlc_member_verified_v1';
  const PREFIX = 'DLC-';
  const ageOnly = document.currentScript?.dataset.gate === 'age';

  const read = key => { try { return localStorage.getItem(key) === 'yes'; } catch (e) { return false; } };
  const write = (key, on) => { try { on ? localStorage.setItem(key, 'yes') : localStorage.removeItem(key); } catch (e) {} };

  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  window.DLCGate = { ready, member: null };

  const passed = member => {
    window.DLCGate.member = member;
    write(MEMBER_HINT_KEY, true);
    resolveReady(member);
    window.dispatchEvent(new CustomEvent('dlc:member', { detail: member }));
  };

  // Hide the page up front unless the hints say this visitor already got in.
  const expectPass = read(AGE_KEY) && (ageOnly || read(MEMBER_HINT_KEY));
  // A returning member is checked silently; store.js shows its loading bar for it.
  window.DLCGate.silent = expectPass;
  let gate = null;
  if (!expectPass) {
    document.documentElement.classList.add('age-gate-active');
    whenBody(() => mount('checking'));
  }

  function whenBody(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  const formatMemberId = raw => {
    const digits = raw.replace(/^DLC-?/i, '').replace(/\D/g, '').slice(0, 6);
    return digits.length <= 4 ? `${PREFIX}${digits}` : `${PREFIX}${digits.slice(0, 4)}-${digits.slice(4)}`;
  };

  const screens = {
    checking: () => `
      <div class="age-gate__question">
        <p class="age-gate__eyebrow">DOWN LOW CANNABIS</p>
        <h1 id="ageGateTitle">ONE<br>MOMENT.</h1>
        <div class="age-gate__progress" role="progressbar" aria-label="Checking your session"><span></span></div>
      </div>`,
    age: () => `
      <div class="age-gate__question">
        <p class="age-gate__eyebrow">WELCOME TO DOWN LOW CANNABIS</p>
        <h1 id="ageGateTitle">ARE YOU<br>18 OR OLDER?</h1>
        <p class="age-gate__copy">Please confirm that you are 18 years of age or older before entering the Down Low Cannabis website.</p>
        <div class="age-gate__actions">
          <button class="age-gate__btn age-gate__btn--yes" data-gate-action="yes" type="button">YES, ENTER SITE</button>
          <button class="age-gate__btn age-gate__btn--no" data-gate-action="no" type="button">NO, I’M UNDER 18</button>
        </div>
        <p class="age-gate__error" data-gate-error hidden></p>
        <p class="age-gate__legal">By entering, you confirm that you meet the minimum age requirement applicable to this website. <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a> · <a href="cookies.html">Cookies</a></p>
      </div>`,
    denied: () => `
      <div class="age-gate__question">
        <p class="age-gate__eyebrow">ACCESS RESTRICTED</p>
        <h1 id="ageGateTitle">YOU MUST BE<br>18+ TO ENTER.</h1>
        <p class="age-gate__copy">This website is restricted to adults aged 18 and older.</p>
        <div class="age-gate__actions"><button class="age-gate__btn age-gate__btn--no" data-gate-action="back" type="button">GO BACK</button></div>
      </div>`,
    member: () => `
      <form class="age-gate__question" data-gate-form novalidate>
        <p class="age-gate__eyebrow">DLC MEMBERS ONLY</p>
        <h1 id="ageGateTitle">ENTER YOUR<br>MEMBER ID.</h1>
        <p class="age-gate__copy">Use the active DLC Member ID registered at the lounge. Your bag, exchanges and member benefits follow it.</p>
        <label class="age-gate__field">
          <span>DLC MEMBER ID</span>
          <input name="memberId" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="DLC-1234-56" value="${PREFIX}" aria-describedby="ageGateError">
        </label>
        <p class="age-gate__error" id="ageGateError" data-gate-error hidden></p>
        <div class="age-gate__actions">
          <button class="age-gate__btn age-gate__btn--yes" type="submit" disabled>ENTER</button>
        </div>
        <p class="age-gate__legal">No Member ID yet? <a href="/register">Register as a member</a> · <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a> · <a href="cookies.html">Cookies</a></p>
      </form>`,
    pin: () => `
      <form class="age-gate__question" data-gate-pin novalidate>
        <p class="age-gate__eyebrow">CHECK YOUR PHONE</p>
        <h1 id="ageGateTitle">ENTER YOUR<br>PIN.</h1>
        <p class="age-gate__copy">We sent a 6-digit PIN by SMS to the number on your membership, <strong>${escapeHtml(pinState.sentTo)}</strong>. It expires in ${pinState.expiresInMinutes} minutes.</p>
        <label class="age-gate__field">
          <span>SMS PIN</span>
          <input name="pin" class="age-gate__pin" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" spellcheck="false" placeholder="••••••" aria-describedby="ageGateError">
        </label>
        <p class="age-gate__error" id="ageGateError" data-gate-error hidden></p>
        <div class="age-gate__actions">
          <button class="age-gate__btn age-gate__btn--yes" type="submit" disabled>SIGN IN</button>
        </div>
        <p class="age-gate__legal age-gate__pin-links">
          <button type="button" class="age-gate__link" data-gate-action="resend" disabled>Send a new PIN</button>
          <span data-gate-resend-wait></span> · <button type="button" class="age-gate__link" data-gate-action="change">Use a different Member ID</button>
        </p>
        <p class="age-gate__legal">Wrong number, or no phone with you? Ask the team at the lounge to update your membership.</p>
      </form>`,
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // The member being signed in and where their PIN went, between the two screens.
  const pinState = { memberId: '', sentTo: '', expiresInMinutes: 10, resendAt: 0 };
  let resendTimer = null;
  function tickResend() {
    clearInterval(resendTimer);
    const paint = () => {
      const button = gate?.querySelector('[data-gate-action="resend"]');
      const note = gate?.querySelector('[data-gate-resend-wait]');
      if (!button) { clearInterval(resendTimer); return; }
      const left = Math.ceil((pinState.resendAt - Date.now()) / 1000);
      button.disabled = left > 0 || gate.classList.contains('is-busy');
      note.textContent = left > 0 ? `in ${left}s` : '';
      if (left <= 0) clearInterval(resendTimer);
    };
    paint();
    resendTimer = setInterval(paint, 1000);
  }

  // What the mascot says on each screen.
  const bubbles = {
    checking: 'One sec, just checking you in…',
    age: 'Howzit! Quick check before we go in.',
    denied: 'Sorry, this one is for adults only.',
    member: 'Welcome in. Pop your Member ID below.',
    pin: 'Nearly there. Check your SMS for the PIN.',
  };

  let stopLines = () => {};
  function mount(state) {
    if (!gate) {
      gate = document.createElement('div');
      gate.className = 'age-gate';
      gate.setAttribute('role', 'dialog');
      gate.setAttribute('aria-modal', 'true');
      gate.setAttribute('aria-labelledby', 'ageGateTitle');
      // The mascot and sky are built once and stay put between screens, so a
      // slow connection only ever downloads and paints them a single time.
      gate.innerHTML = `<div class="age-gate__sky" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="age-gate__stage">
          <figure class="age-gate__mascot" aria-hidden="true">
            <p class="age-gate__bubble" data-gate-bubble></p>
            <img src="assets/dlc-mascot-3d.jpg" alt="" width="506" height="760" decoding="async" fetchpriority="high">
            <span class="age-gate__shadow"></span>
          </figure>
          <div class="age-gate__card">
            <img class="age-gate__logo" src="assets/dlc-logo.svg" alt="Down Low Cannabis" width="120" height="39">
            <div data-gate-screen></div>
          </div>
        </div>`;
      const mascot = gate.querySelector('.age-gate__mascot img');
      const ready = () => gate?.querySelector('.age-gate__mascot')?.classList.add('is-loaded');
      if (mascot.complete) ready(); else mascot.addEventListener('load', ready, { once: true });
      document.body.prepend(gate);
      gate.addEventListener('keydown', trapFocus);
      gate.addEventListener('click', onClick);
      gate.addEventListener('submit', onSubmit);
      gate.addEventListener('input', onInput);
    }
    document.documentElement.classList.add('age-gate-active');
    window.dispatchEvent(new CustomEvent('dlc:gate-shown'));
    gate.dataset.state = state;
    const bubble = gate.querySelector('[data-gate-bubble]');
    stopLines();
    bubble.textContent = bubbles[state] || '';
    if (state === 'checking' && window.DLCLoadingLines) stopLines = window.DLCLoadingLines.rotate(bubble, 'gate');
    gate.querySelector('[data-gate-screen]').innerHTML = screens[state]();
    const shown = gate;
    setTimeout(() => (shown.querySelector('[data-gate-screen] input') || shown.querySelector('[data-gate-screen] button'))?.focus(), 50);
  }

  function unmount() {
    document.documentElement.classList.remove('age-gate-active');
    if (!gate) return;
    const leaving = gate;
    gate = null;
    leaving.classList.add('is-leaving');
    setTimeout(() => leaving.remove(), 480);
  }

  function showError(message) {
    const el = gate?.querySelector('[data-gate-error]');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  // Disables the buttons and, on a slow connection, says what is happening on
  // the button that was pressed instead of leaving it looking frozen.
  function setBusy(busy, label) {
    gate?.classList.toggle('is-busy', busy);
    gate?.querySelectorAll('[data-gate-screen] button').forEach(button => {
      if (busy) {
        button.disabled = true;
        if (label && (button.type === 'submit' || button.dataset.gateAction === 'yes')) {
          button.dataset.label = button.textContent;
          button.innerHTML = `<i class="age-gate__spinner" aria-hidden="true"></i>${label}`;
        }
      } else {
        if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; }
        if (button.type !== 'submit') button.disabled = false;
      }
    });
    if (!busy) { onInput(); if (gate?.dataset.state === 'pin') tickResend(); }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const focusable = [...gate.querySelectorAll('button:not([disabled]),a[href],input')].filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function onClick(event) {
    const action = event.target.closest('[data-gate-action]')?.dataset.gateAction;
    if (action === 'no') mount('denied');
    if (action === 'change') { mount('member'); const input = gate.querySelector('input[name="memberId"]'); if (input && pinState.memberId) { input.value = pinState.memberId; onInput(); } return; }
    if (action === 'resend') { requestPin(pinState.memberId, true); return; }
    if (action === 'back') { if (history.length > 1) history.back(); else location.href = 'about:blank'; }
    if (action !== 'yes') return;
    setBusy(true, 'ENTERING…');
    try {
      const response = await fetch('/api/access/age', { method: 'POST' });
      if (!response.ok) throw new Error();
      write(AGE_KEY, true);
      if (ageOnly) { unmount(); return; }
      // The same response says whether this browser is already signed in, so
      // there is no second request before the member step on a slow line.
      const data = await response.json().catch(() => ({}));
      if (data.member) { passed(data.member); unmount(); return; }
      setBusy(false);
      write(MEMBER_HINT_KEY, false);
      mount('member');
    } catch (e) {
      setBusy(false);
      showError('That did not go through. Please try again.');
    }
  }

  function onInput(event) {
    const pin = gate?.querySelector('input[name="pin"]');
    if (pin) {
      if (event) { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); showError(''); }
      const submit = gate.querySelector('button[type="submit"]');
      if (submit) submit.disabled = pin.value.length !== 6;
      // Paste or SMS autofill fills all six at once: sign straight in.
      if (event && pin.value.length === 6 && !gate.classList.contains('is-busy')) gate.querySelector('[data-gate-pin]').requestSubmit?.();
      return;
    }
    const input = gate?.querySelector('input[name="memberId"]');
    if (!input) return;
    if (event) {
      input.value = formatMemberId(input.value);
      showError('');
    }
    const submit = gate.querySelector('button[type="submit"]');
    if (submit) submit.disabled = input.value.replace(/\D/g, '').length !== 6;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (event.target.matches('[data-gate-pin]')) return checkPin();
    requestPin(gate.querySelector('input[name="memberId"]').value, false);
  }

  /** Step one: the Member ID in, a PIN out by SMS to the number CDASH holds. */
  async function requestPin(memberId, resend) {
    setBusy(true, resend ? null : 'SENDING PIN…');
    showError('');
    try {
      const response = await fetch('/api/members/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.retryAfter) pinState.resendAt = Date.now() + data.retryAfter * 1000;
        throw new Error(data.error || 'We could not send your PIN');
      }
      Object.assign(pinState, { memberId, sentTo: data.sentTo, expiresInMinutes: data.expiresInMinutes || 10, resendAt: Date.now() + (data.resendAfter || 60) * 1000 });
      setBusy(false);
      mount('pin');
      if (resend) { const copy = gate.querySelector('.age-gate__copy'); if (copy) copy.insertAdjacentHTML('beforeend', ' <em class="age-gate__sent">New PIN sent.</em>'); }
      tickResend();
    } catch (reason) {
      setBusy(false);
      showError(reason.message || 'We could not send your PIN');
    }
  }

  /** Step two: the PIN from the SMS. Only this sets the member cookie. */
  async function checkPin() {
    const input = gate.querySelector('input[name="pin"]');
    if (!/^\d{6}$/.test(input.value)) return;
    setBusy(true, 'SIGNING IN…');
    showError('');
    try {
      const response = await fetch('/api/members/verify-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId: pinState.memberId, pin: input.value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'That PIN did not work');
      clearInterval(resendTimer);
      passed(data.member);
      unmount();
    } catch (reason) {
      setBusy(false);
      input.value = '';
      onInput();
      input.focus();
      showError(reason.message || 'That PIN did not work');
    }
  }

  // Asks the server where this visitor stands and shows the screen that follows.
  async function resolveSession() {
    let session = null;
    try {
      const response = await fetch('/api/members/session', { credentials: 'same-origin' });
      if (response.ok) session = await response.json();
    } catch (e) {}

    // The age cookie lasts a browser session; the device already said yes, so
    // put it back rather than asking again after every restart.
    if (session && !session.ageConfirmed && read(AGE_KEY)) {
      try { await fetch('/api/access/age', { method: 'POST' }); session.ageConfirmed = true; } catch (e) {}
    }

    if (!session?.ageConfirmed) { write(AGE_KEY, false); write(MEMBER_HINT_KEY, false); mount('age'); return; }
    if (ageOnly) { unmount(); return; }
    if (session.member) { passed(session.member); unmount(); return; }
    write(MEMBER_HINT_KEY, false);
    mount('member');
  }

  whenBody(resolveSession);
})();
