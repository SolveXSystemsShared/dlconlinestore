/*
 * Rotating loading lines — something to read while a slow connection catches
 * up, so a wait feels like part of the lounge rather than a broken page.
 *
 * Three acts: a line about what is loading, then (after a few seconds, when a
 * connection is clearly slow) an honest word about the network, then cheeky
 * lines on a loop to keep the member company. Copy follows the DLC glossary —
 * credits and exchanges, never sales. The React pages keep the same lines in
 * components/slow-notice.tsx; change both together.
 *
 *   const stop = DLCLoadingLines.rotate(element, 'shelf')
 *   stop()   // or just remove the element — it stops itself
 */
(() => {
  const OPENERS = {
    lounge: ['Preparing the lounge…', 'Fluffing the clouds…', 'Dimming the lights, cueing the vibe…'],
    gate: ['One sec, just checking you in…', 'Finding your name on the list…'],
    shelf: ['Stocking the shelf…', 'Counting what’s on the shelf…', 'Lining up the good stuff…'],
    product: ['Fetching the details…', 'Reading the label for you…'],
    bag: ['Unpacking your bag…', 'Working out your credits…'],
    account: ['Opening your account…', 'Dusting off your member card…'],
  };

  const NETWORK = [
    'Your signal is taking the scenic route…',
    'Slow connection. We’re still coming, promise.',
    'The network’s moving at lounge pace today.',
  ];

  const CHEEKY = [
    'Good things take time. So does this network.',
    'The mascot is stretching. Almost there…',
    'Still here? Legend. Nearly done.',
    'Rolling out the welcome mat…',
    'Tip: tap the ? button to decode any term on the site.',
    'Checking the shelves twice, just for you…',
    'Taking it low and slow…',
    'Worth the wait. Mostly the network’s fault.',
  ];

  const FIRST_STEP_MS = 2600;
  const NETWORK_AFTER_MS = 5000;

  function rotate(el, context = 'shelf') {
    if (!el) return () => {};
    const openers = OPENERS[context] || OPENERS.shelf;
    const started = Date.now();
    let opener = 0;
    let network = 0;
    let cheeky = Math.floor(Math.random() * CHEEKY.length);
    let stopped = false;

    const show = text => {
      el.classList.add('is-swapping');
      setTimeout(() => {
        if (stopped) return;
        el.textContent = text;
        el.classList.remove('is-swapping');
      }, 180);
    };

    el.textContent = openers[0];
    const timer = setInterval(() => {
      if (stopped || !el.isConnected) { clearInterval(timer); return; }
      const elapsed = Date.now() - started;
      if (elapsed < NETWORK_AFTER_MS && opener < openers.length - 1) show(openers[++opener]);
      else if (elapsed >= NETWORK_AFTER_MS && network < 1) { network++; show(NETWORK[Math.floor(Math.random() * NETWORK.length)]); }
      else show(CHEEKY[cheeky++ % CHEEKY.length]);
    }, FIRST_STEP_MS);

    return () => { stopped = true; clearInterval(timer); el.classList.remove('is-swapping'); };
  }

  window.DLCLoadingLines = { rotate };
})();
