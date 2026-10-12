/* The home screen: a sticker-bombed wall. Faces from the cast, postcard pictures and slogans, slapped on at angles.
 * Each sticker is die-cut (a white border and a hard shadow). They are placed by hand in % of the screen so the title stays clear. */
(function (LS) {
  'use strict';
  const { h } = LS;

  // x, y = centre (% of the screen), w = width (% of screen width), r = degrees
  const LAYOUT = [
    // top wall
    { t: 'face', k: 'mama', x: 17, y: 11, w: 30, r: -7, shape: 'round' },
    { t: 'art', k: 'bus', x: 50, y: 7, w: 27, r: 4, shape: 'tile' },
    { t: 'face', k: 'tobi', x: 83, y: 12, w: 29, r: 8, shape: 'tile' },
    { t: 'text', s: 'E DEY!', c: '#1b6b4a', x: 33, y: 23, w: 25, r: -9 },
    { t: 'art', k: 'food', x: 66, y: 24, w: 25, r: 7, shape: 'round' },
    { t: 'face', k: 'adaeze', x: 9, y: 31, w: 23, r: 6, shape: 'round' },
    { t: 'text', s: 'ABEG', c: '#d94a6a', x: 92, y: 33, w: 19, r: 10 },
    // bottom wall
    { t: 'text', s: 'NO WAHALA', c: '#c99a4b', x: 27, y: 74, w: 36, r: -5, dark: true },
    { t: 'art', k: 'party', x: 77, y: 75, w: 24, r: 9, shape: 'round' },
    { t: 'face', k: 'aunty', x: 15, y: 87, w: 26, r: -9, shape: 'tile' },
    { t: 'art', k: 'church', x: 41, y: 86, w: 22, r: 5, shape: 'tile' },
    { t: 'face', k: 'dj', x: 66, y: 89, w: 24, r: -6, shape: 'round' },
    { t: 'text', s: 'JAPA?', c: '#2a7f78', x: 87, y: 62, w: 22, r: 12 },
    { t: 'art', k: 'cash', x: 8, y: 97, w: 20, r: 7, shape: 'round' },
    { t: 'text', s: 'DETTY DECEMBER', c: '#6a2a8a', x: 49, y: 97, w: 42, r: -3 },
    { t: 'face', k: 'conductor', x: 88, y: 94, w: 22, r: 8, shape: 'tile' },
    { t: 'art', k: 'heart', x: 8, y: 47, w: 14, r: -12, shape: 'round' },
    { t: 'art', k: 'phone', x: 92, y: 46, w: 14, r: 10, shape: 'tile' },
    { t: 'text', s: '₦', c: '#d4a017', x: 53, y: 77, w: 11, r: -8, coin: true, dark: true },
    { t: 'star', x: 5, y: 17, w: 9, r: 15 }, { t: 'star', x: 93, y: 21, w: 8, r: -10 }, { t: 'star', x: 51, y: 19, w: 7, r: 25 }, { t: 'star', x: 4, y: 62, w: 8, r: 5 },
  ];

  const STAR = '<svg viewBox="0 0 40 40"><path d="M20 3l4.6 11.2 12 1-9.2 7.8 2.9 11.7L20 28.2 9.7 34.7l2.9-11.7L3.4 15.2l12-1z" fill="#f7d54a" stroke="#1c1410" stroke-width="2.5" stroke-linejoin="round"/></svg>';

  /** Fill #stickers. Safe to call more than once. */
  LS.splashStickers = function () {
    const host = document.getElementById('stickers');
    if (!host || host.childElementCount) return;
    LAYOUT.forEach((d, i) => {
      let inner;
      const cls = ['stk', 'stk-' + d.t];
      if (d.shape) cls.push(d.shape);
      if (d.t === 'face') {
        const g = LS.castGenome(d.k);
        if (!g) return;
        const cv = LS.portrait.still(g, 220);
        inner = h('div.stk-in', cv);
      } else if (d.t === 'art') {
        inner = h('div.stk-in', { html: LS.artSVG(d.k) });
      } else if (d.t === 'star') {
        inner = h('div.stk-in', { html: STAR });
      } else {
        cls.push(d.coin ? 'coin' : 'slogan');
        inner = h('div.stk-in', { style: { background: d.c, color: d.dark ? '#1c1410' : '#fffaf0' } }, d.s);
        inner.style.setProperty('--fs', (d.coin ? 62 : Math.min(24, 118 / d.s.length)) + 'cqw');
      }
      const el = h('div', { class: cls.join(' '), style: { left: d.x + '%', top: d.y + '%', width: d.w + '%', zIndex: String(2 + (i % 5)) } }, inner);
      el.style.setProperty('--r', d.r + 'deg'); el.style.setProperty('--d', (i * 45) + 'ms');
      host.append(el);
    });
  };
})(window.LS = window.LS || {});
