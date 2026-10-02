(() => {
  // Line icons shared by the header buttons (education.js uses search and grid).
  const svg = paths => `<svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  window.DLCIcons = {
    search: svg('<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>'),
    menu: svg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'),
    close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  };
  const header = document.querySelector('.nav');
  const menuButton = document.getElementById('menuBtn');
  const primaryNav = header?.querySelector('.nav-links');

  if (header && menuButton && primaryNav) {
    let mobileNav = document.getElementById('mobileNav');
    if (!mobileNav) {
      mobileNav = document.createElement('nav');
      mobileNav.id = 'mobileNav';
      mobileNav.className = 'mobile-nav';
      mobileNav.setAttribute('aria-label', 'Mobile navigation');
      mobileNav.hidden = true;
      mobileNav.innerHTML = primaryNav.innerHTML;
      header.insertAdjacentElement('afterend', mobileNav);
    }

    menuButton.classList.add('nav-icon-btn', 'nav-menu');
    menuButton.dataset.label = 'Menu';
    menuButton.innerHTML = `<span class="nav-icon-swap nav-icon-swap--open">${window.DLCIcons.menu}</span><span class="nav-icon-swap nav-icon-swap--close">${window.DLCIcons.close}</span>`;
    const setOpen = (open) => {
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menuButton.dataset.label = open ? 'Close' : 'Menu';
      mobileNav.hidden = !open;
      document.documentElement.classList.toggle('mobile-menu-open', open);
      if (open) mobileNav.querySelector('a')?.focus();
    };

    menuButton.setAttribute('aria-controls', 'mobileNav');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.addEventListener('click', () => setOpen(menuButton.getAttribute('aria-expanded') !== 'true'));
    mobileNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      if (event.key === 'Escape' && open) {
        setOpen(false);
        menuButton.focus();
        return;
      }
      if (event.key !== 'Tab' || !open) return;
      const focusable = [menuButton, ...mobileNav.querySelectorAll('a[href]')].filter((el) => !el.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024 && menuButton.getAttribute('aria-expanded') === 'true') setOpen(false);
    }, {passive:true});
  }


  const pageViewDetail = {event:'page_view', path:location.pathname};
  window.dispatchEvent(new CustomEvent('dlc:analytics', {detail:pageViewDetail}));
  if (window.DLCConsent?.allows('analytics') && window.dlcAnalytics && typeof window.dlcAnalytics.track === 'function') {
    window.dlcAnalytics.track('page_view', {path:location.pathname});
  }

  document.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      img.classList.add('asset-error');
      if (!img.alt) return;
      const fallback = document.createElement('span');
      fallback.className = 'image-fallback';
      fallback.textContent = img.alt;
      img.replaceWith(fallback);
    }, {once:true});
  });

  document.querySelectorAll('[data-jump-exchange]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!document.querySelector('.experience')) return;
      event.preventDefault();
      const experience = document.querySelector('.experience');
      const target = experience.offsetTop + Math.max(0, experience.offsetHeight - window.innerHeight) * 0.90;
      window.scrollTo({top: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      history.replaceState(null, '', '#experience');
    });
  });

  // Lightweight privacy-safe analytics hook. No data is transmitted unless the owner
  // attaches a provider to window.dlcAnalytics.track AND the visitor has opted in
  // to analytics in the cookie settings (cookies.js).
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-analytics]');
    if (!target) return;
    const detail = {event: target.dataset.analytics, path: location.pathname};
    window.dispatchEvent(new CustomEvent('dlc:analytics', {detail}));
    if (window.DLCConsent?.allows('analytics') && window.dlcAnalytics && typeof window.dlcAnalytics.track === 'function') {
      window.dlcAnalytics.track(detail.event, {path: detail.path});
    }
  }, {passive:true});

  // Back to top: appears once the visitor has scrolled a screen or two, sits
  // just above the DLC Decoder button, and respects reduced motion.
  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'dlc-to-top';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.innerHTML = '<span aria-hidden="true">↑</span>';
  document.body.appendChild(toTop);
  const toggleToTop = () => toTop.classList.toggle('is-visible', window.scrollY > window.innerHeight * 1.2);
  window.addEventListener('scroll', toggleToTop, {passive:true});
  toggleToTop();
  toTop.addEventListener('click', () => {
    window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    document.querySelector('.skip-link + *, header, main')?.focus?.({preventScroll: true});
  });
})();
