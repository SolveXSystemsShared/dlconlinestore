(() => {
  const S = window.DLCStore;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.DLCLoadingLines?.rotate(document.querySelector('.li-loading'), 'lounge');

  // "Pre-rolls / Outdoor / any strain" → "Outdoor preroll"; a named product keeps its name.
  function lineText(l) {
    const type = l.productType.replace(/^pre-?rolls?$/i, 'preroll').replace(/s$/i, '').toLowerCase();
    if (l.name) return `${esc(l.name)} <small>${esc(l.productType.toLowerCase())}</small>`;
    return `${l.grade ? `${esc(l.grade)} ` : 'Any '}${esc(type)}${l.grade ? ' <small>any strain</small>' : ''}`;
  }

  function cardFor(sp, products) {
    const amount = sp.credits != null
      ? `<p class="li-card__credits"><strong>${S.price(sp.credits)}</strong></p>`
      : sp.percentOff != null ? `<p class="li-card__credits"><strong>${esc(sp.percentOff)}% off</strong></p>` : '';
    const tags = [sp.kind === 'bundle' ? 'BUNDLE' : 'SPECIAL', sp.cashOnly ? 'SETTLE IN CASH' : null].filter(Boolean)
      .map((t, i) => `<span class="li-tag${i ? ' li-tag--cash' : ''}">${t}</span>`).join('');
    // The team's own description says what a bundle is ("1 Stoned Gummy in
    // Jar"); the item list alone can mislead, because a bundle may list every
    // flavour on offer rather than everything you get. So: description first;
    // named items of one type become "pick a flavour"; otherwise the items.
    const sameType = sp.lines.length > 1 && sp.lines.every(l => l.name && l.productType === sp.lines[0].productType && l.quantity === 1);
    let body = '';
    if (sp.kind === 'bundle' && sp.description) {
      body = `<p class="li-card__desc">${esc(sp.description)}</p>`;
      if (sameType) body += `<p class="li-card__flavours"><span>CHOOSE FROM</span>${sp.lines.map(l => `<em>${esc(l.name)}</em>`).join('')}</p>`;
    } else if (sameType) {
      body = `<p class="li-card__flavours"><span>CHOOSE FROM</span>${sp.lines.map(l => `<em>${esc(l.name)}</em>`).join('')}</p>`;
    } else if (sp.lines.length) {
      body = `<ul class="li-perks li-perks--items">${sp.lines.map(l => `<li><b>${esc(l.quantity)}×</b> ${lineText(l)}</li>`).join('')}</ul>`;
    }
    if (sp.cashOnly) body += `<p class="li-card__note">${sp.percentOff != null ? `${esc(sp.percentOff)}% off` : 'This special'} applies when the exchange is settled in cash. Settled by card, the usual credits apply.</p>`;
    return `<article class="li-card" id="special-${esc(sp.id)}">${S.bundleArt(sp, products)}<div class="li-tags">${tags}</div><h3>${esc(sp.name)}</h3>${amount}${body}</article>`;
  }

  // The catalogue only supplies pictures, so a failed download never hides a special.
  Promise.all([S.specials(), S.catalog().catch(() => [])]).then(([specials, products]) => {
    const card = sp => cardFor(sp, products);
    const bundles = specials.filter(s => s.kind === 'bundle');
    const singles = specials.filter(s => s.kind !== 'bundle');
    const bundlesEl = document.getElementById('bundles');
    bundlesEl.removeAttribute('aria-busy');
    if (specials.length) document.getElementById('specialsLiveText').textContent = `${specials.length} running now`;
    // Sections with nothing in them are hidden, never left blank.
    if (bundles.length) bundlesEl.innerHTML = bundles.map(card).join('');
    else if (singles.length) document.getElementById('bundleSection').hidden = true;
    else bundlesEl.innerHTML = '<p class="li-empty">No specials are running right now. Check back soon, new ones land at the counter often.</p>';
    if (singles.length) {
      document.getElementById('singles').innerHTML = singles.map(card).join('');
      document.getElementById('offSection').hidden = false;
    }
    // Arrived from a special on a shelf: bring that card into view.
    const target = location.hash.startsWith('#special-') && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { target.classList.add('is-linked'); requestAnimationFrame(() => target.scrollIntoView({ block: 'center' })); }
  }).catch(() => {
    const el = document.getElementById('bundles');
    el.removeAttribute('aria-busy');
    el.innerHTML = '<p class="li-error">The specials could not be loaded just now. <a href="specials.html">Try again</a>, or ask the team at the lounge.</p>';
  });

  S.api('/api/lounge').then(info => {
    const items = [];
    const day = info.packages.find(p => p.kind === 'day_pass');
    if (day) items.push([`${day.name}, lounge access`, S.price(day.credits)]);
    if (info.freeAccess.enabled) items.push([`Lounge access with an exchange over ${S.price(info.freeAccess.minSpend)}`, 'FREE']);
    info.playstation.extraTime.forEach(t => items.push([`PlayStation · ${t.label}`, S.price(t.credits)]));
    document.getElementById('extras').innerHTML = items.map(([label, value]) => `<li><span>${esc(label)}</span><strong>${esc(value)}</strong></li>`).join('')
      + '<li><a href="packages.html"><span>Monthly memberships &amp; squads</span><strong>SEE ALL →</strong></a></li>';
  }).catch(() => {
    document.getElementById('extras').innerHTML = '<li><a href="packages.html"><span>Lounge packages</span><strong>SEE ALL →</strong></a></li>';
  });
})();
