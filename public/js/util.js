/* Small shared helpers. Everything hangs off window.LS (same no-build style as portrait-js). */
(function (LS) {
  'use strict';

  LS.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  LS.lerp = (a, b, t) => a + (b - a) * t;

  /** Seeded RNG: portrait-js's PM.RNG when loaded, else a tiny fallback. */
  LS.rng = function (seed) {
    if (window.PM && PM.RNG) return new PM.RNG(seed);
    let s = (typeof seed === 'number' ? seed : String(seed).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) >>> 0 || 1;
    const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return { next, range: (a, b) => a + next() * (b - a), int: (a, b) => Math.floor(a + next() * (b - a + 1)), pick: arr => arr[Math.floor(next() * arr.length)], chance: p => next() < p,
      weighted(t) { const e = Object.entries(t); let r = next() * e.reduce((a, x) => a + x[1], 0); for (const [k, w] of e) if ((r -= w) <= 0) return k; return e.length ? e[e.length - 1][0] : null; } };
  };
  const R = () => LS._r || (LS._r = LS.rng(Date.now() % 1e9));
  LS.rand = () => R().next();
  LS.pick = arr => arr[Math.floor(LS.rand() * arr.length)];
  LS.chance = p => LS.rand() < p;
  LS.weighted = (items, wf) => {
    let total = 0; const ws = items.map(x => { const w = Math.max(0, wf(x)); total += w; return w; });
    if (total <= 0) return null;
    let r = LS.rand() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };

  /** Safe localStorage (blocked in some frames and private windows). */
  LS.storage = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  /** h('div.card#id', { onclick }, child, 'text', …) */
  LS.h = function (sel, attrs, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) { if (part[0] === '#') el.id = part.slice(1); else el.classList.add(part.slice(1)); }
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  LS.$ = (s, r) => (r || document).querySelector(s);
  LS.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  LS.naira = n => '₦' + Math.round(n).toLocaleString('en-NG');
  LS.sleep = ms => new Promise(r => setTimeout(r, ms));
  LS.fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  LS.titleCase = s => String(s).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
})(window.LS = window.LS || {});
