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
          <button class="age-gate__btn age-gate__btn--yes" type="submit" disabled>ENTER STORE</button>
        </div>
        <p class="age-gate__legal">No Member ID yet? <a href="/register">Register as a member</a> · <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a> · <a href="cookies.html">Cookies</a></p>
      </form>`,
  };

  function mount(state) {
    if (!gate) {
      gate = document.createElement('div');
      gate.className = 'age-gate';
      gate.setAttribute('role', 'dialog');
      gate.setAttribute('aria-modal', 'true');
      gate.setAttribute('aria-labelledby', 'ageGateTitle');
      document.body.prepend(gate);
      gate.addEventListener('keydown', trapFocus);
      gate.addEventListener('click', onClick);
      gate.addEventListener('submit', onSubmit);
      gate.addEventListener('input', onInput);
    }
    document.documentElement.classList.add('age-gate-active');
    gate.dataset.state = state;
    gate.innerHTML = `<div class="age-gate__noise" aria-hidden="true"></div>
      <div class="age-gate__panel"><img class="age-gate__logo" src="assets/dlc-logo.svg" alt="Down Low Cannabis">${screens[state]()}</div>`;
    const shown = gate;
    setTimeout(() => (shown.querySelector('input') || shown.querySelector('button'))?.focus(), 50);
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

  function setBusy(busy) {
    gate?.querySelectorAll('button').forEach(button => {
      if (busy) button.disabled = true;
      else if (button.type !== 'submit') button.disabled = false;
    });
    if (!busy) onInput();
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
    if (action === 'back') { if (history.length > 1) history.back(); else location.href = 'about:blank'; }
    if (action !== 'yes') return;
    setBusy(true);
    try {
      const response = await fetch('/api/access/age', { method: 'POST' });
      if (!response.ok) throw new Error();
      write(AGE_KEY, true);
      if (ageOnly) { unmount(); return; }
      await resolveSession();
    } catch (e) {
      setBusy(false);
      showError('That did not go through. Please try again.');
    }
  }

  function onInput(event) {
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
    const memberId = gate.querySelector('input[name="memberId"]').value;
    setBusy(true);
    showError('');
    try {
      const response = await fetch('/api/members/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Active DLC member not found');
      passed(data.member);
      unmount();
    } catch (reason) {
      setBusy(false);
      showError(reason.message || 'Member verification failed');
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
