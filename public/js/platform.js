/* Platform glue: the Vatar Games SDK when we're inside the Lagos Life game player, a local dev player otherwise,
 * plus the tiny fetch wrapper for our own /api. Nothing else in the game talks to Vatar directly. */
(function (LS) {
  'use strict';
  const SDK_URL = 'https://lagoslife.app/sdk/vatar-games-v1.js';
  const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const P = LS.platform = {
    mode: 'dev',            // 'live' | 'test' | 'dev'
    framed: false,
    player: { id: 'guest', name: 'Guest', avatar: null },
    sdk: null,
    _session: null,         // { session, exp }
    _pause: [], _resume: [], _purchase: [],

    async init() {
      const framed = window.self !== window.top;
      if (framed) {
        try {
          await loadScript(SDK_URL, 6000);
          if (window.Vatar) {
            const r = await Promise.race([window.Vatar.init(), LS.sleep(12000).then(() => { throw Object.assign(new Error('timeout'), { code: 'timeout' }); })]);
            P.sdk = window.Vatar; P.framed = true; P.mode = r.mode === 'test' ? 'test' : 'live';
            P.player = { id: r.player.id, name: r.player.name || 'Player', avatar: r.player.avatar || null };
            P._session = { session: r.session, exp: Date.now() + 14 * 60 * 1000 };
            window.Vatar.onPause(() => P._pause.forEach(f => f()));
            window.Vatar.onResume(() => P._resume.forEach(f => f()));
            window.Vatar.onPurchase(p => P._purchase.forEach(f => f(p)));
            return P;
          }
        } catch (e) { console.warn('[platform] Vatar unavailable, running as a guest:', e && (e.code || e.message)); }
      }
      // local / unframed: a stable guest id, with ?id= and ?name= to test several players on one machine
      const q = new URLSearchParams(location.search);
      let id = q.get('id') || LS.storage.get('ls.devid');
      if (!id) { id = 'g' + Math.random().toString(36).slice(2, 10); LS.storage.set('ls.devid', id); }
      const name = q.get('name') || LS.storage.get('ls.devname') || 'Guest' + id.slice(-3).toUpperCase();
      P.player = { id, name, avatar: null };
      return P;
    },

    async token() {
      if (!P.framed) return 'dev.' + b64url(JSON.stringify({ id: P.player.id, name: P.player.name }));
      if (!P._session || P._session.exp - Date.now() < 45000) {
        const r = await P.sdk.session();
        const exp = r.exp > 1e12 ? r.exp : (r.exp ? r.exp * 1000 : Infinity);
        P._session = { session: r.session, exp: Math.min(Date.now() + 14 * 60 * 1000, exp) };
      }
      return P._session.session;
    },

    onPause(f) { P._pause.push(f); },
    onResume(f) { P._resume.push(f); },
    /** A purchase confirmed while no purchase() call was waiting (the player came back from paying). */
    onPurchase(f) { P._purchase.push(f); },
    /** Paid purchases Vatar still shows as not delivered: { purchaseId, productId }[]. */
    async pending() {
      if (!P.framed) return [];
      try { return (await P.sdk.purchases()) || []; } catch (e) { return []; }
    },

    /** Buy a product with real naira through the world's pay sheet (or a pretend purchase in dev). */
    async purchase(productId) {
      if (P.framed) return P.sdk.purchase(productId);
      return { purchaseId: 'dev_' + Math.random().toString(36).slice(2, 10), productId };
    },
    async submitScore(n) { if (P.framed) { try { return await P.sdk.submitScore(n); } catch (e) { return null; } } return null; },
    async leaderboard() { if (P.framed) { try { return await P.sdk.leaderboard(); } catch (e) { return null; } } return null; },
  };

  function loadScript(src, ms) {
    return new Promise((resolve, reject) => {
      if (window.Vatar) return resolve();
      const s = document.createElement('script');
      const t = setTimeout(() => reject(new Error('sdk timeout')), ms);
      s.src = src; s.onload = () => { clearTimeout(t); resolve(); }; s.onerror = () => { clearTimeout(t); reject(new Error('sdk failed')); };
      document.head.append(s);
    });
  }

  // ----------------------------------------------------------------- our API
  LS.api = {
    online: true,
    async call(method, path, body) {
      let token;
      try { token = await P.token(); } catch (e) { throw Object.assign(new Error('session'), { code: 'session' }); }
      let r;
      try {
        r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
      } catch (e) { LS.api.online = false; throw Object.assign(new Error('offline'), { code: 'offline' }); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.message || j.error || 'error'), { code: j.error || 'error', status: r.status });
      LS.api.online = true;
      return j;
    },
    get(path) { return LS.api.call('GET', path); },
    post(path, body) { return LS.api.call('POST', path, body || {}); },
  };
})(window.LS = window.LS || {});
