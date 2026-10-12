/* The bank: a spendable in-game naira balance, bought two ways — out of your own Wallet stat, or with real
 * money through the world's pay sheet — and spent on lucky charms. Every price shown here comes from the
 * server (LS.social.shop), so the game never invents one.
 *
 * Turning Wallet points over spends the stat itself, which is what ends runs at the low edge, so we always
 * leave a working margin behind and never let the exchange be the thing that kills you. */
(function (LS) {
  'use strict';
  const { h } = LS;

  /** Never take the Wallet bar below this: the bar ends the run at 0.5. */
  const KEEP = 6;

  const reason = e => {
    const c = e && e.code;
    return c === 'daily_limit' ? 'That’s all the Wallet points you can turn over today.'
      : c === 'no_naira' ? 'Not enough in the bank for that.'
      : c === 'cancelled' ? 'No worries.'
      : c === 'offline' || c === 'session' ? 'You’re offline — the bank needs a connection.'
      : (e && e.message) || 'That didn’t go through.';
  };

  LS.showBank = async function () {
    const G = LS.Game, S = LS.social;
    const body = h('div.bank', h('p.muted', 'Loading…'));
    LS.sheet.open('Bank', body);

    let info = null;
    try { info = await S.shop(); } catch (e) { /* offline: the cached numbers below still show */ }
    body.textContent = '';

    const bank = info ? info.bank : S.bank;
    const charmNgn = (info && info.charmNgn) || 10000;
    const rate = (info && info.rate) || 3500;

    body.append(h('div.bank-head',
      h('b.bank-sum', LS.naira(bank)),
      h('small', 'in the bank')));

    // ---------------------------------------------------------------- earn it from the Wallet stat
    const wallet = G.s ? G.s.stats.wallet : null;
    const room = wallet == null ? 0 : Math.floor(wallet - KEEP);
    const max = Math.min((info && info.exchangeMax) || 40, room);

    if (wallet == null) {
      body.append(LS.ui.section('Turn Wallet money into naira', h('p.muted', 'Start a life first — the bank trades in your Wallet stat.')));
    } else if (max < 1) {
      body.append(LS.ui.section('Turn Wallet money into naira',
        h('p.muted', `Your Wallet is at ${Math.round(wallet)}. Keep it above ${KEEP} or the run ends, so there’s nothing to spare yet.`)));
    } else {
      let points = Math.min(max, 10);
      const out = h('b', '');
      const paint = () => { out.textContent = LS.naira(points * rate); };
      const range = h('input', { type: 'range', min: 1, max, step: 1, value: points, oninput: e => { points = +e.target.value; paint(); } });
      paint();
      body.append(LS.ui.section('Turn Wallet money into naira',
        h('label.slider', h('span', `${rate.toLocaleString('en-NG')} a point`), range),
        h('p.muted', points === 1 ? '1 Wallet point' : `${points} Wallet points`, ' → ', out,
          ` · your Wallet drops to ${Math.round(wallet - points)}`),
        h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => exchange(points) }, 'Put it in the bank')),
        h('p.fine', info
          ? `You’ve turned over ${info.exchangedToday} of ${info.exchangeDay} Wallet points today.`
          : 'Your Wallet stat becomes in-game naira at the same rate the HUD already shows.')));
    }

    // ---------------------------------------------------------------- or buy it with real money
    const packs = (info && info.packs) || [];
    if (packs.length) {
      body.append(LS.ui.section('Or buy naira with real money',
        h('div.list', packs.map(p => h('button.item.pack', { type: 'button', onclick: () => buy(p) },
          h('div.item-text', h('b', `${p.name} in the bank`), h('small', `Pay ₦${p.naira.toLocaleString('en-NG')}`)),
          h('b.pts', `₦${p.naira.toLocaleString('en-NG')}`)))),
        h('p.fine', 'Paid through Lagos Life’s own pay sheet. Your card never touches the game.')));
    }

    // ---------------------------------------------------------------- spend it
    let n = 1;
    const cost = h('b', '');
    const paintCost = () => { cost.textContent = LS.naira(n * charmNgn); };
    const nRange = h('input', { type: 'range', min: 1, max: 10, step: 1, value: 1, oninput: e => { n = +e.target.value; paintCost(); } });
    paintCost();
    body.append(LS.ui.section('Spend it on lucky charms',
      h('label.slider', h('span', `${LS.naira(charmNgn)} each`), nRange),
      h('p.muted', n === 1 ? '1 lucky charm for ' : `${n} lucky charms for `, cost, ` · you have ${G.charmCount()}`),
      h('div.actions', h('button.btn', { type: 'button', onclick: () => spend(n) }, 'Buy charms'))));

    body.append(h('p.fine', 'In-game naira is not real money and can’t be cashed out.'));

    // ---------------------------------------------------------------- actions
    async function exchange(points) {
      try {
        await S.exchange(points);
        G.s.stats.wallet = Math.max(0, G.s.stats.wallet - points);
        G.updateHud(); G.save();
        G.toast(`${LS.naira(points * rate)} in the bank.`);
        LS.showBank();
      } catch (e) { G.toast(reason(e)); }
    }

    async function buy(p) {
      try {
        const r = await S.buyNaira(p.id);
        G.toast(`${LS.naira(r.bank)} in the bank.`);
        LS.showBank();
      } catch (e) { G.toast(reason(e)); }
    }

    async function spend(count) {
      try {
        await S.buyCharmsWithNaira(count);
        G.toast(`Lucky charms: ${G.charmCount()}`);
        G.updateHud();
        LS.showBank();
      } catch (e) { G.toast(reason(e)); }
    }
  };
})(window.LS = window.LS || {});
