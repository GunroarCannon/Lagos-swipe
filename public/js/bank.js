/* The shop. Two kinds of money meet here, and the screen keeps them apart in plain words:
 *
 *   CASH         — the ₦ number at the top of the game. It is your character's money: your Wallet bar (₦3,500 a
 *                  point) plus any cash you bought, which the server keeps safe and adds on top. It goes up and
 *                  down with the choices you make. It is not real money and can't be cashed out.
 *   REAL MONEY   — the Lagos Life naira you pay through the world's pay sheet. Every real-money button says "Pay".
 *
 * What it sells (unchanged):
 *   Lucky charms — with cash, or with real money.
 *   Cash         — with real money. It lands in the same ₦ number at the top.
 * Spending cash lowers the Wallet bar (bought cash goes first), so the player never converts anything.
 * The prices come from the server (LS.social.shop). FALLBACK is only what we show when the server can't be
 * reached, so the list is never empty: the pay sheet shows the real price before anything is charged, and the
 * server checks every purchase before crediting it.
 *
 * Spending Wallet cash is what ends runs at the low edge, so we always keep a working margin behind and never
 * let a charm be the thing that kills you. */
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
    return c === 'daily_limit' ? 'That’s all the cash you can take out of your Wallet today. Come back tomorrow.'
      : c === 'no_naira' ? 'Not enough cash for that.'
      : c === 'cancelled' ? 'No worries.'
      : c === 'offline' || c === 'session' ? 'You’re offline — the shop needs a connection.'
      : (e && e.message) || 'That didn’t go through.';
  };

  /** One thing you can buy: what you get on the left, one button with the price on the right. */
  const offer = (title, note, price, onclick, { off, real } = {}) =>
    h('button.item.pack' + (real ? '.real' : ''), { type: 'button', disabled: !!off, onclick },
      h('div.item-text', h('b', title), h('small', note)),
      h('b.price', price));

  const charmsWord = n => (n === 1 ? '1 lucky charm' : `${n} lucky charms`);

  /** Fill `box` with the shop, and refill it after every purchase. Used by the Shop sheet and the Menu. */
  LS.renderShop = async function renderShop(box) {
    const G = LS.Game, S = LS.social;
    box.textContent = '';
    box.append(h('p.muted', 'Loading…'));

    // The list never waits on this: it only refreshes our numbers, and FALLBACK stands in when it can't.
    let info = null;
    try { info = await S.shop(); } catch (e) { console.warn('[shop] price check failed, using the built-in list:', e && (e.code || e.message)); }
    box.textContent = '';

    const live = info || FALLBACK;
    const rate = live.rate || FALLBACK.rate, charmNgn = live.charmNgn || FALLBACK.charmNgn;
    if (info) S.bank = info.bank;
    const bank = S.bank || 0;

    // what the HUD shows, and how much of it can actually be spent without ending the run
    const wallet = G.s ? G.s.stats.wallet : null;
    const room = wallet == null ? 0 : Math.max(0, Math.floor(wallet - KEEP));
    const total = G.s ? LS.Engine.cash(G.s, bank) : bank;
    const spendable = bank + room * rate;
    const charms = G.charmCount();

    box.append(h('div.stash',
      h('div', h('b', LS.naira(total)), h('small', 'your cash'), h('em', 'Rises and falls with your Wallet bar.')),
      h('div', h('b', String(charms)), h('small', charms === 1 ? 'lucky charm' : 'lucky charms'), h('em', 'Saves you once when a bar hits the edge.'))));

    // ---------------------------------------------------------------- spend cash
    const cashRows = [];
    for (const n of [1, 5]) {
      const cost = n * charmNgn;
      const note = spendable >= cost ? 'Comes out of your cash'
        : total >= cost ? `Keep ${LS.naira(KEEP * rate)} in your Wallet so you don’t go broke`
        : `You need ${LS.naira(cost - total)} more cash`;
      cashRows.push(offer(charmsWord(n), note, LS.naira(cost), () => spend(n), { off: spendable < cost }));
    }
    box.append(LS.ui.section('Spend your cash',
      h('p.muted', 'Game money only. No real money leaves your pocket.'),
      h('div.list', cashRows)));

    // ---------------------------------------------------------------- real money
    const realRows = live.charmPacks.map(p =>
      offer(charmsWord(p.charms), 'Real money', `Pay ₦${p.naira.toLocaleString('en-NG')}`, () => buyPack(p, 'charm'), { real: true }));
    for (const p of live.packs) {
      realRows.push(offer(`${LS.naira(p.bank)} cash`, 'Real money. Added to your cash.', `Pay ₦${p.naira.toLocaleString('en-NG')}`, () => buyPack(p, 'cash'), { real: true }));
    }
    box.append(LS.ui.section('Pay with real money',
      h('p.muted', 'Comes out of your Lagos Life balance, not your game cash. Cash you buy can’t be cashed out.'),
      h('div.list', realRows)));

    // ---------------------------------------------------------------- actions
    const again = () => { G.updateHud(); return renderShop(box); };

    async function buyPack(p, what) {
      try {
        if (what === 'charm') await S.buyCharms(p.id); else await S.buyNaira(p.id);
        G.toast(what === 'charm' ? `Lucky charms: ${G.charmCount()}` : `${LS.naira(p.bank)} cash added.`);
        again();
      } catch (e) { G.toast(reason(e)); }
    }

    /** Cash you bought goes first; the rest comes out of the Wallet bar. */
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

  /** The HUD's cash button opens this. */
  LS.showBank = function () {
    const box = h('div.bank');
    LS.sheet.open('Shop', box);
    return LS.renderShop(box);
  };
})(window.LS = window.LS || {});
