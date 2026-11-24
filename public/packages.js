(() => {
  const S = window.DLCStore;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const minutes = m => m === null ? 'Unlimited' : m >= 60 && m % 60 === 0 ? `${m / 60} hr` : `${m} min`;
  window.DLCLoadingLines?.rotate(document.querySelector('.li-loading'), 'lounge');

  function perks(p, turnCap) {
    const list = [];
    if (p.cashPercent || p.cardPercent) list.push(`<strong>${esc(p.cashPercent)}% off</strong> exchanges settled in cash · ${esc(p.cardPercent)}% by card`);
    else list.push('Lounge access');
    if (p.playstationMinutes === null) list.push(`<strong>Unlimited PlayStation</strong> · ${esc(turnCap)} min turns when others are waiting`);
    else if (p.playstationMinutes > 0) list.push(`<strong>${esc(minutes(p.playstationMinutes))} PlayStation</strong> each visit`);
    else list.push('No PlayStation time');
    if (p.earnsPoints) list.push('Earn points on every exchange');
    else if (p.kind === 'squad') list.push('No points or birthday rewards');
    if (p.birthdayCredits) list.push(`<strong>${S.price(p.birthdayCredits)}</strong> in DLC Credits on your birthday`);
    if (p.earlyProductAccess === 'full') list.push('First access to new drops');
    else if (p.earlyProductAccess === 'selected') list.push('Early access to selected drops');
    if (p.memberEvents) list.push(p.key === 'cloud_nine' ? 'Priority at member events' : 'Invites to member events');
    if (p.earnsReferralRewards) list.push('Referral rewards');
    return list;
  }

  function card(p, turnCap, { featured = false } = {}) {
    const period = p.billingPeriod === 'monthly' ? '/ month' : '/ visit';
    const visit = p.perVisitCredits ? `<p class="li-card__alt">or ${S.price(p.perVisitCredits)} / visit</p>` : '';
    const who = p.squadSize ? `<p class="li-card__who">${esc(p.squadSize)} named people</p>` : '';
    return `<article class="li-card${featured ? ' is-featured' : ''}">
      ${featured ? '<span class="li-card__flag">MOST INCLUDED</span>' : ''}
      <h3>${esc(p.name)}</h3>${who}
      <p class="li-card__credits"><strong>${S.price(p.credits)}</strong> <span>${period}</span></p>${visit}
      <ul class="li-perks">${perks(p, turnCap).map(x => `<li>${x}</li>`).join('')}</ul>
    </article>`;
  }

  S.api('/api/lounge').then(info => {
    const cap = info.playstation.turnCapMinutes;
    const monthly = info.packages.filter(p => p.kind === 'individual');
    const top = monthly.reduce((best, p) => (!best || p.credits > best.credits ? p : best), null);
    const monthlyEl = document.getElementById('monthly');
    monthlyEl.removeAttribute('aria-busy');
    monthlyEl.innerHTML = monthly.map(p => card(p, cap, { featured: p === top })).join('');

    const day = info.packages.filter(p => p.kind === 'day_pass').map(p => card(p, cap));
    if (info.freeAccess.enabled) {
      day.push(`<article class="li-card li-card--free"><h3>Free access</h3><p class="li-card__credits"><strong>C 0.00</strong> <span>/ ${esc(info.freeAccess.hours)} hours</span></p>
        <ul class="li-perks"><li>Exchange more than <strong>${S.price(info.freeAccess.minSpend)}</strong> and the lounge is yours for ${esc(info.freeAccess.hours)} hours</li><li>Starts from the moment the exchange is settled</li><li>Come and go as you like while it lasts</li></ul></article>`);
      const free = document.getElementById('freeAccess');
      free.innerHTML = `<i aria-hidden="true"></i>Exchange more than <strong>${S.price(info.freeAccess.minSpend)}</strong> and get <strong>${esc(info.freeAccess.hours)} hours</strong> of free lounge access.`;
      free.hidden = false;
    }
    document.getElementById('daily').innerHTML = day.join('');
    document.getElementById('squads').innerHTML = info.packages.filter(p => p.kind === 'squad').map(p => card(p, cap)).join('');

    document.getElementById('psCopy').textContent = `${info.playstation.consoleCount === 1 ? 'One console' : `${info.playstation.consoleCount} consoles`} in the lounge. Your package's time is counted per visit, with a ${cap}-minute turn when someone else is waiting. Want more? Add time at the counter.`;
    document.getElementById('psExtra').innerHTML = info.playstation.extraTime.length
      ? info.playstation.extraTime.map(t => `<li><span>${esc(t.label)}</span><strong>${S.price(t.credits)}</strong></li>`).join('')
      : '<li><span>Extra time</span><strong>Ask at the counter</strong></li>';

    const r = info.rewards;
    const earners = info.packages.filter(p => p.earnsPoints).map(p => p.name);
    const who = earners.length > 1 ? `${earners.slice(0, -1).join(', ')} and ${earners[earners.length - 1]}` : earners[0] || 'Members';
    document.getElementById('rewardsCopy').textContent = `${who} members earn points on what they exchange. Every ${r.pointsPerCredit} points is ${S.price(1)} in DLC Credits, and credits can cover up to ${r.basketCapPercent}% of an exchange.`;
    document.getElementById('bands').innerHTML = r.bands.map(b => `<div class="li-band"><span>${b.to === null ? `${S.price(b.from)}+` : `${S.price(b.from)} – ${S.price(b.to)}`}</span><strong>${b.percent}%</strong><small>back in points</small></div>`).join('');
    document.getElementById('rewardExtras').innerHTML = [
      `<li><strong>+${r.visitBonus.points} points</strong> every ${r.visitBonus.visits} visits</li>`,
      `<li><strong>+${r.referralPoints} points</strong> for each friend you refer</li>`,
    ].join('');
  }).catch(() => {
    const el = document.getElementById('monthly');
    el.removeAttribute('aria-busy');
    el.innerHTML = '<p class="li-error">The packages could not be loaded just now. <a href="packages.html">Try again</a>, or ask the team at the lounge.</p>';
  });
})();
