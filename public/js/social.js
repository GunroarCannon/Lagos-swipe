/* Multiplayer, the async way: your portrait and a preset bio live on the server; other players appear in your
 * deck as real profiles, and likes, matches and messages come back as notifications. Everything here degrades
 * quietly when the server (or the network) isn't there: the game is fully playable offline. */
(function (LS) {
  'use strict';
  const S = LS.social = {
    buffer: [],            // real players waiting to be drawn into the deck
    unread: 0, charms: 0, inbox: null, lastNotifAt: 0,
    listeners: [],
    onChange(f) { S.listeners.push(f); },
    _emit(kind, data) { S.listeners.forEach(f => { try { f(kind, data); } catch (e) { console.error(e); } }); },

    async me() {
      try {
        const r = await LS.api.get('/me');
        S.unread = r.unread || 0; S.charms = r.charms || 0; S.profile = r.profile;
        S._emit('me', r);
        return r;
      } catch (e) { return null; }
    },

    /** Save my portrait + bio (+ life summary + avatar). Quiet no-op when offline. */
    async saveProfile(look, life) {
      if (!look || !look.genome) return null;
      const bio = Object.assign({}, look.bio || {}, { life: life || null, age: (life && life.age) || (look.bio && look.bio.age) || 23 });
      try { return await LS.api.post('/profile', { genome: look.genome, bio, avatar: LS.platform.player.avatar || undefined }); } catch (e) { return null; }
    },

    async fillBuffer(show) {
      if (S.buffer.length >= 3 || S._filling) return;
      S._filling = true;
      try {
        const r = await LS.api.get('/discover?n=6&show=' + (show || 'all'));
        const have = new Set(S.buffer.map(p => p.id));
        for (const p of r.profiles || []) if (!have.has(p.id) && p.genome) S.buffer.push(LS.fromServer(p));
      } catch (e) { /* offline: NPC profiles only */ } finally { S._filling = false; }
    },

    /** Returns { match: bool, profile? } for a real player; never throws. */
    async swipe(target, dir) {
      try { const r = await LS.api.post('/swipe', { target, dir }); if (r.charms != null) S.charms = r.charms; return r; }
      catch (e) { return { match: false, error: e.code || 'error' }; }
    },

    async loadInbox() {
      try { S.inbox = await LS.api.get('/inbox'); S.unread = S.inbox.unread || 0; S._emit('inbox', S.inbox); return S.inbox; }
      catch (e) { return S.inbox; }
    },
    async markRead() { try { await LS.api.post('/inbox/read'); S.unread = 0; S._emit('me'); } catch (e) { /* ignore */ } },
    async chat(withId) { try { return (await LS.api.get('/chat?with=' + encodeURIComponent(withId))).messages; } catch (e) { return []; } },
    async say(to, k) { try { return await LS.api.post('/chat', { to, k }); } catch (e) { return null; } },
    async block(target) { try { await LS.api.post('/block', { target }); S.buffer = S.buffer.filter(p => p.id !== target); return true; } catch (e) { return false; } },
    async report(target, reason) { try { await LS.api.post('/report', { target, reason }); return true; } catch (e) { return false; } },
    async leaderboard() { try { return (await LS.api.get('/leaderboard')).top; } catch (e) { return null; } },
    async score(score, days, loves) { try { return await LS.api.post('/score', { score, days, loves }); } catch (e) { return null; } },

    /** Buy a pack of lucky charms through the world's pay sheet; the server verifies before crediting. */
    async buyCharms(productId = 'lucky_charms_5') {
      const p = await LS.platform.purchase(productId);
      const r = await LS.api.post('/claim', { purchaseId: p.purchaseId, productId });
      S.charms = r.charms; S._emit('me');
      return r;
    },

    /** Poll for news while the game is visible. */
    start() {
      const tick = async () => {
        if (document.hidden || S._paused) return;
        const before = S.unread;
        await S.me();
        if (S.unread > before) S._emit('news', S.unread - before);
      };
      S._timer = setInterval(tick, 25000);
      LS.platform.onResume(() => { S._paused = false; tick(); });
      LS.platform.onPause(() => { S._paused = true; });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
      return tick();
    },
  };

  /** Text for a notification, from its type and preset id. */
  LS.notifText = n => {
    const who = n.from && n.from.name ? n.from.name : 'Someone';
    switch (n.t) {
      case 'like': return `${who} said hello to you.`;
      case 'match': return `You and ${who} are now connected!`;
      case 'msg': return `${who}: “${LS.CHAT[n.k] || '…'}”`;
      default: return who;
    }
  };
})(window.LS = window.LS || {});
