/* The shop: what the naira balance in the HUD opens. Two things to buy, each said plainly:
 *   Lucky charms — with real money (Lagos Life's pay sheet) or with in-game naira from the bank.
 *   Naira        — in-game money, with real money, or earned by turning over your Wallet stat.
 * Every price comes from the server (LS.social.shop), so the game never invents one.
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
      : c === 'no_naira' ? 'Not enough in-game naira for that.'
      : c === 'cancelled' ? 'No worries.'
      : c === 'offline' || c === 'session' ? 'You’re offline — the shop needs a connection.'
      : (e && e.message) || 'That didn’t go through.';
  };

  /** One thing you can buy: what you get on the left, one button with the price on the right. */
  const offer = (title, note, price, onclick, { off, real } = {}) =>
    h('button.item.pack' + (real ? '.real' : ''), { type: 'button', disabled: !!off, onclick },
      h('div.item-text', h('b', title), h('small', note)),
      h('b.price', price));

  LS.showBank = async function () {
    const G = LS.Game, S = LS.social;
    const body = h('div.bank', h('p.muted', 'Loading…'));
    LS.sheet.open('Shop', body);

    let info = null;
    try { info = await S.shop(); } catch (e) { /* offline: the cached numbers below still show */ }
    body.textContent = '';

    const bank = info ? info.bank : S.bank;
    const charmNgn = (info && info.charmNgn) || 10000;
    const rate = (info && info.rate) || 3500;
    const packs = (info && info.packs) || [];
    const charmPacks = (info && info.charmPacks) || [];

    // ---------------------------------------------------------------- what you have
    body.append(h('div.stash',
      h('div', h('b', LS.naira(bank)), h('small', 'in-game naira')),
      h('div', h('b', String(G.charmCount())), h('small', 'lucky charms'))));

    if (!info) body.append(h('p.muted.center', 'Prices load when you’re online.'));

    // ---------------------------------------------------------------- lucky charms
    const charmRows = [];
    for (const p of charmPacks) {
      charmRows.push(offer(p.name, 'Pay with real money', `Pay ₦${p.naira.toLocaleString('en-NG')}`, () => buyPack(p, 'charm'), { real: true }));
    }
    if (info) {
      for (const n of [1, 5]) {
        const cost = n * charmNgn, short = cost - bank;
        charmRows.push(offer(n === 1 ? '1 lucky charm' : `${n} lucky charms`,
          short > 0 ? `Need ${LS.naira(short)} more in-game naira` : 'Pay with in-game naira',
          LS.naira(cost), () => spend(n), { off: short > 0 }));
      }
    }
    if (charmRows.length) {
      body.append(LS.ui.section('Lucky charms',
        h('p.muted', 'A lucky charm pulls you back once when a bar hits the edge.'),
        h('div.list', charmRows)));
    }

    // ---------------------------------------------------------------- naira
    if (packs.length) {
      body.append(LS.ui.section('In-game naira',
        h('p.muted', 'Spend it on lucky charms. It isn’t real money and can’t be cashed out.'),
        h('div.list', packs.map(p => offer(`${LS.naira(p.bank)} in-game naira`, 'Pay with real money', `Pay ₦${p.naira.toLocaleString('en-NG')}`, () => buyPack(p, 'naira'), { real: true })))));
    }

    // ---------------------------------------------------------------- or earn it from the Wallet stat
    const wallet = G.s ? G.s.stats.wallet : null;
    const room = wallet == null ? 0 : Math.floor(wallet - KEEP);
    const max = Math.min((info && info.exchangeMax) || 40, room);
    let earn;
    if (wallet == null) {
      earn = h('p.muted', 'Start a life first — this trades in your Wallet stat.');
    } else if (max < 1) {
      earn = h('p.muted', `Your Wallet is at ${Math.round(wallet)}. Keep it above ${KEEP} or the run ends, so there’s nothing to spare yet.`);
    } else {
      let points = Math.min(max, 10);
      const out = h('b', '');
      const paint = () => { out.textContent = LS.naira(points * rate); };
      const range = h('input', { type: 'range', min: 1, max, step: 1, value: points, oninput: e => { points = +e.target.value; paint(); } });
      paint();
      earn = h('div',
        h('label.slider', h('span', `${rate.toLocaleString('en-NG')} a point`), range),
        h('p.muted', points === 1 ? '1 Wallet point' : `${points} Wallet points`, ' → ', out, ` · your Wallet drops to ${Math.round(wallet - points)}`),
        h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => exchange(points) }, 'Turn it into naira')),
        h('p.fine', info ? `You’ve turned over ${info.exchangedToday} of ${info.exchangeDay} Wallet points today.` : ''));
    }
    body.append(h('details.earn', h('summary', 'Or get naira free from your Wallet'), earn));

    // ---------------------------------------------------------------- actions
    async function exchange(points) {
      try {
        await S.exchange(points);
        G.s.stats.wallet = Math.max(0, G.s.stats.wallet - points);
        G.updateHud(); G.save();
        G.toast(`${LS.naira(points * rate)} added.`);
        LS.showBank();
      } catch (e) { G.toast(reason(e)); }
    }

    async function buyPack(p, what) {
      try {
        const r = what === 'charm' ? await S.buyCharms(p.id) : await S.buyNaira(p.id);
        G.toast(what === 'charm' ? `Lucky charms: ${G.charmCount()}` : `${LS.naira(r.bank)} in-game naira.`);
        G.updateHud();
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
