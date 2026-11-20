(() => {
  const S = window.DLCStore;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const list = names => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'Some packages';

  // Your own code.
  const value = document.getElementById('codeValue'), copy = document.getElementById('codeCopy'), note = document.getElementById('codeNote');
  S.api('/api/referral').then(({ code }) => {
    if (!code) { value.textContent = 'Not showing'; note.textContent = 'Ask the team at the lounge for your referral code.'; return; }
    value.textContent = code;
    note.textContent = 'Capitals, spaces and dashes do not matter when your friend types it in.';
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); copy.textContent = 'COPIED'; } catch { copy.textContent = 'PRESS AND HOLD TO COPY'; }
      setTimeout(() => { copy.textContent = 'COPY CODE'; }, 2200);
    });
  }).catch(() => { value.textContent = 'Not showing'; note.textContent = 'Your code could not be loaded just now. Try again, or ask the team at the lounge.'; });

  // The numbers, straight from the lounge settings.
  S.api('/api/lounge').then(info => {
    const r = info.rewards;
    const credits = r.referralPoints / r.pointsPerCredit;
    const earners = info.packages.filter(p => p.earnsReferralRewards).map(p => p.name);
    document.getElementById('earnCopy').innerHTML = `Once their first exchange is complete, <strong>${r.referralPoints} points</strong> are added to your account. That is <strong>${S.price(credits)}</strong> in DLC Credits.`;
    document.getElementById('worth').innerHTML = [
      [`${r.referralPoints}`, 'points for every friend you refer'],
      [S.price(credits), 'in DLC Credits for each friend'],
      [`${r.pointsPerCredit} points`, `are worth ${S.price(1)}. Credits can cover up to ${r.basketCapPercent}% of an exchange.`],
    ].map(([big, small]) => `<div class="li-band"><strong>${esc(big)}</strong><small>${esc(small)}</small></div>`).join('');
    const rules = [
      `<strong>One reward per friend.</strong> It is paid once, after their first completed exchange${r.referralMinExchange > 0 ? ` of at least ${S.price(r.referralMinExchange)}` : ''}. Joining on its own does not earn it.`,
      `<strong>Your package matters.</strong> ${esc(list(earners))} members collect referral rewards. Day Pass, Squads and free lounge access do not.`,
      '<strong>New members only.</strong> The code goes in when your friend registers, and it cannot be your own.',
    ];
    document.getElementById('rules').innerHTML = rules.map(x => `<li>${x}</li>`).join('');
  }).catch(() => {
    document.getElementById('worth').innerHTML = '<p class="li-error">The reward details could not be loaded just now. <a href="referrals.html">Try again</a>, or ask the team at the lounge.</p>';
  });
})();
