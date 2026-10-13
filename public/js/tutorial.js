/* The first-time tour: a sticky note and a hand-drawn arrow that point at the thing to do next.
 *
 * It runs once per player (saved on the profile as meta.tut) and never blocks the game: the overlay lets every
 * touch through except the note's own buttons, so the first tip can simply be obeyed ("drag the card").
 * Each step is tied to a moment, not a timer:
 *
 *   swipe   the first card          waits for the first choice
 *   bars    the next card           a tap on Got it
 *   cash    straight after          a tap on Got it
 *   cost    the first card that     a tap on Got it  (points at the +/- naira on the postcards)
 *           costs or pays cash
 *   people  the card after that     a tap on Done
 *
 * "Skip tips" ends it for good; "Show the tips again" in the menu starts it over.
 * The arrows are drawn twice with a little wobble so they look pencilled, and draw themselves on. */
(function (LS) {
  'use strict';
  const { h, $ } = LS;
  const SVG = 'http://www.w3.org/2000/svg';
  const INK = '#1c1410', RED = '#d1432f';

  /** where: how the note sits against what it points at. ring: what to circle. */
  const STEPS = [
    { id: 'swipe', ring: '#postcards', doodle: 'swipe', where: { sel: '.card-text', pos: 'inside-top' }, wait: 'choose',
      text: 'Drag the card left or right to decide. Or tap one of these postcards. Try it!' },
    { id: 'bars', ring: '#bars', where: { sel: '#bars', pos: 'below' }, ok: 'Got it',
      text: 'These four bars are your life: Wallet, Heart, Hustle and Peace. If one runs empty or overflows, the story ends.' },
    { id: 'cash', ring: '#hud-money', where: { sel: '#bars', pos: 'below' }, ok: 'Got it',
      text: 'This is your cash. It moves with your Wallet bar. Tap it any time to visit the shop.' },
    { id: 'cost', ring: '.pc-money:not(:empty)', where: { sel: '#postcards', pos: 'above' }, ok: 'Got it', needs: card => cashCard(card), patience: 10,
      text: 'This is what the choice does to your cash. Green means money in. Red means money out.' },
    { id: 'people', ring: '#btn-inbox, #btn-menu', where: { sel: '#bars', pos: 'below' }, ok: 'Done',
      text: 'Messages from real players land in your inbox. The menu has your people, the shop and sound.' },
  ];
  const cashCard = card => !!card && card.kind !== 'ending' && ['L', 'R'].some(s => LS.Engine.cashOf(card[s]) !== 0);

  const T = LS.tutorial = { idx: -1, active: false, shown: false, waited: 0, root: null };

  // ------------------------------------------------------------------ drawing
  const jit = (n = 2.5) => (Math.random() - 0.5) * 2 * n;
  const el = (name, attrs) => { const e = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };

  /** A path that draws itself on, then stays. */
  function pencil(svg, d, { color = INK, width = 4, delay = 0, dur = 0.55, opacity = 1 } = {}) {
    const p = el('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity });
    svg.append(p);
    let len = 300; try { len = Math.ceil(p.getTotalLength()) + 2; } catch (e) { /* not laid out */ }
    p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    p.style.animation = `tutDraw ${dur}s ${delay}s ease-out forwards`;
    return p;
  }

  /** A loose, hand-drawn ring around a rectangle. */
  function ring(svg, r, delay) {
    const pad = 8, x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, hgt = r.height + pad * 2;
    const rx = Math.min(14, hgt / 2), j = () => jit(2.2);
    const d = `M ${x + rx + j()} ${y + j()} L ${x + w - rx + j()} ${y + j()} Q ${x + w + 3} ${y - 1} ${x + w + j()} ${y + rx + j()} L ${x + w + j()} ${y + hgt - rx + j()} ` +
      `Q ${x + w + 2} ${y + hgt + 3} ${x + w - rx + j()} ${y + hgt + j()} L ${x + rx + j()} ${y + hgt + j()} Q ${x - 3} ${y + hgt + 2} ${x + j()} ${y + hgt - rx + j()} ` +
      `L ${x + j()} ${y + rx + j()} Q ${x - 2} ${y - 3} ${x + rx + 10} ${y - 1 + j()}`;
    pencil(svg, d, { color: RED, width: 3.5, delay, dur: 0.6 });
    pencil(svg, d.replace(/-?\d+(\.\d+)?/g, m => String(Number(m) + jit(1.4))), { color: RED, width: 2, delay: delay + 0.08, dur: 0.6, opacity: 0.6 });
  }

  /** A curved arrow from (x1,y1) to (x2,y2), drawn twice, with a two-stroke head. */
  function arrow(svg, x1, y1, x2, y2, delay) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, bow = Math.min(34, len * 0.28) * (dx >= 0 ? 1 : -1);
    const c1x = x1 + dx * 0.3 + nx * bow, c1y = y1 + dy * 0.3 + ny * bow;
    const c2x = x1 + dx * 0.72 + nx * bow * 0.6, c2y = y1 + dy * 0.72 + ny * bow * 0.6;
    const line = j => `M ${x1 + j()} ${y1 + j()} C ${c1x + j()} ${c1y + j()}, ${c2x + j()} ${c2y + j()}, ${x2 + j()} ${y2 + j()}`;
    pencil(svg, line(() => 0), { width: 4.2, delay, dur: 0.5 });
    pencil(svg, line(() => jit(2)), { width: 2.2, delay: delay + 0.06, dur: 0.5, opacity: 0.55 });
    const ang = Math.atan2(y2 - c2y, x2 - c2x), hl = 17;
    const head = a => `M ${x2} ${y2} L ${x2 - Math.cos(ang + a) * hl + jit(1.5)} ${y2 - Math.sin(ang + a) * hl + jit(1.5)}`;
    pencil(svg, head(0.45) + ' ' + head(-0.45).replace(/^M [^L]+/, `M ${x2} ${y2}`), { width: 4.2, delay: delay + 0.42, dur: 0.22 });
  }

  /** The left-and-right doodle that says "this card swipes". */
  function swipeDoodle(svg, r, delay) {
    const cy = r.top + r.height * 0.5, cx = r.left + r.width / 2, half = Math.min(r.width * 0.34, 130);
    const wave = j => `M ${cx - half} ${cy + j()} C ${cx - half * 0.45} ${cy - 20 + j()}, ${cx + half * 0.45} ${cy + 20 + j()}, ${cx + half} ${cy + j()}`;
    // a chalky halo first, so the arrow reads on any picture
    pencil(svg, wave(() => 0), { color: '#fff7dd', width: 13, delay, dur: 0.6, opacity: 0.85 });
    pencil(svg, wave(() => 0), { color: INK, width: 5.5, delay, dur: 0.6 });
    pencil(svg, wave(() => jit(2)), { color: INK, width: 2.4, delay: delay + 0.05, dur: 0.6, opacity: 0.5 });
    const head = (x, dir) => `M ${x} ${cy} L ${x - dir * 20} ${cy - 15 + jit(2)} M ${x} ${cy} L ${x - dir * 20} ${cy + 15 + jit(2)}`;
    pencil(svg, head(cx + half, 1), { color: '#fff7dd', width: 13, delay: delay + 0.45, dur: 0.2, opacity: 0.85 });
    pencil(svg, head(cx - half, -1), { color: '#fff7dd', width: 13, delay: delay + 0.55, dur: 0.2, opacity: 0.85 });
    pencil(svg, head(cx + half, 1), { width: 5.5, delay: delay + 0.45, dur: 0.2 });
    pencil(svg, head(cx - half, -1), { width: 5.5, delay: delay + 0.55, dur: 0.2 });
  }

  // ------------------------------------------------------------------ showing a step
  function ensureRoot() {
    if (T.root) return T.root;
    T.root = h('div#tutorial.tut', { hidden: true });
    $('#app').append(T.root);
    window.addEventListener('resize', () => { if (T.shown) layout(); });
    return T.root;
  }

  function rectOf(sel) {
    const nodes = LS.$$(sel).filter(n => n.offsetParent !== null || n.getClientRects().length);
    if (!nodes.length) return null;
    const rs = nodes.map(n => n.getBoundingClientRect());
    const left = Math.min(...rs.map(r => r.left)), top = Math.min(...rs.map(r => r.top)), right = Math.max(...rs.map(r => r.right)), bottom = Math.max(...rs.map(r => r.bottom));
    const app = $('#app').getBoundingClientRect();
    return { left: left - app.left, top: top - app.top, width: right - left, height: bottom - top, right: right - app.left, bottom: bottom - app.top, nodes: rs.map(r => ({ left: r.left - app.left, top: r.top - app.top, width: r.width, height: r.height })) };
  }

  function layout() {
    const step = STEPS[T.idx]; if (!step || !T.root) return;
    const root = T.root;
    root.textContent = '';
    const app = $('#app').getBoundingClientRect();
    const svg = el('svg', { class: 'tut-svg', width: app.width, height: app.height, viewBox: `0 0 ${app.width} ${app.height}` });
    root.append(svg);

    const note = h('div.tut-note', { role: 'status' },
      h('p', step.text),
      h('div.tut-actions',
        step.ok ? h('button.btn.small.primary', { type: 'button', onclick: () => T.next() }, step.ok) : h('span.tut-hint', 'Go on, it’s your life.'),
        h('button.linkbtn', { type: 'button', onclick: () => T.skip() }, 'Skip tips')));
    root.append(note);

    // note position
    const w = Math.min(300, app.width - 28);
    note.style.width = w + 'px';
    const hgt = note.offsetHeight || 96;
    const wr = rectOf(step.where.sel) || { left: 20, top: 120, width: app.width - 40, height: 60, bottom: 180, right: app.width - 20 };
    let top;
    if (step.where.pos === 'above') top = wr.top - hgt - 64;
    else if (step.where.pos === 'inside-top') top = wr.top + 10;
    else top = wr.bottom + 58;
    top = LS.clamp(top, 8, app.height - hgt - 8);
    const cx = wr.left + wr.width / 2;
    const left = LS.clamp(cx - w / 2, 10, app.width - w - 10);
    note.style.left = left + 'px'; note.style.top = top + 'px';
    note.style.setProperty('--tilt', (cx > app.width / 2 ? -1.6 : 1.4) + 'deg');

    // doodles and arrows
    let delay = 0.15;
    if (step.doodle === 'swipe') { const pr = rectOf('.picture'); if (pr) { swipeDoodle(svg, pr, delay); delay += 0.8; } }
    const targets = step.ring ? rectOf(step.ring) : null;
    if (targets) {
      for (const r of targets.nodes) {
        ring(svg, r, delay);
        // from the note's edge nearest the target, to the target's edge nearest the note
        const tcx = r.left + r.width / 2, tcy = r.top + r.height / 2;
        const noteMidY = top + hgt / 2, below = tcy > noteMidY;
        const sx = LS.clamp(tcx, left + 26, left + w - 26), sy = below ? top + hgt + 2 : top - 2;
        const ex = tcx, ey = below ? r.top - 12 : r.top + r.height + 12;
        if (Math.abs(ey - sy) > 14) arrow(svg, sx, sy, ex, ey, delay + 0.35);
        delay += 0.2;
      }
    }
  }

  function show() {
    const step = STEPS[T.idx]; if (!step) return finish(false);
    ensureRoot().hidden = false;
    T.shown = true; T.waited = 0;
    // let the new card and postcards settle before measuring them
    requestAnimationFrame(() => requestAnimationFrame(layout));
  }

  function hide() { if (T.root) { T.root.hidden = true; T.root.textContent = ''; } T.shown = false; }

  function finish(skipped) {
    hide(); T.active = false; T.idx = -1;
    const m = LS.Game && LS.Game.meta;
    if (m) { m.tut = true; try { LS.Game.save(); } catch (e) { /* ignore */ } }
    if (skipped && LS.Game && LS.Game.toast) LS.Game.toast('Tips are always in the menu.');
  }

  // ------------------------------------------------------------------ the public bits
  /** True when this player has never had the tour. */
  T.due = () => { const G = LS.Game; return !!(G && G.meta && !G.meta.tut && !(G.meta.runs > 0) && G.s && (G.s.cards || 0) < 3); };

  /** Begin the tour at the card on screen. */
  T.start = function () { T.active = true; T.idx = 0; T.waited = 0; if (LS.Game && LS.Game.card) T.onCard(LS.Game.card); };
  T.next = function () { if (!T.active) return; T.idx++; if (T.idx >= STEPS.length) return finish(false); settle(); };
  T.skip = function () { finish(true); };

  /** After a step is done: show the next one now if its moment has come, otherwise wait for a card that suits. */
  function settle() {
    const step = STEPS[T.idx], card = LS.Game && LS.Game.card;
    if (!step) return finish(false);
    if (step.needs && !step.needs(card)) { hide(); return; }
    show();
  }

  /** The game dealt a card. Called from Game.showCard once the card and postcards are on screen. */
  T.onCard = function (card) {
    if (!T.active) return;
    const step = STEPS[T.idx];
    if (!step) return finish(false);
    if (card && card.kind === 'ending') { hide(); return; }
    if (step.wait === 'choose') { if (!T.shown) show(); else layout(); return; }
    if (T.shown) { layout(); return; }   // the note stays up across a card change until it's dismissed
    if (step.needs && !step.needs(card)) {
      T.waited++;
      if (T.waited > (step.patience || 6)) { T.idx++; T.waited = 0; settle(); }   // this player never met a card that costs money: skip that tip
      return;
    }
    show();
  };

  /** The player decided: a step that was waiting for exactly that is done. */
  T.onChoose = function () {
    if (!T.active) return;
    const step = STEPS[T.idx];
    // playing on counts as "got it": a note that was up is done, and the card is flying away anyway
    if (step && (step.wait === 'choose' || T.shown)) { hide(); T.idx++; T.waited = 0; }
  };

  /** From the menu: tips again, from wherever the player is. */
  T.restart = function () { const G = LS.Game; if (G && G.meta) { G.meta.tut = false; } hide(); T.start(); };
})(window.LS = window.LS || {});
