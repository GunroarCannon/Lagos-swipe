/* The game screen: the four bars, the swipeable card, and what happens when you choose.
 * LS.Game owns the run state (LS.Engine does the rules) and persists it after every card. */
(function (LS) {
  'use strict';
  const { h, $, clamp } = LS;
  const E = LS.Engine;
  const G = LS.Game = { s: null, card: null, busy: false, handle: null, look: null, meta: null };

  const ICONS = {
    wallet: '<text x="24" y="31" text-anchor="middle" font-size="22" font-weight="700" class="ico-text">₦</text>',
    heart: '<path d="M24 37 C10 28 9 15 17 14 C21 13.600 24 17 24 17 C24 17 27 13.600 31 14 C39 15 38 28 24 37 Z"/>',
    hustle: '<rect x="11" y="19" width="26" height="17" rx="3"/><path d="M18 19v-4h12v4M11 27h26"/>',
    peace: '<path d="M10 25 L24 13 L38 25"/><path d="M14 22v15h20V22"/><path d="M21 37v-8h6v8"/>',
  };
  const MOODS_PROFILE = ['neutral', 'happy', 'flirty', 'smug', 'happy', 'thinking'];

  // ------------------------------------------------------------------ HUD
  G.buildHud = function () {
    const bars = $('#bars'); bars.textContent = '';
    for (const k of LS.STAT_KEYS) {
      const el = h('div.bar', { 'data-stat': k, title: LS.STATS[k].blurb });
      el.innerHTML = '<div class="badge"><div class="liquid"></div><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" class="ring"/>' + ICONS[k] + '</svg><i class="dot"></i><b class="delta"></b></div><span class="lbl">' + LS.STATS[k].label + '</span>';
      bars.append(el);
    }
  };

  G.updateHud = function () {
    const s = G.s; if (!s) return;
    for (const k of LS.STAT_KEYS) {
      const el = $(`.bar[data-stat="${k}"]`);
      const v = clamp(s.stats[k], 0, 100);
      $('.liquid', el).style.height = v + '%';
      el.classList.toggle('danger', E.isDanger(s, k));
    }
    $('#hud-age').textContent = `Age ${s.age}`;
    $('#hud-sub').textContent = `${LS.STATUS[s.status]} · ${LS.JOBS[s.job].title}`;
    $('#hud-money').textContent = E.moneyText(s);
    const n = LS.social.unread;
    const b = $('#inbox-badge'); b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
    const sup = G.superCount();
    $('#super-count').textContent = sup;
  };

  G.superCount = () => (G.meta ? G.meta.freeSuper || 0 : 0) + (LS.social.superLikes || 0);

  G.flashDeltas = function (deltas) {
    for (const [k, v] of Object.entries(deltas || {})) {
      if (Math.abs(v) < 0.6) continue;
      const el = $(`.bar[data-stat="${k}"] .delta`); if (!el) continue;
      el.textContent = (v > 0 ? '+' : '') + Math.round(v);
      el.className = 'delta show ' + (v > 0 ? 'up' : 'down');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    }
  };

  function previewDots(opt) {
    for (const k of LS.STAT_KEYS) {
      const dot = $(`.bar[data-stat="${k}"] .dot`);
      const v = opt ? Math.abs(opt.fx[k] || 0) : 0;
      dot.className = 'dot' + (v >= 11 ? ' big' : v >= 5 ? ' mid' : v > 0 ? ' small' : '');
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
    return null;
  }

  const SKYLINE = '<svg viewBox="0 0 300 160" class="skyline" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">' +
    '<path d="M10 140V90h24v50M34 140V60h30v80M64 140V100h20v40M84 140V40h34v100M118 140V80h26v50M144 140V50h20v90M164 140V95h30v45M194 140V70h28v70M222 140V105h24v35M246 140V85h38v55"/>' +
    '<path d="M0 140h300"/><circle cx="240" cy="28" r="14"/></g></svg>';

  G.showCard = function (card) {
    const s = G.s, el = $('#card');
    if (G.handle) { G.handle.destroy(); G.handle = null; }
    G.card = card;
    el.textContent = ''; el.className = 'card kind-' + card.kind + (card.kind === 'profile' && card.profile.kind === 'real' ? ' is-real' : '');
    el.style.transform = ''; el.style.opacity = '';

    const g = genomeFor(card);
    const head = h('div.card-head', h('b.who', card.who ? card.who.name : 'Lagos'), h('span.sub', card.who && card.who.sub || ''));
    const frame = h('div.portrait');
    if (card.kind === 'profile' && card.profile.kind === 'real') head.append(h('span.tag.real', 'Real player'));
    el.append(head, frame);

    if (g) {
      const mood = card.kind === 'profile' ? MOODS_PROFILE[LS.hash(card.profile.id) % MOODS_PROFILE.length] : card.mood;
      G.handle = LS.portrait.live(frame, g, { width: 300, mood });
      if (card.kind === 'profile' && card.profile.avatar) frame.append(h('img.avatar-chip', { src: card.profile.avatar, alt: '' }));
    } else frame.innerHTML = SKYLINE;

    if (card.kind === 'ending') {
      el.append(h('h2.end-title', card.title));
      el.append(h('p.line', card.text));
      el.append(summary(s));
    } else if (card.kind === 'profile') {
      const p = card.profile, bits = [];
      bits.push(h('span.chip.area', `${LS.areaLabel(p.area) || 'Lagos'}${p.km ? ' · ' + p.km + ' km' : ''}`));
      for (const v of (p.vibes || []).slice(0, 3)) bits.push(h('span.chip', LS.VIBES[v] || v));
      el.append(h('div.chips', bits));
      el.append(h('p.line', p.line || (p.love && LS.LOVE[p.love] ? 'Love language: ' + LS.LOVE[p.love] : '“Hi.”')));
      if (p.kind === 'real' && p.life) el.append(h('p.life', lifeLine(p.life)));
    } else {
      el.append(h('p.line', card.text));
    }
    el.append(h('div.stamp.stamp-r', card.kind === 'profile' ? 'LIKE' : '→'), h('div.stamp.stamp-l', card.kind === 'profile' ? 'PASS' : '←'));

    $('#lbl-left').textContent = card.L.t; $('#lbl-right').textContent = card.R.t;
    $('#btn-super').hidden = card.kind !== 'profile';
    $('#choice-hint').textContent = ''; previewDots(null);
    G.busy = false;

    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    // they speak the first sentence, if sound is on
    if (G.handle && card.kind !== 'ending' && card.kind !== 'profile') {
      const line = String(card.text).replace(/^["“{][^”"}]*[:：]\s*/, '').split(/(?<=[.!?…”])\s/)[0].slice(0, 90);
      setTimeout(() => { if (G.card === card && LS.sound.enabled && LS.sound.unlocked) G.handle.say(line); }, 380);
    }
  };

  const lifeLine = l => {
    const job = LS.JOBS.find(j => j.id === l.job), home = LS.HOMES.find(x => x.id === l.home);
    return [job && job.title, home && home.title, l.status && LS.STATUS[l.status]].filter(Boolean).join(' · ');
  };
  LS.lifeLine = lifeLine;

  function summary(s) {
    return h('div.summary',
      row('Age reached', s.age), row('Months lived', Math.floor(s.month)), row('Loves', s.loves),
      row('Job', LS.JOBS[s.job].title), row('Home', LS.HOMES[s.home].title), row('Score', E.score(s)));
    function row(k, v) { return h('div.srow', h('span', k), h('b', v)); }
  }

  // ------------------------------------------------------------------ swiping
  G.bindSwipe = function () {
    const el = $('#card');
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    const hint = $('#choice-hint');
    el.addEventListener('pointerdown', e => {
      if (G.busy || !G.card || e.button > 0) return;
      on = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      el.setPointerCapture(e.pointerId); el.classList.add('dragging'); el.classList.remove('enter');
    });
    el.addEventListener('pointermove', e => {
      if (!on) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${clamp(dy, -160, 60) * 0.5}px) rotate(${dx * 0.05}deg)`;
      const p = clamp(dx / 110, -1, 1), side = p > 0.12 ? 'R' : p < -0.12 ? 'L' : null;
      el.style.setProperty('--pr', Math.max(0, p)); el.style.setProperty('--pl', Math.max(0, -p));
      const up = G.card.kind === 'profile' && dy < -70 && Math.abs(dx) < 70;
      hint.textContent = up ? '★ Super like' : side ? G.card[side].t : '';
      hint.className = 'choice-hint' + (side ? ' side-' + side : '') + (up ? ' up' : '') + (side || up ? ' on' : '');
      previewDots(side && !up ? G.card[side] : null);
    });
    const end = e => {
      if (!on) return; on = false;
      el.classList.remove('dragging'); hint.className = 'choice-hint'; previewDots(null);
      if (G.card.kind === 'profile' && dy < -120 && Math.abs(dx) < 80) return G.choose('R', { superLike: true });
      if (Math.abs(dx) > 90) return G.choose(dx > 0 ? 'R' : 'L');
      el.style.transform = ''; el.style.setProperty('--pr', 0); el.style.setProperty('--pl', 0);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);

    $('#btn-left').addEventListener('click', () => G.choose('L'));
    $('#btn-right').addEventListener('click', () => G.choose('R'));
    $('#btn-super').addEventListener('click', () => G.choose('R', { superLike: true }));
    // preview dots on hover/focus of the buttons, like the drag
    for (const [id, side] of [['#btn-left', 'L'], ['#btn-right', 'R']]) {
      $(id).addEventListener('pointerenter', () => G.card && !G.busy && previewDots(G.card[side]));
      $(id).addEventListener('pointerleave', () => previewDots(null));
    }
    document.addEventListener('keydown', e => {
      if ($('#sheet') && !$('#sheet').hidden) return;
      if (e.key === 'ArrowLeft') G.choose('L'); else if (e.key === 'ArrowRight') G.choose('R');
    });
  };

  // ------------------------------------------------------------------ resolving a choice
  G.choose = async function (side, extra = {}) {
    if (G.busy || !G.card) return;
    const card = G.card, s = G.s, el = $('#card');
    if (extra.superLike) {
      if (G.superCount() < 1) { G.toast('No super likes left. Get more in the menu.'); el.style.transform = ''; return; }
    }
    G.busy = true;
    LS.sound.stop();
    if (card.kind === 'ending') return G.restart();

    // super likes: free ones first, then purchased packs (the server tracks those)
    let sup = null;
    if (extra.superLike) { if (G.meta.freeSuper > 0) { G.meta.freeSuper--; sup = 'free'; } else sup = 'paid'; }
    let matched;
    if (card.kind === 'profile' && card.profile.kind === 'real') {
      const dir = side === 'R' ? (sup === 'paid' ? 'super' : 'like') : 'pass';
      const call = LS.social.swipe(card.profile.id, dir);
      if (side === 'R') { const r = await Promise.race([call, LS.sleep(3500).then(() => ({ match: false }))]); matched = !!r.match; }
    } else if (sup === 'paid') { LS.social.superLikes = Math.max(0, LS.social.superLikes - 1); LS.api.post('/spend', { n: 1 }).catch(() => {}); }

    // fly the card off
    el.classList.add('leaving');
    el.style.transform = `translate(${side === 'R' ? 520 : -520}px, ${extra.superLike ? -420 : 20}px) rotate(${side === 'R' ? 28 : -28}deg)`;
    el.style.opacity = '0';

    const before = Object.assign({}, s.stats);
    const res = E.choose(s, card, side, { superLike: !!extra.superLike, matched });
    void before;
    G.flashDeltas(res.deltas);
    if (res.note) G.toast(res.note);
    if (res.match && card.kind === 'profile') G.afterMatch(res.match);
    G.updateHud();
    G.save();
    G.syncSoon(res);
    await LS.sleep(240);
    el.classList.remove('leaving');

    if (res.ended) {
      G.onEnd(res.ended);
    }
    G.next();
  };

  G.afterMatch = function () { LS.sound.unlocked && LS.social.loadInbox(); };

  G.next = function () {
    const s = G.s;
    if (LS.social.buffer.length < 3) LS.social.fillBuffer(G.look && G.look.bio && G.look.bio.looking);
    const card = E.draw(s, { realBuffer: LS.social.buffer, show: G.look && G.look.bio && G.look.bio.looking });
    G.showCard(card);
    G.updateHud();
  };

  G.onEnd = function (key) {
    const s = G.s, m = G.meta;
    m.runs = (m.runs || 0) + 1;
    m.endings = m.endings || {}; m.endings[key] = (m.endings[key] || 0) + 1;
    const score = E.score(s);
    if (score > (m.best || 0)) m.best = score;
    m.loves = (m.loves || 0) + s.loves;
    m.freeSuper = Math.max(m.freeSuper || 0, 0);
    G.save();
    LS.platform.submitScore(score);
    LS.social.score(score, Math.floor(s.month), s.loves);
    LS.social.saveProfile(G.look, E.life(s));
  };

  G.restart = function () {
    const m = G.meta;
    G.s = E.newRun(LS.platform.player.name);
    m.freeSuper = Math.max(m.freeSuper || 0, 3);
    G.save();
    G.busy = false;
    G.next();
    G.updateHud();
  };

  // ------------------------------------------------------------------ persistence
  const key = () => 'ls.v1.' + LS.platform.player.id;
  G.save = function () { LS.storage.set(key(), { look: G.look, run: G.s, meta: G.meta }); };
  G.load = function () {
    const d = LS.storage.get(key(), null);
    return d && typeof d === 'object' ? d : null;
  };

  let syncT = null;
  G.syncSoon = function (res) {
    const s = G.s;
    const sig = [s.job, s.home, s.status, s.age].join('|');
    if (G._sig !== sig) { G._sig = sig; clearTimeout(syncT); syncT = setTimeout(() => LS.social.saveProfile(G.look, E.life(s)), 4000); }
    void res;
  };

  /** Pull the whole game screen up for the first time or after the look changes. */
  G.refreshMe = function () {
    const cv = $('#me-canvas');
    if (G.look && G.look.genome) LS.portrait.paint(cv, G.look.genome);
    const av = $('#me-avatar');
    if (LS.platform.player.avatar) { av.src = LS.platform.player.avatar; av.hidden = false; } else av.hidden = true;
  };

  G.init = function (look, run, meta) {
    G.look = look; G.meta = meta; G.s = run && !run.over ? run : E.newRun(LS.platform.player.name);
    G.buildHud(); G.bindSwipe(); G.refreshMe(); G.updateHud();
    G.next();
  };
})(window.LS = window.LS || {});
