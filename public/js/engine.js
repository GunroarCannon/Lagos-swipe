/* The life-sim engine: state, the deck, dating arcs, life ladders and endings. No DOM in here, so it
 * runs headless in tests. Cards are plain objects (see cards.js); the UI turns them into portraits. */
(function (LS) {
  'use strict';
  const { clamp } = LS;
  const E = LS.Engine = {};

  const START_AGE = 23, END_AGE = 35;
  E.START_AGE = START_AGE; E.END_AGE = END_AGE;

  // ------------------------------------------------------------------ state
  E.newRun = function (name) {
    const s = {
      v: 1, name: name || 'You', month: 0, age: START_AGE,
      stats: { wallet: 50, heart: 48, hustle: 40, peace: 55 },
      job: 1, home: 0, friends: 2, status: 'single', partner: null,
      flags: {}, queue: [], cd: {}, seen: {}, lastDoms: [], matches: [], loves: 0, cards: 0, profiles: 0, mid: 0, counter: 0,
      log: [], over: null,
    };
    s.queue.push({ id: 't_welcome', at: 0 }, { id: 't_balance', at: 0 }, { id: 'nysc_end', at: 11 });
    return s;
  };

  // ------------------------------------------------------------------ helpers
  const byId = id => LS.CARDS.find(c => c.id === id);
  const vars = s => ({ name: s.name, partner: s.partner ? s.partner.name : 'them' });

  function who(s, key) {
    if (!key) return { type: 'narrator', name: 'Lagos', sub: 'The city' };
    if (key === 'PARTNER') return s.partner ? { type: 'partner', name: s.partner.name, sub: 'Your ' + (s.status === 'married' ? 'spouse' : s.status === 'engaged' ? 'fiancé(e)' : 'partner'), id: s.partner.id } : { type: 'narrator', name: 'Lagos', sub: '' };
    const c = LS.CAST && LS.CAST[key];
    return { type: 'cast', key, name: c ? c.name : key, sub: c ? c.who : '' };
  }

  function instance(s, c) {
    const f = t => LS.fill(t, vars(s));
    const L = { t: f(c.L.t), fx: c.L.fx, ex: c.L.ex }, R = { t: f(c.R.t), fx: c.R.fx, ex: c.R.ex };
    return { id: c.id, kind: 'event', dom: c.dom, who: who(s, c.who), mood: c.mood || 'neutral', text: f(c.text), L, R, time: c.time != null ? c.time : 1, def: c };
  }

  const eligible = (s, c) => {
    if (!c.w || c.w <= 0) return 0;
    if (c.once && s.seen[c.id]) return 0;
    if (c.cd && s.cd[c.id] != null && s.month - s.cd[c.id] < c.cd) return 0;
    if (c.when && !c.when(s)) return 0;
    if (c.who === 'PARTNER' && !s.partner) return 0;
    let w = c.w;
    if (s.lastDoms[s.lastDoms.length - 1] === c.dom) w *= 0.45;
    if (s.lastDoms.length > 1 && s.lastDoms[s.lastDoms.length - 2] === c.dom) w *= 0.7;
    // a bar near its edge makes the cards that can pull it back more likely
    const st = s.stats;
    if (c.dom === 'health' && st.peace < 35) w *= 1.8;
    if (c.dom === 'money' && st.wallet < 30) w *= 1.4;
    if (c.dom === 'social' && st.heart < 35) w *= 1.5;
    return w;
  };

  // ------------------------------------------------------------------ drawing the next card
  /** opts.realBuffer: [server profile objects already converted by LS.fromServer] to mix into the deck. */
  E.draw = function (s, opts = {}) {
    if (s.over) return endingCard(s, s.over);
    // 1. queued follow-ups that are due
    const qi = s.queue.findIndex(q => q.at <= s.month);
    if (qi >= 0) {
      const q = s.queue.splice(qi, 1)[0];
      if (q.arc != null) { const m = s.matches.find(x => x.mid === q.arc); if (m) return arcCard(s, m); }
      else if (q.cheat) return cheatCard(s);
      else { const c = byId(q.id); if (c) return instance(s, c); }
    }
    // 2. profile cards or life events
    // single people swipe a lot; once you're taken, profiles thin out (and liking one has consequences)
    const share = !s.partner ? 0.32 : s.status === 'dating' ? 0.14 : 0.05;
    const cands = LS.CARDS.map(c => [c, eligible(s, c)]).filter(x => x[1] > 0);
    const eventW = cands.reduce((a, x) => a + x[1], 0);
    const profileW = eventW * share / (1 - share);
    if (Math.random() * (eventW + profileW) < profileW) return profileCard(s, opts);
    const pick = LS.weighted(cands, x => x[1]);
    return pick ? instance(s, pick[0]) : profileCard(s, opts);
  };

  function profileCard(s, opts) {
    let p = null;
    const rb = opts.realBuffer;
    if (rb && rb.length && Math.random() < 0.4) p = rb.shift();
    if (!p) { s.counter++; p = LS.makeProfile((LS.hash(s.name) % 9973) * 100000 + s.counter * 7 + s.mid, { show: opts.show || 'all' }); }
    return { id: 'profile:' + p.id, kind: 'profile', dom: 'love', who: { type: 'profile', name: p.name, sub: `${p.age} · ${LS.jobLabel(p.job)}`, profile: p },
      mood: p.kind === 'real' ? 'happy' : p.genome && p.genome.expression || 'neutral', text: p.line || '', profile: p, time: 0.25,
      L: { t: 'Pass', fx: {}, ex: {} }, R: { t: 'Like', fx: {}, ex: {} } };
  }

  // ------------------------------------------------------------------ choosing
  /** Apply a stat delta object. Returns the applied deltas (after clamping). */
  function applyFx(s, fx) {
    const out = {};
    for (const [k, v] of Object.entries(fx || {})) {
      if (!(k in s.stats) || !v) continue;
      const before = s.stats[k]; s.stats[k] = clamp(before + v, 0, 100); out[k] = s.stats[k] - before;
    }
    return out;
  }

  function applyEx(s, ex) {
    if (ex.job) s.job = clamp(s.job + ex.job, 0, LS.JOBS.length - 1);
    if (ex.home) s.home = clamp(s.home + ex.home, 0, LS.HOMES.length - 1);
    if (ex.friends) s.friends = Math.max(0, s.friends + ex.friends);
    for (const k of Object.keys(ex.set || {})) s.flags[k] = ex.set[k];
    for (const k of ex.clear || []) { if (k === 'partner') s.partner = null; else delete s.flags[k]; }
    if (ex.status) {
      s.status = ex.status;
      if (ex.status === 'engaged' && s.partner) s.partner.engagedAt = s.month;
      if (ex.status === 'single') s.partner = null;
      if (ex.status === 'married') { s.flags.married = true; s.loves++; }
    }
    for (const p of ex.push || []) s.queue.push({ id: p.id, at: s.month + (p.after || 1) });
  }

  /**
   * Resolve a swipe. side: 'L' | 'R'. extra: { superLike: bool, matched: bool (server decided) }
   * Returns { deltas, note, ended: endingKey|null, match: matchRecord|null, tick }.
   */
  E.choose = function (s, card, side, extra = {}) {
    const opt = card[side];
    const res = { deltas: {}, note: (opt.ex && opt.ex.r) || '', ended: null, match: null, card };
    s.cards++;
    s.seen[card.id] = (s.seen[card.id] || 0) + 1;
    if (card.def && card.def.cd) s.cd[card.id] = s.month;
    if (card.dom) { s.lastDoms.push(card.dom); if (s.lastDoms.length > 4) s.lastDoms.shift(); }
    const merge = d => { for (const [k, v] of Object.entries(d)) res.deltas[k] = (res.deltas[k] || 0) + v; };

    merge(applyFx(s, opt.fx));
    applyEx(s, opt.ex || {});

    if (card.kind === 'profile') { s.profiles++; if (side === 'R') res.match = likeProfile(s, card.profile, extra, res, merge); }
    else if (card.kind === 'arc') arcResult(s, card, opt, res, merge);
    else if (card.kind === 'cheat') { if (side === 'L') merge(applyFx(s, { heart: -6, peace: -3 })); else merge(applyFx(s, { heart: -14, peace: -4 })); if (Math.random() < 0.45 || side === 'R') { s.partner = null; s.status = 'single'; res.note = 'They left you. It stings.'; } }
    else if (card.kind === 'match') { /* nothing: the match card is a celebration */ }

    merge(tick(s, card.time));
    res.ended = checkEnd(s);
    if (res.ended) s.over = res.ended;
    return res;
  };

  /** A month (or part of one) passes: pay, earn, drift. */
  function tick(s, dt) {
    const J = LS.JOBS[s.job], H = LS.HOMES[s.home];
    const fx = { wallet: (J.income - H.rent - H.living) * dt };
    // loneliness and company
    if (!s.partner && s.friends < 3) fx.heart = -0.7 * dt;
    else if (s.partner) fx.heart = 0.1 * dt;
    if (s.friends >= 5) fx.heart = (fx.heart || 0) + 0.1 * dt;
    if (s.job >= 3) fx.peace = -0.4 * dt;
    if (s.home === 0) fx.peace = (fx.peace || 0) + 0.2 * dt;
    if (s.job === 0 && !s.flags.startup) fx.hustle = -0.6 * dt;
    // positive and negative extremes drift back a little so one lucky run doesn't lock a bar at 100
    for (const k of LS.STAT_KEYS) if (s.stats[k] > 70) fx[k] = (fx[k] || 0) - 0.5 * dt;
    s.month += dt;
    s.age = START_AGE + Math.floor(s.month / 12);
    // fractional drift is accumulated so small values don't vanish when rounded
    const out = {};
    for (const [k, v] of Object.entries(fx)) { const b = s.stats[k]; s.stats[k] = clamp(b + v, 0, 100); out[k] = s.stats[k] - b; }
    return out;
  }

  function checkEnd(s) {
    for (const k of LS.STAT_KEYS) {
      if (s.stats[k] <= 0.5) return k + '_low';
      if (s.stats[k] >= 99.5) return k + '_high';
    }
    if (s.age >= END_AGE) return 'victory';
    return null;
  }

  // ------------------------------------------------------------------ matches & arcs
  const MATCH_BASE = 0.34;
  function matchChance(s, p, sup) {
    let c = MATCH_BASE + (s.stats.hustle - 50) / 230 + (s.stats.heart - 50) / 520 + (p.pick || 0) + (sup ? 0.35 : 0) + s.job * 0.02;
    return clamp(c, 0.08, 0.92);
  }
  E.matchChance = matchChance;

  function likeProfile(s, p, extra, res, merge) {
    if (s.partner) {
      // swiping right while taken: sometimes someone notices
      if (Math.random() < 0.55) s.queue.push({ cheat: true, at: s.month + 0.25 });
      return null;
    }
    if (p.kind === 'real') {
      if (!extra.matched) return null;
      return startMatch(s, p, res, merge);
    }
    const ok = extra.matched != null ? extra.matched : Math.random() < matchChance(s, p, extra.superLike);
    return ok ? startMatch(s, p, res, merge) : null;
  }

  function startMatch(s, p, res, merge) {
    const m = { mid: ++s.mid, profile: p, type: p.kind === 'real' ? 'real' : p.type, step: 0, aff: 0, since: s.month };
    s.matches.push(m);
    merge(applyFx(s, { heart: 2 }));
    if (p.kind !== 'real') s.queue.push({ arc: m.mid, at: s.month + 0.5 });
    s.queue.unshift({ matchCard: m.mid, at: s.month });
    res.note = `It’s a match with ${p.name}!`;
    return m;
  }

  /** Called by the UI after a "match" decision so the celebration card shows right away. */
  E.matchCard = function (s, m) {
    const real = m.type === 'real';
    return { id: 'match:' + m.mid, kind: 'match', dom: 'love', who: { type: 'profile', name: m.profile.name, sub: real ? 'A real Lagos Life player' : LS.jobLabel(m.profile.job), profile: m.profile }, mood: 'smitten', time: 0.1, match: m,
      text: real ? `You and ${m.profile.name} liked each other! Say hi in your Inbox.` : `You and ${m.profile.name} liked each other! They’re already typing…`,
      L: { t: 'Later', fx: {}, ex: {} }, R: { t: real ? 'Say hi' : 'Say hi!', fx: { heart: 4 }, ex: {} } };
  };

  const ARC_LINES = {
    sweet: { chat: 'Hey! Saw your profile and I haven’t stopped smiling. What are you up to?', date: 'You laugh until your cheeks hurt. They ask when they can see you again.' },
    baller: { chat: 'Hey. I run a few things in VI. You look like someone worth my time.', date: 'They order three bottles and “forget” their card at home.' },
    broke: { chat: 'Hi! I don’t have much, but I’ve got a big heart. And good jokes.', date: 'Their card declines. They look mortified.' },
    catfish: { chat: 'Heyyy beautiful/handsome. I just got out of the shower. Let’s link!', date: 'Wait. That’s not who was in the photos…' },
    scammer: { chat: 'Hello dear. I am a military doctor deployed abroad. I have never felt this way before.', date: '“Dear, my account is frozen. Just ₦50,000 to unlock my inheritance. I’ll pay you back triple.”' },
    clingy: { chat: 'Hii!! Are you there? Why are you quiet? Did I do something? Hello??', date: 'Forty-two missed calls. You were at a funeral.' },
    flaky: { chat: 'Heyy! Let’s meet up soon! Maybe this weekend. Or next. We’ll see.', date: 'They cancel the third time. Then show up an hour late with a story.' },
  };

  function arcCard(s, m) {
    const p = m.profile, n = p.name, L = ARC_LINES[m.type] || ARC_LINES.sweet;
    const base = { kind: 'arc', dom: 'love', who: { type: 'profile', name: n, sub: LS.jobLabel(p.job), profile: m.type === 'catfish' && m.step >= 2 ? Object.assign({}, p, { genome: p.realGenome || p.genome }) : p }, time: 0.5, arc: m.mid, id: 'arc:' + m.mid + ':' + m.step };
    const o = (t, fx, ex) => ({ t, fx: fx || {}, ex: ex || {} });
    switch (m.step) {
      case 0: // icebreaker
        return Object.assign(base, { mood: m.type === 'clingy' ? 'embarrassed' : m.type === 'scammer' ? 'smug' : 'flirty', text: L.chat,
          L: o('Play it cool', { heart: 1 }, { aff: m.type === 'baller' ? 1 : 0 }), R: o('Be warm', { heart: 3 }, { aff: 1 }) });
      case 1: // plan the date
        return Object.assign(base, { mood: 'happy', text: `${n} wants to meet. “Where should we go?”`,
          L: o('Mama Put in Yaba', { wallet: -3, heart: 3 }, { aff: m.type === 'baller' ? -1 : m.type === 'broke' ? 2 : 1, r: 'Cheap, loud, delicious.' }),
          R: o('A rooftop lounge in VI', { wallet: -13, hustle: 3 }, { aff: m.type === 'baller' ? 2 : m.type === 'broke' ? -1 : 1, r: 'The view is nice. The prices are not.' }) });
      case 2: return dateCard(s, m, base, o, L);
      default: return verdictCard(s, m, base, o);
    }
  }

  function dateCard(s, m, base, o, L) {
    const t = m.type;
    const T = {
      sweet: { mood: 'laughing', Lc: o('Keep it casual', { heart: 2 }, { aff: 0 }), Rc: o('Say yes!', { heart: 8, peace: 3 }, { aff: 2 }) },
      baller: { mood: 'smug', Lc: o('Split the bill', { wallet: -7, hustle: 2 }, { aff: -1 }), Rc: o('Cover it all', { wallet: -18, hustle: 6, heart: 3 }, { aff: 2 }) },
      broke: { mood: 'embarrassed', Lc: o('Pay quietly', { wallet: -8, heart: 4 }, { aff: 2 }), Rc: o('Make a joke of it', { heart: -2, hustle: 2 }, { aff: -2 }) },
      catfish: { mood: 'surprised', Lc: o('Walk out', { peace: 5, heart: -2 }, { end: true, r: 'You leave before the food arrives.' }), Rc: o('Stay and chat', { heart: 4, peace: -2 }, { aff: 1 }) },
      scammer: { mood: 'smug', Lc: o('Block them', { peace: 6, hustle: 2 }, { end: true, r: 'Blocked, reported, wiser.' }), Rc: o('Send the money', { wallet: -30, heart: -14, peace: -6 }, { end: true, set: { scammed: true }, r: 'The account is deleted within the hour.' }) },
      clingy: { mood: 'embarrassed', Lc: o('Set a boundary', { peace: 6, heart: -2 }, { aff: -1 }), Rc: o('Indulge them', { peace: -8, heart: 5 }, { aff: 1 }) },
      flaky: { mood: 'sleepy', Lc: o('Give up', { peace: 3, heart: -3 }, { end: true }), Rc: o('One more chance', { peace: -3, heart: 2 }, { aff: 1 }) },
      real: { mood: 'happy', Lc: o('Maybe later', {}, { end: true }), Rc: o('Plan it', { heart: 4 }, { aff: 2 }) },
    };
    const x = T[t] || T.sweet;
    return Object.assign(base, { mood: x.mood, text: L.date, L: x.Lc, R: x.Rc });
  }

  function verdictCard(s, m, base, o) {
    const n = m.profile.name;
    if (m.aff >= 3) return Object.assign(base, { mood: 'smitten', text: `${n}: “So… what are we? Because I really like you.”`,
      L: o('Keep it casual', { heart: -1, peace: 1 }, { end: true, friends: 1, r: 'Friends, for now.' }), R: o('Make it official', { heart: 12, peace: 2 }, { official: true, r: `${n} is your partner now.` }) });
    return Object.assign(base, { mood: 'sad', text: `Seen ✓✓ three days ago. ${n} has stopped replying.`,
      L: o('Move on', { heart: -5 }, { end: true }), R: o('Send “?”', { heart: -7, peace: -2 }, { end: true }) });
  }

  function arcResult(s, card, opt, res, merge) {
    const m = s.matches.find(x => x.mid === card.arc);
    if (!m) return;
    if (opt.ex.aff) m.aff += opt.ex.aff;
    if (opt.ex.official) {
      s.partner = { id: m.profile.id, name: m.profile.name, genome: m.profile.genome, kind: m.profile.kind, type: m.type, since: s.month };
      s.status = 'dating'; s.loves++;
      s.matches = s.matches.filter(x => x !== m);
      return;
    }
    if (opt.ex.end) { s.matches = s.matches.filter(x => x !== m); return; }
    m.step++;
    s.queue.push({ arc: m.mid, at: s.month + 0.6 });
  }

  function cheatCard(s) {
    return { id: 'cheat', kind: 'cheat', dom: 'partner', who: who(s, 'PARTNER'), mood: 'angry', time: 0.25,
      text: `${s.partner ? s.partner.name : 'They'} saw your screen. “Why are you swiping on strangers?”`,
      L: { t: 'Apologise', fx: {}, ex: {} }, R: { t: 'Deny it', fx: {}, ex: {} } };
  }

  // The follow-up queue can also hold a celebration for a fresh match.
  const draw0 = E.draw;
  E.draw = function (s, opts) {
    const qi = s.queue.findIndex(q => q.matchCard != null);
    if (qi >= 0 && !s.over) {
      const q = s.queue.splice(qi, 1)[0], m = s.matches.find(x => x.mid === q.matchCard);
      if (m) return E.matchCard(s, m);
    }
    return draw0(s, opts);
  };

  function endingCard(s, key) {
    const e = LS.ENDINGS[key] || LS.ENDINGS.victory;
    return { id: 'end:' + key, kind: 'ending', ending: key, dom: 'end', who: { type: 'cast', key: e.who, name: LS.CAST && LS.CAST[e.who] ? LS.CAST[e.who].name : '', sub: e.title }, mood: e.mood,
      title: e.title, text: e.text, time: 0, L: { t: 'Start again', fx: {}, ex: {} }, R: { t: 'Start again', fx: {}, ex: {} } };
  }
  E.endingCard = endingCard;

  // ------------------------------------------------------------------ score & summary
  E.score = function (s) {
    return Math.round(s.month * 3 + s.loves * 40 + s.job * 60 + s.home * 50 + s.friends * 8 + (s.status === 'married' ? 120 : s.status === 'engaged' ? 60 : s.status === 'dating' ? 25 : 0)
      + (s.over === 'victory' ? 400 : 0));
  };

  /** A short description of where you are in life, for the status sheet and for other players. */
  E.life = s => ({ job: LS.JOBS[s.job].id, home: LS.HOMES[s.home].id, status: s.status, age: s.age, friends: s.friends });

  E.stat = (s, k) => Math.round(s.stats[k]);
  E.moneyText = s => LS.naira(s.stats.wallet * 3500);
  E.isDanger = (s, k) => s.stats[k] < 18 || s.stats[k] > 84;
})(window.LS = window.LS || {});
