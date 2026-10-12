/* The game screen: the four bars, the card, the postcards, and what happens when you decide.
 * LS.Game owns the run state (LS.Engine does the rules) and persists it after every card.
 * The swipe is a small hand-rolled physics loop (no CSS transitions) so the card has weight:
 * it follows the finger 1:1, tilts about a point below the card, snaps back on a damped spring, and is thrown on release. */
(function (LS) {
  'use strict';
  const { h, $, clamp } = LS;
  const E = LS.Engine;
  const G = LS.Game = { s: null, card: null, busy: false, handle: null, look: null, meta: null };

  const ICONS = {
    wallet: '<text x="24" y="32" text-anchor="middle" font-size="24" font-weight="700" class="ico-text">₦</text>',
    heart: '<path d="M24 38 C9 28 8 14 17 13 C21 12.500 24 16.500 24 16.500 C24 16.500 27 12.500 31 13 C40 14 39 28 24 38 Z"/>',
    hustle: '<rect x="10" y="18" width="28" height="18" rx="3"/><path d="M18 18v-4h12v4M10 27h28"/>',
    peace: '<path d="M9 25 L24 12 L39 25"/><path d="M13 22v16h22V22"/><path d="M21 38v-9h6v9"/>',
  };
  const MOODS_NEW = ['neutral', 'happy', 'flirty', 'smug', 'happy', 'thinking'];
  const PLACE_ART = { housewarming: 'party', owambe: 'party', phone: 'phone', bus: 'bus', bank: 'cash', gym: 'work', church: 'church', work: 'work', mamaput: 'food', rooftop: 'rooftop', home: 'home' };

  // ------------------------------------------------------------------ HUD
  G.buildHud = function () {
    const bars = $('#bars'); bars.textContent = '';
    for (const k of LS.STAT_KEYS) {
      const el = h('div.bar', { 'data-stat': k, title: LS.STATS[k].blurb });
      el.innerHTML = '<div class="badge"><i class="level"></i><svg viewBox="0 0 48 48" class="face">' + ICONS[k] + '</svg></div><i class="arrow"></i><b class="delta"></b><span class="lbl">' + LS.STATS[k].label + '</span>';
      bars.append(el);
    }
  };

  G.updateHud = function () {
    const s = G.s; if (!s) return;
    for (const k of LS.STAT_KEYS) {
      const el = $(`.bar[data-stat="${k}"]`);
      const v = clamp(s.stats[k], 0, 100).toFixed(1);
      el.style.setProperty('--v', v); el.style.setProperty('--pv', v);
      el.classList.toggle('danger', E.isDanger(s, k));
    }
    $('#hud-age').textContent = `AGE ${s.age}`;
    $('#hud-sub').textContent = `${LS.STATUS[s.status]} · ${LS.JOBS[s.job].title}`;
    $('#hud-money').textContent = E.moneyText(s);
    const n = LS.social.unread;
    const b = $('#inbox-badge'); b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
    const d = E.danger(s), box = $('#danger');
    if (d && !s.over) { box.hidden = false; box.textContent = d.text; box.dataset.k = d.k; box.className = 'warn ' + (d.gap < 11 ? 'crit' : ''); } else box.hidden = true;
  };

  G.charmCount = () => (G.meta ? G.meta.charms || 0 : 0) + (LS.social.charms || 0);

  G.flashDeltas = function (deltas) {
    for (const [k, v] of Object.entries(deltas || {})) {
      if (Math.abs(v) < 0.6) continue;
      const el = $(`.bar[data-stat="${k}"] .delta`); if (!el) continue;
      el.textContent = (v > 0 ? '+' : '') + Math.round(v);
      el.className = 'delta show ' + (v > 0 ? 'up' : 'down');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    }
  };

  /** Show what an option would do: the level ghosts to where it would end up, with an arrow (bigger = more). */
  function previewDots(opt) {
    for (const k of LS.STAT_KEYS) {
      const el = $(`.bar[data-stat="${k}"]`), arrow = $('.arrow', el);
      const d = opt ? ((opt.fx || {})[k] || 0) * E.TUNE.fx : 0;
      const cur = clamp(G.s ? G.s.stats[k] : 50, 0, 100), to = clamp(cur + d, 0, 100);
      el.style.setProperty('--pv', to.toFixed(1));
      el.classList.toggle('gain', d > 0.4); el.classList.toggle('loss', d < -0.4);
      const m = Math.abs(d);
      arrow.className = 'arrow' + (m < 0.4 ? '' : m >= 11 ? ' a3' : m >= 5 ? ' a2' : ' a1') + (d < 0 ? ' dn' : '');
    }
  }

  G.toast = function (text, ms = 2200) {
    const t = $('#toast'); if (!text) return;
    t.textContent = text; t.classList.add('show');
    clearTimeout(G._toastT); G._toastT = setTimeout(() => t.classList.remove('show'), ms);
  };

  // ------------------------------------------------------------------ cards
  function genomeFor(card) {
    const w = card.who;
    if (!w) return null;
    if (w.type === 'cast') return LS.castGenome(w.key);
    if (w.type === 'partner') return G.s.partner && Object.assign({}, G.s.partner.genome, LS.LOOK);
    if (w.type === 'profile') return w.profile.genome;
    if (w.type === 'npc') return w.genome;
    return null;
  }

  const lifeLine = l => {
    const job = LS.JOBS.find(j => j.id === l.job), home = LS.HOMES.find(x => x.id === l.home);
    return [job && job.title, home && home.title, l.status && LS.STATUS[l.status]].filter(Boolean).join(' · ');
  };
  LS.lifeLine = lifeLine;

  const SKYLINE = '<svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true"><g fill="currentColor"><path d="M0 70V44h14V30h12v14h10V20h16v24h12V36h14V12h12v32h10V40h16V26h14v18h10V34h16V16h14v28h12V38h14V24h16v20h12V32h16v38z"/></g></svg>';

  function summaryRows(s) {
    const row = (k, v) => h('div.srow', h('span', k), h('b', v));
    return h('div.summary', row('Age reached', s.age), row('Months lived', Math.floor(s.month)), row('Loves', s.loves), row('Job', LS.JOBS[s.job].title), row('Home', LS.HOMES[s.home].title), row('Score', E.score(s)));
  }

  /** Who remembers you, strongest memory first: a line or two for the ending card. */
  function rememberedBy(s) {
    const out = [];
    for (const [key, p] of Object.entries(s.people)) {
      const mems = E.memories(s, key); if (!mems.length) continue;
      const name = (LS.CAST[key] && LS.CAST[key].name) || p.name || (s.partner && s.partner.id === key && s.partner.name);
      if (name) out.push({ name, t: mems[0].t, rel: p.rel });
    }
    return out.sort((a, b) => Math.abs(b.rel - 50) - Math.abs(a.rel - 50)).slice(0, 3);
  }

  /** Flag a caption that runs past the card, so it gets a soft edge to show there is more to read. */
  function markScrollable(el) {
    const look = () => el.classList.toggle('scrollable', el.scrollHeight - el.clientHeight > 2);
    setTimeout(look, 60);
    if (!markScrollable.bound) {
      markScrollable.bound = true;
      window.addEventListener('resize', () => { const t = $('.card-text'); if (t) t.classList.toggle('scrollable', t.scrollHeight - t.clientHeight > 2); });
    }
  }

  G.showCard = function (card) {
    const s = G.s, el = $('#card');
    if (G.handle) { G.handle.destroy(); G.handle = null; }
    G.card = card;
    el.textContent = ''; el.className = 'card kind-' + card.kind + (card.lose ? ' lose' : '') + (card.kind === 'real' ? ' is-real' : '');
    resetCard(el);

    const g = genomeFor(card);
    const placeArt = card.place && PLACE_ART[card.place];
    const head = h('div.card-head', h('div.who-block', h('b.who', card.who ? card.who.name : 'Lagos'), h('span.sub', (card.who && card.who.sub) || '')),
      card.kind === 'real' ? h('span.tag.real', 'Real player') : placeArt ? h('span.place', { html: LS.artSVG(placeArt) }) : null);
    const pic = h('div.picture');
    if (placeArt && LS.ART[placeArt]) pic.style.setProperty('--wash', `linear-gradient(${LS.ART[placeArt].c[0]}, ${LS.ART[placeArt].c[1]})`);
    const frame = h('div.portrait');
    pic.append(frame, h('div.skyline', { html: SKYLINE }));
    if (card.story) pic.append(h('span.story-tab', h('i'), card.story.title, card.story.ch ? ' · ' + card.story.ch : ''));
    el.append(head, pic);

    if (g) {
      const mood = card.kind === 'meet' || card.kind === 'real' ? MOODS_NEW[LS.hash(card.profile.id) % MOODS_NEW.length] : card.mood;
      G.handle = LS.portrait.live(frame, g, { width: 380, mood: card.kind === 'meet' && card.temptation ? 'flirty' : mood });
      if (card.profile && card.profile.avatar) pic.append(h('img.avatar-chip', { src: card.profile.avatar, alt: '' }));
    } else {
      frame.innerHTML = LS.vignette(placeArt || 'skyline');
      frame.classList.add('art');
    }

    if (card.kind === 'ending') {
      el.append(h('div.stamp-big', { class: 'stamp-big ' + (card.lose ? 'bad' : 'good') }, card.stamp || (card.lose ? 'GAME OVER' : 'YOU MADE IT')));
      el.append(h('h2.end-title', card.title), h('p.line', card.text), summaryRows(s));
      const rb = rememberedBy(s);
      if (rb.length) el.append(h('div.remembered', h('b', 'People remember'), rb.map(r => h('p', h('i', r.name + ': '), r.t))));
    } else {
      // the words live in their own box: a long card scrolls rather than losing its ending off the bottom
      const text = h('div.card-text');
      text.append(h('p.line', card.text));
      if (card.kind === 'real' && card.profile.vibes && card.profile.vibes.length) text.append(h('div.chips', card.profile.vibes.slice(0, 3).map(v => h('span.chip', LS.VIBES[v] || v))));
      // what this person remembers about you, a hint for the thoughtful
      const pk = card.pkey, mems = pk ? E.memories(s, pk) : [];
      if (mems.length && card.kind !== 'meet') text.append(h('p.recall', '“' + mems[0].t + '”'));
      el.append(text);
      markScrollable(text);
    }
    el.append(h('div.stamp.sl', { html: '' }), h('div.stamp.sr'));
    $('.stamp.sl', el).textContent = card.L.t; $('.stamp.sr', el).textContent = card.R.t;

    if (card.kind === 'ending') $('#toast').classList.remove('show');
    setPostcards(card);
    previewDots(null);
    G.busy = true;
    deal(el);
    clearTimeout(G._dealT); G._dealT = setTimeout(() => { if (G.card === card) G.busy = false; }, 280);

    // they speak the first sentence, if talk sound is on
    if (G.handle && card.kind !== 'ending' && LS.sound.enabled && LS.sound.unlocked && LS.sound.talk) {
      const line = String(card.text).replace(/^[^“"]*[“"]/, '').replace(/^[A-Za-z. ]+:\s*/, '').split(/(?<=[.!?…”])\s/)[0].slice(0, 90);
      setTimeout(() => { if (G.card === card) G.handle.say(line); }, 420);
    }
  };

  function setPostcards(card) {
    for (const side of ['L', 'R']) {
      const pc = $('#pc-' + side), opt = card[side];
      let label = opt.t, art = LS.artFor(opt, card);
      if (card.kind === 'ending' && side === 'R' && card.lose && G.charmCount() > 0) { label = `Lucky Charm (${G.charmCount()})`; art = 'charm'; }
      $('.pc-art', pc).innerHTML = LS.artSVG(art);
      $('.pc-lbl', pc).textContent = label;
      pc.classList.remove('lift', 'dim');
    }
    const box = $('#postcards'); box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  }

  // ------------------------------------------------------------------ swipe physics
  const P = { x: 0, y: 0, vx: 0, on: false, id: null, sx: 0, sy: 0, tx: 0, ty: 0, samples: [], side: null, raf: 0, w: 320 };
  const stackEl = () => $('#stack');

  function resetCard(el) {
    cancelAnimationFrame(P.raf); P.x = P.y = P.vx = P.tx = P.ty = 0; P.side = null;
    el.style.transform = ''; el.style.opacity = ''; el.classList.remove('dragging', 'deal');
    stackEl().style.setProperty('--p', 0); stackEl().style.setProperty('--pa', 0);
  }
  function deal(el) {
    void el.offsetWidth; el.classList.add('deal');
    LS.sound.play('click3', { vol: 0.5, rate: 0.95 });
  }

  /** Put the card at x (px) and drive everything that follows it: tilt, stamps, postcards, the next card behind. */
  function paint(x, y) {
    const el = $('#card'), W = P.w;
    P.x = x; P.y = y;
    const rot = clamp(x / W * 19, -22, 22);
    const lift = -Math.min(Math.abs(x) * 0.07, 16) + y * 0.35;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${lift.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`;
    const p = clamp(x / (W * 0.2), -1, 1);
    stackEl().style.setProperty('--p', p.toFixed(3)); stackEl().style.setProperty('--pa', Math.abs(p).toFixed(3));
    const side = p > 0.4 ? 'R' : p < -0.4 ? 'L' : null;
    if (side !== P.side) {
      P.side = side;
      if (side && G.card) { previewDots(G.card[side]); LS.sound.play('click4', { vol: 0.32 }); LS.sound.buzz(5); } else previewDots(null);
      $('#pc-L').classList.toggle('lift', side === 'L'); $('#pc-R').classList.toggle('lift', side === 'R');
      $('#pc-L').classList.toggle('dim', side === 'R'); $('#pc-R').classList.toggle('dim', side === 'L');
    }
  }

  /** Damped spring back to centre: quick, a hair of overshoot, no float. */
  function springBack(v0) {
    cancelAnimationFrame(P.raf);
    let x = P.x, y = P.y, vx = v0, vy = 0, last = performance.now();
    const k = 900, c = 46;
    const step = now => {
      const dt = Math.min(0.03, (now - last) / 1000); last = now;
      vx += (-k * x - c * vx) * dt; vy += (-k * y - c * vy) * dt; x += vx * dt; y += vy * dt;
      if (Math.abs(x) < 0.4 && Math.abs(vx) < 12 && Math.abs(y) < 0.4) { paint(0, 0); return; }
      paint(x, y); P.raf = requestAnimationFrame(step);
    };
    P.raf = requestAnimationFrame(step);
  }

  /** Throw the card off screen. Resolves when it's gone. */
  function throwCard(side, v0) {
    return new Promise(resolve => {
      cancelAnimationFrame(P.raf);
      const dir = side === 'R' ? 1 : -1, x0 = P.x, y0 = P.y, target = dir * (P.w * 1.25 + 90);
      const dur = clamp(330 - Math.abs(v0) * 0.05, 210, 330), t0 = performance.now();
      const step = now => {
        const t = clamp((now - t0) / dur, 0, 1), e = t * t * (3 - 2 * t) * 0.6 + (1 - Math.pow(1 - t, 2)) * 0.4;
        paint(x0 + (target - x0) * e, y0 + 30 * e);
        $('#card').style.opacity = String(1 - Math.max(0, t - 0.6) * 2.4);
        if (t < 1) P.raf = requestAnimationFrame(step); else resolve();
      };
      P.raf = requestAnimationFrame(step);
    });
  }

  /** Finger distance → card distance. The card starts stiff, gives a little, then gets harder to push (rubber). */
  const resist = (dx, W) => {
    const a = Math.abs(dx), knee = W * 0.26, sign = dx < 0 ? -1 : 1;
    const out = a < 14 ? a * 0.2 : 2.8 + (a - 14) * 0.5;
    return sign * (out > knee ? knee + (out - knee) * 0.35 : out);
  };

  /** While held, the card trails the finger with a bit of mass instead of being glued to it. */
  function follow() {
    let last = performance.now();
    const step = now => {
      if (!P.on) return;
      const dt = Math.min(0.04, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 24);
      paint(P.x + (P.tx - P.x) * k, P.y + (P.ty - P.y) * k);
      P.raf = requestAnimationFrame(step);
    };
    P.raf = requestAnimationFrame(step);
  }

  G.bindSwipe = function () {
    const el = $('#card');
    el.addEventListener('pointerdown', e => {
      if (G.busy || !G.card || e.button > 0 || P.on) return;
      cancelAnimationFrame(P.raf);
      P.on = true; P.id = e.pointerId; P.sx = e.clientX; P.sy = e.clientY; P.samples = [[performance.now(), 0]]; P.w = el.offsetWidth || 320;
      P.tx = P.x; P.ty = P.y; P.base = P.x;
      el.setPointerCapture(e.pointerId); el.classList.add('dragging'); el.classList.remove('deal');
      LS.sound.play('click', { vol: 0.2, rate: 1.3 });
      follow();
    });
    el.addEventListener('pointermove', e => {
      if (!P.on || e.pointerId !== P.id) return;
      const dx = e.clientX - P.sx, now = performance.now();
      P.tx = P.base + resist(dx, P.w); P.ty = clamp((e.clientY - P.sy) * 0.3, -26, 26);
      P.samples.push([now, dx]); while (P.samples.length > 2 && now - P.samples[0][0] > 110) P.samples.shift();
    });
    const end = e => {
      if (!P.on || e.pointerId !== P.id) return;
      P.on = false; el.classList.remove('dragging');
      const a = P.samples[0], b = P.samples[P.samples.length - 1];
      const v = b[0] > a[0] ? (b[1] - a[1]) / ((b[0] - a[0]) / 1000) : 0;   // px/s
      const thr = P.w * 0.2;   // on the resisted distance; this is a real, deliberate pull
      if (P.x > thr || (v > 1000 && P.x > 18)) G.choose('R', { v });
      else if (P.x < -thr || (v < -1000 && P.x < -18)) G.choose('L', { v });
      else springBack(0);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);

    for (const side of ['L', 'R']) {
      const pc = $('#pc-' + side);
      pc.addEventListener('click', () => G.choose(side, { tap: true }));
      pc.addEventListener('pointerenter', () => { if (G.card && !G.busy && !P.on) previewDots(G.card[side]); });
      pc.addEventListener('pointerleave', () => { if (!P.on) previewDots(null); });
    }
    document.addEventListener('keydown', e => {
      if ($('#sheet') && !$('#sheet').hidden) return;
      if (e.key === 'ArrowLeft') G.choose('L', { tap: true }); else if (e.key === 'ArrowRight') G.choose('R', { tap: true });
    });
  };

  // ------------------------------------------------------------------ resolving a choice
  G.choose = async function (side, o = {}) {
    if (G.busy || !G.card) return;
    const card = G.card, s = G.s;
    G.busy = true;
    LS.sound.stop();

    // the ending card: start again, or spend a lucky charm to go on
    if (card.kind === 'ending') {
      if (side === 'R' && card.lose && G.charmCount() > 0) return G.useCharm(card, o);
      LS.sound.play('click2', { vol: 0.6 });
      await throwCard(side, o.v || 0);
      return G.restart();
    }

    // a tap or key press "throws" from the centre with a little lean first
    if (o.tap) { P.x = 0; P.y = 0; }
    LS.sound.play('snap', { vol: 0.55, rate: side === 'R' ? 1.05 : 0.95 }); LS.sound.buzz(10);
    $('#pc-' + side).classList.add('lift'); $('#pc-' + (side === 'R' ? 'L' : 'R')).classList.add('dim');

    // real players: ask the server while the card flies. NPC meetings resolve locally.
    let call = null;
    if (card.kind === 'real') call = LS.social.swipe(card.profile.id, side === 'R' ? 'like' : 'pass');
    const flying = throwCard(side, o.v || (o.tap ? (side === 'R' ? 900 : -900) : 0));
    let matched;
    if (call && side === 'R') { const r = await Promise.race([call, LS.sleep(3500).then(() => ({ match: false }))]); matched = !!r.match; }

    const res = E.choose(s, card, side, { matched });
    G.flashDeltas(res.deltas);
    if (res.note) G.toast(res.note);
    if (res.match && card.kind === 'real') LS.sound.unlocked && LS.social.loadInbox();
    G.updateHud(); G.save(); G.syncSoon();
    await flying;
    if (res.ended && res.ended !== 'victory') LS.sound.play('drop', { vol: 0.8 });
    G.next();
  };

  G.next = function () {
    const s = G.s;
    if (LS.social.buffer.length < 3) LS.social.fillBuffer(LS.opposite(s.g));
    const card = E.draw(s, { realBuffer: LS.social.buffer });
    G.showCard(card);
    G.updateHud();
  };

  /** Record the finished life exactly once (score, endings, leaderboard). */
  G.finish = function () {
    const s = G.s, m = G.meta;
    if (!s || !s.over || s.recorded) return;
    s.recorded = true;
    m.runs = (m.runs || 0) + 1;
    m.endings = m.endings || {}; m.endings[s.over] = (m.endings[s.over] || 0) + 1;
    const score = E.score(s);
    if (score > (m.best || 0)) m.best = score;
    m.loves = (m.loves || 0) + s.loves;
    G.save();
    LS.platform.submitScore(score);
    LS.social.score(score, Math.floor(s.month), s.loves);
    LS.social.saveProfile(G.look, E.life(s));
  };

  G.useCharm = async function (card, o) {
    const s = G.s;
    if (G.meta.charms > 0) G.meta.charms--;
    else { LS.social.charms = Math.max(0, LS.social.charms - 1); LS.api.post('/spend', { n: 1 }).catch(() => {}); }
    LS.sound.play('appear-online', { vol: 0.8 });
    E.revive(s);
    await throwCard('R', 0);
    G.toast('The lucky charm holds. You’re back from the edge.');
    G.save(); G.updateHud(); G.next();
  };

  G.restart = function () {
    G.finish();
    G.s = E.newRun(LS.platform.player.name, LS.sexOf(G.look && G.look.genome));
    G.save();
    G.busy = false;
    G.next();
  };

  // ------------------------------------------------------------------ persistence
  const key = () => 'ls.v1.' + LS.platform.player.id;
  G.save = function () { LS.storage.set(key(), { look: G.look, run: G.s, meta: G.meta }); };
  G.load = function () {
    const d = LS.storage.get(key(), null);
    return d && typeof d === 'object' ? d : null;
  };

  let syncT = null;
  G.syncSoon = function () {
    const s = G.s;
    const sig = [s.job, s.home, s.status, s.age].join('|');
    if (G._sig !== sig) { G._sig = sig; clearTimeout(syncT); syncT = setTimeout(() => LS.social.saveProfile(G.look, E.life(s)), 4000); }
  };

  /** Pull the corner portrait up for the first time or after the look changes. */
  G.refreshMe = function () {
    const cv = $('#me-canvas');
    if (G.look && G.look.genome) LS.portrait.paint(cv, G.look.genome);
    const av = $('#me-avatar');
    if (LS.platform.player.avatar) { av.src = LS.platform.player.avatar; av.hidden = false; } else av.hidden = true;
  };

  /** Only woman and man: an older look with another value becomes a woman; who you look for is the other one. */
  G.fixLook = function () {
    const look = G.look; if (!look || !look.genome) return;
    look.genome.gender = LS.sexOf(look.genome);
    look.bio = Object.assign({}, look.bio, { looking: LS.opposite(look.genome) });
    LS.setPlayerGender(look.genome.gender);
    if (G.s) G.s.g = look.genome.gender;
  };

  G.init = function (look, run, meta) {
    G.look = look; G.meta = meta;
    G.fixLook();
    G.s = run && (!run.over || !run.recorded) ? E.fix(run) : E.newRun(LS.platform.player.name, LS.sexOf(look.genome));
    G.s.g = LS.sexOf(look.genome);
    G.buildHud(); G.bindSwipe(); G.refreshMe(); G.updateHud();
    G.next();
  };
})(window.LS = window.LS || {});
