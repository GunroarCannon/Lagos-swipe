/* The shop. There is one kind of money in the game: the naira in the HUD. It is your Wallet bar (at ₦3,500 a
 * point) plus any naira you bought with real money, which the server keeps safe and adds on top. Buying
 * lucky charms spends from that one number, bought naira first, so the player never has to convert anything.
 *
 * What it sells:
 *   Lucky charms — with real money (Lagos Life's pay sheet), or with naira.
 *   Naira        — with real money; it lands in the same HUD number.
 * The prices come from the server (LS.social.shop). FALLBACK is only what we show when the server can't be
 * reached, so the list is never empty: the pay sheet shows the real price before anything is charged, and the
 * server checks every purchase before crediting it.
 *
 * Paying with Wallet naira lowers the Wallet bar, which is what ends runs at the low edge, so we always keep
 * a working margin behind and never let a charm be the thing that kills you. */
(function (LS) {
  'use strict';
  const { h } = LS;

  /** Never take the Wallet bar below this: the bar ends the run at 0.5. */
  const KEEP = 6;

  const FALLBACK = {
    rate: 3500, charmNgn: 10000,
    packs: [{ id: 'naira_100', naira: 200, bank: 50000 }, { id: 'naira_500', naira: 500, bank: 275000 }, { id: 'naira_200', naira: 2000, bank: 1200000 }],
    charmPacks: [{ id: 'lucky_charms_5', naira: 100, charms: 3 }, { id: 'lucky_charms_20', naira: 300, charms: 15 }],
  };

  const reason = e => {
    const c = e && e.code;
    return c === 'daily_limit' ? 'That’s all the naira you can spend from your own pocket today. Come back tomorrow.'
      : c === 'no_naira' ? 'Not enough naira for that.'
      : c === 'cancelled' ? 'No worries.'
      : c === 'offline' || c === 'session' ? 'You’re offline — the shop needs a connection.'
      : (e && e.message) || 'That didn’t go through.';
  };

  /** One thing you can buy: what you get on the left, one button with the price on the right. */
  const offer = (title, note, price, onclick, { off, real } = {}) =>
    h('button.item.pack' + (real ? '.real' : ''), { type: 'button', disabled: !!off, onclick },
      h('div.item-text', h('b', title), h('small', note)),
      h('b.price', price));

  /** Fill `box` with the shop, and refill it after every purchase. Used by the Shop sheet and the Menu. */
  LS.renderShop = async function renderShop(box) {
    const G = LS.Game, S = LS.social;
    box.textContent = '';
    box.append(h('p.muted', 'Loading…'));

    let info = null, failure = null;
    try { info = await S.shop(); } catch (e) { failure = e; }
    box.textContent = '';

    const live = info || FALLBACK;
    const rate = live.rate || FALLBACK.rate, charmNgn = live.charmNgn || FALLBACK.charmNgn;
    if (info) S.bank = info.bank;
    const bank = S.bank || 0;

    // what the HUD shows, and how much of it can actually be spent without ending the run
    const wallet = G.s ? G.s.stats.wallet : null;
    const room = wallet == null ? 0 : Math.max(0, Math.floor(wallet - KEEP));
    const total = (wallet == null ? 0 : wallet * rate) + bank;
    const spendable = bank + room * rate;

    box.append(h('div.stash',
      h('div', h('b', LS.naira(total)), h('small', 'your naira')),
      h('div', h('b', String(G.charmCount())), h('small', G.charmCount() === 1 ? 'lucky charm' : 'lucky charms'))));

    if (!info) {
      const off = failure && (failure.code === 'offline' || failure.code === 'session');
      box.append(h('p.muted.center', off ? 'You’re offline, so these prices may be out of date. ' : 'Couldn’t reach the shop just now. ',
        h('button.linkbtn', { type: 'button', onclick: () => renderShop(box) }, 'Try again')));
    }

    // ---------------------------------------------------------------- lucky charms
    const charmRows = live.charmPacks.map(p =>
      offer(`${p.charms} lucky charms`, 'Pay with real money', `Pay ₦${p.naira.toLocaleString('en-NG')}`, () => buyPack(p, 'charm'), { real: true }));
    for (const n of [1, 5]) {
      const cost = n * charmNgn;
      const note = spendable >= cost ? 'Pay with your naira'
        : total >= cost ? `Keep ${LS.naira(KEEP * rate)} aside to stay afloat`
        : `Need ${LS.naira(cost - total)} more naira`;
      charmRows.push(offer(n === 1 ? '1 lucky charm' : `${n} lucky charms`, note, LS.naira(cost), () => spend(n), { off: spendable < cost }));
    }
    box.append(LS.ui.section('Lucky charms',
      h('p.muted', 'A lucky charm pulls you back once when a bar hits the edge.'),
      h('div.list', charmRows)));

    // ---------------------------------------------------------------- naira
    box.append(LS.ui.section('Buy naira',
      h('p.muted', 'It’s added to your naira at the top of the screen. It isn’t real money and can’t be cashed out.'),
      h('div.list', live.packs.map(p => offer(`${LS.naira(p.bank)} naira`, 'Pay with real money', `Pay ₦${p.naira.toLocaleString('en-NG')}`, () => buyPack(p, 'naira'), { real: true })))));

    // ---------------------------------------------------------------- actions
    const again = () => { G.updateHud(); return renderShop(box); };

    async function buyPack(p, what) {
      try {
        const r = what === 'charm' ? await S.buyCharms(p.id) : await S.buyNaira(p.id);
        G.toast(what === 'charm' ? `Lucky charms: ${G.charmCount()}` : `${LS.naira(r.bank)} naira added.`);
        again();
      } catch (e) { G.toast(reason(e)); }
    }

    /** Naira bought with real money goes first; the rest comes out of the Wallet bar. */
    async function spend(count) {
      try {
        const cost = count * charmNgn, fromBank = Math.min(S.bank, cost), points = Math.ceil((cost - fromBank) / rate);
        if (points > 0) {
          await S.exchange(points);
          G.s.stats.wallet = Math.max(0, G.s.stats.wallet - points);
          G.save();
        }
        await S.buyCharmsWithNaira(count);
        G.toast(`Lucky charms: ${G.charmCount()}`);
        again();
      } catch (e) { G.toast(reason(e)); again(); }
    }
  };

  /** The HUD's naira button opens this. */
  LS.showBank = function () {
    const box = h('div.bank');
    LS.sheet.open('Shop', box);
    return LS.renderShop(box);
  };
})(window.LS = window.LS || {});
