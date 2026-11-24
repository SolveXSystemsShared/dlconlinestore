(() => {
  try {
    const raw = sessionStorage.getItem('dlcTransitionIn');
    const state = raw ? JSON.parse(raw) : null;
    if (!state || !state.href || Date.now() - state.at > 4000) return;
    const target = new URL(state.href, location.href);
    if (target.pathname === location.pathname && target.search === location.search) {
      document.documentElement.classList.add('dlc-arriving');
    }
  } catch(e) {}
})();
