/* The life-sim engine: state, the deck, people who remember you, scenes, life ladders and endings.
 * No DOM in here, so it runs headless in tests. Cards are plain objects (see cards.js). */
(function (LS) {
  'use strict';
  const { clamp } = LS;
  const E = LS.Engine = {};

  const START_AGE = 23, END_AGE = 35;
  E.START_AGE = START_AGE; E.END_AGE = END_AGE;
  /** Difficulty knobs. fx scales every choice; edge is the "too much of a good thing" drift above 85. */
  const T = E.TUNE = { fx: 1.15, rent: 1.0, edge: 0.45, edgeAt: 76 };

  // ------------------------------------------------------------------ state
  E.newRun = function (name, gender) {
    const s = {
      v: 3, name: name || 'You', g: gender === 'masc' ? 'masc' : 'fem', month: 0, age: START_AGE, cast: {}, stories: {},
      stats: { wallet: 50, heart: 48, hustle: 40, peace: 55 },
      job: 1, home: 0, friends: 2, status: 'single', partner: null,
      flags: {}, queue: [], cd: {}, seen: {}, lastDoms: [], matches: [], people: {}, loves: 0, cards: 0, mid: 0, counter: 0, revived: 0,
      over: null,
    };
    s.queue.push({ id: 't_welcome', at: 0 }, { id: 't_balance', at: 0 }, { id: 'nysc_end', at: 11 });
    return s;
  };
  /** Bring an older save up to the current shape. */
  E.fix = function (s) {
    s.people = s.people || {}; s.matches = s.matches || []; s.revived = s.revived || 0; s.cast = s.cast || {}; s.stories = s.stories || {};
    s.g = s.g === 'masc' ? 'masc' : 'fem'; s.v = 3;
    return s;
  };

  // ------------------------------------------------------------------ people & memory
  /** A person's record: how they feel about you (rel 0–100) and the things they remember. */
  E.person = (s, key) => s.people[key] || (s.people[key] = { id: key, rel: 50, mem: {}, met: s.month });
  E.rel = (s, key) => (s.people[key] ? s.people[key].rel : 50);
  /** The memory entry { m: month, t: text } or null. */
  E.mem = (s, key, tag) => (s.people[key] && s.people[key].mem[tag]) || null;
  /** Months since they remembered it (Infinity if never). */
  E.memAge = (s, key, tag) => { const m = E.mem(s, key, tag); return m ? s.month - m.m : Infinity; };
  E.memories = (s, key) => Object.values((s.people[key] && s.people[key].mem) || {}).sort((a, b) => b.m - a.m);

  // ------------------------------------------------------------------ helpers
  const byId = id => LS.CARDS.find(c => c.id === id);
  /** Text variables: {name}, {partner}, {bro} (Bro/Sis), {sir} (Sir/Madam), and the name of everyone a story introduced ({investor}…). */
  const vars = s => {
    const v = { name: s.name, partner: s.partner ? s.partner.name : 'them', bro: s.g === 'masc' ? 'Bro' : 'Sis', sir: s.g === 'masc' ? 'Sir' : 'Madam', maid: s.g === 'masc' ? 'groomsman' : 'bridesmaid' };
    for (const [role, c] of Object.entries(s.cast || {})) v[role] = c.name;
    return v;
  };
  const isRole = k => typeof k === 'string' && k[0] === '@';
  const pkeyOf = (s, k) => {
    if (k === 'PARTNER') return (s.partner && s.partner.id) || null;
    if (isRole(k)) return (s.cast[k.slice(1)] && s.cast[k.slice(1)].id) || null;
    return k || null;
  };
  /** The person a card shows. '@role' = someone a story introduced. */
  const castOf = (s, k) => s.cast && s.cast[k.slice(1)];

  function who(s, key) {
    if (!key) return { type: 'narrator', name: 'Lagos', sub: 'The city' };
    if (key === 'PARTNER') return s.partner ? { type: 'partner', name: s.partner.name, sub: 'Your ' + (s.status === 'married' ? 'spouse' : s.status === 'engaged' ? (s.partner.genome && s.partner.genome.gender === 'masc' ? 'fiancé' : 'fiancée') : 'partner'), id: s.partner.id } : { type: 'narrator', name: 'Lagos', sub: '' };
    if (isRole(key)) {
      const c = castOf(s, key);
      return c ? { type: 'npc', key: c.id, name: c.name, sub: c.sub, genome: c.genome } : { type: 'narrator', name: 'Lagos', sub: 'The city' };
    }
    const c = LS.CAST && LS.CAST[key];
    return { type: 'cast', key, name: c ? c.name : key, sub: c ? c.who : '' };
  }

  function instance(s, c) {
    const f = t => LS.fill(t, vars(s));
    const side = o => ({ t: f(o.t), fx: o.fx, ex: o.ex, ic: o.ex && o.ex.ic });
    const txt = typeof c.text === 'function' ? c.text(s) : c.text;
    const st = c.story && s.stories[c.story];
    return { id: c.id, kind: c.scene ? 'scene' : 'event', dom: c.dom, who: who(s, c.who), pkey: pkeyOf(s, c.who), mood: c.mood || 'neutral', text: f(txt), L: side(c.L), R: side(c.R),
      time: c.time != null ? c.time : 1, def: c, place: c.place || null,
      story: c.story ? { id: c.story, title: (LS.STORIES[c.story] || {}).title || c.story, ch: st ? st.log.length : 0 } : null };
  }

  const eligible = (s, c) => {
    if (!c.w || c.w <= 0) return 0;
    if (c.once && s.seen[c.id]) return 0;
    if (c.cd && s.cd[c.id] != null && s.month - s.cd[c.id] < c.cd) return 0;
    if (c.when && !c.when(s)) return 0;
    if (c.who === 'PARTNER' && !s.partner) return 0;
    if (isRole(c.who) && !castOf(s, c.who)) return 0;
    let w = c.w;
    if (s.lastDoms[s.lastDoms.length - 1] === c.dom) w *= 0.45;
    if (s.lastDoms.length > 1 && s.lastDoms[s.lastDoms.length - 2] === c.dom) w *= 0.7;
    const st = s.stats;
    if (c.dom === 'health' && st.peace < 30) w *= 1.4;
    if (c.dom === 'money' && st.wallet < 25) w *= 1.2;
    return w;
  };

  // ------------------------------------------------------------------ drawing the next card
  /** opts.realBuffer: real players (already converted by LS.fromServer) who can turn up in your day. */
  E.draw = function (s, opts = {}) {
    if (s.over) return endingCard(s, s.over);
    // 1. queued follow-ups that are due (scene steps jump the queue)
    const mi = s.queue.findIndex(q => q.matchCard != null);
    if (mi >= 0) {
      const q = s.queue.splice(mi, 1)[0], m = s.matches.find(x => x.mid === q.matchCard);
      if (m) return E.matchCard(s, m);
    }
    const qi = s.queue.findIndex(q => q.at <= s.month);
    if (qi >= 0) {
      const q = s.queue.splice(qi, 1)[0];
      if (q.arc != null) { const m = s.matches.find(x => x.mid === q.arc); if (m) return arcCard(s, m); }
      else if (q.cheat) return cheatCard(s, q.cheat);
      else { const c = byId(q.id); if (c) return instance(s, c); }
    }
    // 2. someone real from the city, a new face, or one of life's events
    const rb = opts.realBuffer;
    if (rb && rb.length && Math.random() < 0.1) return realCard(s, rb.shift());
    const share = !s.partner ? 0.13 : s.status === 'dating' ? 0.05 : 0.025;
    if (Math.random() < share) return meetCard(s, opts);
    const cands = LS.CARDS.map(c => [c, eligible(s, c)]).filter(x => x[1] > 0);
    const pick = LS.weighted(cands, x => x[1]);
    return pick ? instance(s, pick[0]) : meetCard(s, opts);
  };

  // ------------------------------------------------------------------ new faces
  const MEETS = [
    { place: 'housewarming', text: p => `At a housewarming, ${p.name} (${LS.jobLabel(p.job)}) laughs at your joke from across the room.`, L: 'Stick with your friends', R: 'Go and talk', ic: 'chat' },
    { place: 'owambe', text: p => `Same owambe table. ${p.name} (${LS.jobLabel(p.job)}) passes you the small chops. “Is this seat taken?”`, L: 'Mind your plate', R: 'Make room', ic: 'party' },
    { place: 'phone', text: p => `${p.name} (${LS.jobLabel(p.job)}) replied to your story with a 🔥. It can be a conversation if you want one.`, L: 'Leave it on seen', R: 'Reply', ic: 'phone' },
    { place: 'bus', text: p => `Stuck in the same danfo on Third Mainland. ${p.name} is trying not to laugh at the conductor.`, L: 'Look out the window', R: 'Laugh together', ic: 'bus' },
    { place: 'bank', text: p => `The bank queue is endless. ${p.name} offers you a spare pen and a smile.`, L: 'Politely decline', R: 'Say thanks', ic: 'chat' },
    { place: 'gym', text: p => `${p.name} (${LS.jobLabel(p.job)}) spots you on the bench press and doesn't judge the weight.`, L: 'Focus on your set', R: 'Say thank you', ic: 'work' },
    { place: 'church', text: p => `After service, ${p.name} compliments your outfit. Aunty Bisi is watching from the third row.`, L: 'Slip out early', R: 'Greet them', ic: 'church' },
    { place: 'work', text: p => `${p.name} from the next floor keeps passing your desk with a reason. Lunch?`, L: 'Eat at your desk', R: 'Ask them to lunch', ic: 'food' },
  ];

  function meetCard(s, opts) {
    s.counter++;
    const p = LS.makeProfile((LS.hash(s.name) % 9973) * 100000 + s.counter * 7 + s.mid, { show: s.g === 'masc' ? 'fem' : 'masc' });
    const m = LS.pick(MEETS);
    const taken = !!s.partner;
    const text = taken ? `${p.name} (${LS.jobLabel(p.job)}) keeps finding reasons to talk to you. You’re with ${s.partner.name}.` : m.text(p);
    return { id: 'meet:' + p.id, kind: 'meet', dom: 'love', pkey: p.id, who: { type: 'profile', name: p.name, sub: `${p.age} · ${LS.jobLabel(p.job)}`, profile: p }, mood: taken ? 'flirty' : (p.genome && p.genome.expression) || 'happy',
      text, profile: p, time: 0.3, place: m.place, temptation: taken,
      L: taken ? { t: 'Stay loyal', fx: { heart: 2, peace: 2 }, ex: { ic: 'heart', who: 'PARTNER', rel: 6, mem: ['loyal', 'You turned someone down for them.'] } } : { t: m.L, fx: { peace: 1 }, ex: { ic: 'no' } },
      R: taken ? { t: 'Flirt back', fx: { heart: 4, peace: -3 }, ex: { ic: 'chat' } } : { t: m.R, fx: { heart: 1 }, ex: { ic: m.ic } } };
  }

  /** A real Lagos Life player crosses your path. Saying hello is the multiplayer handshake. */
  function realCard(s, p) {
    const life = p.life ? LS.lifeLine(p.life) : '';
    const spots = ['at the same suya spot', 'in the same estate', 'at the same bus stop', 'at the same owambe', 'in your area'];
    return { id: 'real:' + p.id, kind: 'real', dom: 'social', pkey: p.id, who: { type: 'profile', name: p.name, sub: 'A real Lagos Life player', profile: p }, mood: 'happy', profile: p, time: 0.2,
      text: `${p.name} is ${spots[LS.hash(p.id) % spots.length]}. ${life ? life + '. ' : ''}${p.likesYou ? 'They already waved at you.' : 'Say hello?'}`,
      L: { t: 'Keep walking', fx: {}, ex: { ic: 'no' } }, R: { t: 'Say hello', fx: { heart: 1 }, ex: { ic: 'chat' } } };
  }

  // ------------------------------------------------------------------ choosing
  /** Apply a stat delta object (scaled by difficulty). Returns the applied deltas (after clamping). */
  function applyFx(s, fx, scale = T.fx) {
    const out = {};
    for (const [k, v] of Object.entries(fx || {})) {
      if (!(k in s.stats) || !v) continue;
      const before = s.stats[k]; s.stats[k] = clamp(before + v * scale, 0, 100); out[k] = s.stats[k] - before;
    }
    return out;
  }

  /** Change how someone feels about you and what they remember. o: { rel, mem: [tag, text], forget: tag } */
  function touch(s, pk, o) {
    if (!pk || !(o.rel || o.mem || o.forget)) return;
    const p = E.person(s, pk);
    if (o.rel) p.rel = clamp(p.rel + o.rel, 0, 100);
    if (o.mem) p.mem[o.mem[0]] = { m: s.month, t: LS.fill(o.mem[1], vars(s)) };
    if (o.forget) delete p.mem[o.forget];
  }

  function applyEx(s, ex, pkey) {
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
    // people remember
    touch(s, ex.who ? pkeyOf(s, ex.who) : pkey, ex);
    for (const a of [].concat(ex.also || [])) touch(s, pkeyOf(s, a.who), a);   // a second person who is affected too
    if (ex.intro) for (const spec of [].concat(ex.intro)) E.introduce(s, spec);
    if (ex.story) storyNote(s, ex.story);
    // follow-ups: a list, or a function of the state. Each may carry { p: chance, if: s => bool } so one choice can fan out
    const pushes = typeof ex.push === 'function' ? ex.push(s) : ex.push;
    for (const p of pushes || []) {
      if (p.if && !p.if(s)) continue;
      if (p.p != null && Math.random() > p.p) continue;
      s.queue.push({ id: p.id, at: s.month + (p.after != null ? p.after : 1) });
    }
    const go = typeof ex.go === 'function' ? ex.go(s) : ex.go;
    if (go) s.queue.unshift({ id: go, at: s.month });   // the next step of a scene: right now
    if (ex.ending) s.forceEnd = ex.ending;
  }

  // ------------------------------------------------------------------ stories & new characters
  /** Bring a new person into your life with a role: spec { role, sub, g: 'any'|'same'|'opp'|'fem'|'masc', years, dress, title, rel, mem }. Once per role. */
  E.introduce = function (s, spec) {
    if (s.cast[spec.role]) return s.cast[spec.role];
    s.counter++;
    const g = spec.g === 'fem' || spec.g === 'masc' ? spec.g : spec.g === 'same' ? s.g : spec.g === 'opp' ? (s.g === 'masc' ? 'fem' : 'masc') : null;
    const seed = (LS.hash(s.name + spec.role) % 9973) * 1000 + s.counter * 11 + s.mid;
    const n = LS.makeNpc ? LS.makeNpc(seed, Object.assign({}, spec, { g })) : { name: spec.role, genome: { archetype: 'yoruba' }, gender: g || 'fem' };
    const c = s.cast[spec.role] = { id: 'c:' + spec.role, role: spec.role, name: n.name, sub: spec.sub || LS.titleCase(spec.role), genome: n.genome, gender: n.gender, since: s.month };
    const pe = E.person(s, c.id);
    pe.name = c.name; pe.genome = c.genome; pe.sub = c.sub;
    if (spec.rel != null) pe.rel = spec.rel;
    if (spec.mem) pe.mem[spec.mem[0]] = { m: s.month, t: spec.mem[1] };
    return c;
  };

  /** ['storyId', 'what just happened', 'done' | 'failed'?] adds a line to a story's log (and closes it if given a state). */
  function storyNote(s, [id, text, state]) {
    const st = s.stories[id] || (s.stories[id] = { id, since: s.month, log: [], state: 'open' });
    if (text) st.log.push({ m: s.month, t: LS.fill(text, vars(s)) });
    if (state) st.state = state;
  }
  E.storyNote = storyNote;
  /** Stories you are in, open ones first. */
  E.stories = s => Object.values(s.stories || {}).sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1) || b.since - a.since);

  /**
   * Resolve a choice. side: 'L' | 'R'. extra: { matched: bool (server decided, for real players) }
   * Returns { deltas, note, ended: endingKey|null, match: matchRecord|null, card }.
   */
  E.choose = function (s, card, side, extra = {}) {
    const opt = card[side];
    const res = { deltas: {}, note: (opt.ex && opt.ex.r) || '', ended: null, match: null, card };
    s.cards++;
    s.seen[card.id] = (s.seen[card.id] || 0) + 1;
    if (card.def && card.def.cd) s.cd[card.id] = s.month;
    if (card.dom && card.kind !== 'scene') { s.lastDoms.push(card.dom); if (s.lastDoms.length > 4) s.lastDoms.shift(); }
    const merge = d => { for (const [k, v] of Object.entries(d)) res.deltas[k] = (res.deltas[k] || 0) + v; };

    merge(applyFx(s, opt.fx));
    applyEx(s, opt.ex || {}, card.pkey);

    if (card.kind === 'meet') {
      if (side === 'R') res.match = card.temptation ? flirt(s, card, res) : meetResult(s, card.profile, res, merge);
    } else if (card.kind === 'real') {
      if (side === 'R') res.match = extra.matched ? startMatch(s, card.profile, res, merge) : null;
    } else if (card.kind === 'arc') arcResult(s, card, opt, res, merge);
    else if (card.kind === 'cheat') cheatResult(s, side, res, merge);

    merge(tick(s, card.time));
    res.ended = checkEnd(s);
    if (res.ended) s.over = res.ended;
    return res;
  };

  /** A month (or part of one) passes: pay, earn, drift. */
  function tick(s, dt) {
    const J = LS.JOBS[s.job], H = LS.HOMES[s.home];
    const fx = { wallet: (J.income - (H.rent * T.rent + H.living)) * dt };
    if (!s.partner && s.friends < 3) fx.heart = -0.8 * dt;
    else if (s.partner) fx.heart = 0.1 * dt;
    if (s.friends >= 5) fx.heart = (fx.heart || 0) + 0.1 * dt;
    if (s.job >= 3) fx.peace = -0.45 * dt;
    if (s.home === 0) fx.peace = (fx.peace || 0) + 0.2 * dt;
    if (s.job === 0 && !s.flags.startup) fx.hustle = -0.7 * dt;
    for (const k of LS.STAT_KEYS) if (s.stats[k] > T.edgeAt) fx[k] = (fx[k] || 0) - T.edge * dt;
    s.month += dt;
    s.age = START_AGE + Math.floor(s.month / 12);
    return applyFx(s, fx, 1);
  }

  function checkEnd(s) {
    // a bar at 0 or 100 is the end: there is no middle ground between "in trouble" and "over"
    for (const k of LS.STAT_KEYS) {
      if (s.stats[k] <= 0.5) return k + '_low';
      if (s.stats[k] >= 99.5) return k + '_high';
    }
    if (s.forceEnd) return s.forceEnd;
    if (s.age >= END_AGE) return 'victory';
    return null;
  }

  /** Spend a lucky charm: the bar that ended you is pulled back from the edge and life goes on. */
  E.revive = function (s) {
    if (!s.over || s.over === 'victory' || s.over === 'japa') return false;
    const k = s.over.replace(/_(low|high)$/, '');
    if (!LS.STAT_KEYS.includes(k)) return false;
    s.stats[k] = s.over.endsWith('_low') ? 38 : 62;
    s.over = null; s.revived++;
    return true;
  };

  /** What the HUD should warn about: the bar closest to either edge, or null. */
  E.danger = function (s) {
    let best = null;
    for (const k of LS.STAT_KEYS) {
      const v = s.stats[k], low = v < 22, high = v > 80;
      if (!low && !high) continue;
      const gap = low ? v : 100 - v;
      if (!best || gap < best.gap) best = { k, low, gap, text: LS.STATS[k][low ? 'lowWarn' : 'highWarn'] };
    }
    return best;
  };

  // ------------------------------------------------------------------ meeting people → starting something
  const MATCH_BASE = 0.42;
  E.matchChance = (s, p) => clamp(MATCH_BASE + (s.stats.hustle - 50) / 230 + (s.stats.heart - 50) / 520 + (p.pick || 0) + s.job * 0.02, 0.12, 0.9);

  function meetResult(s, p, res, merge) {
    if (Math.random() < E.matchChance(s, p)) return startMatch(s, p, res, merge);
    res.note = `${p.name} was friendly, but had to run.`;
    return null;
  }
  function flirt(s, card, res) {
    if (Math.random() < 0.6) s.queue.push({ cheat: card.profile.name, at: s.month + 0.25 });
    res.note = 'Someone noticed.';
    return null;
  }

  function startMatch(s, p, res, merge) {
    const m = { mid: ++s.mid, profile: p, type: p.kind === 'real' ? 'real' : p.type, step: 0, aff: 0, since: s.month, place: null };
    s.matches.push(m);
    const pe = E.person(s, p.id);
    pe.name = p.name; pe.genome = p.genome; pe.kind = p.kind; pe.job = p.job;
    pe.mem.met = { m: s.month, t: m.type === 'real' ? 'You said hello as fellow players.' : 'You met and swapped numbers.' };
    merge(applyFx(s, { heart: 2 }));
    if (p.kind !== 'real') s.queue.push({ arc: m.mid, at: s.month + 0.4 });
    s.queue.unshift({ matchCard: m.mid, at: s.month });
    res.note = p.kind === 'real' ? `${p.name} said hello back!` : `${p.name} gives you their number.`;
    return m;
  }

  /** The "something started" card after someone responds. */
  E.matchCard = function (s, m) {
    const real = m.type === 'real';
    return { id: 'match:' + m.mid, kind: 'match', dom: 'love', pkey: m.profile.id, who: { type: 'profile', name: m.profile.name, sub: real ? 'A real Lagos Life player' : LS.jobLabel(m.profile.job), profile: m.profile }, mood: 'smitten', time: 0.1, match: m,
      text: real ? `You and ${m.profile.name} hit it off! You can message them from your Inbox.` : `${m.profile.name} saved your number as “${m.profile.name} 🌟”.`,
      L: { t: 'Later', fx: {}, ex: { ic: 'bed' } }, R: { t: real ? 'Say hi' : 'Text them', fx: { heart: 3 }, ex: { ic: 'phone' } } };
  };

  // ------------------------------------------------------------------ the story with someone: chat → plan → date → verdict
  const ARC_LINES = {
    sweet: 'Hey! You made my whole evening. What are you up to?',
    baller: 'Hey. I run a few things in VI. You look like someone worth my time.',
    broke: 'Hi! I don’t have much, but I’ve got a big heart. And good jokes.',
    catfish: 'Heyyy beautiful. Just got out of the shower. Let’s link!',
    scammer: 'Hello dear. I am a military doctor deployed abroad. I have never felt this way before.',
    clingy: 'Hii!! Are you there? Why are you quiet? Did I do something? Hello??',
    flaky: 'Heyy! Let’s meet up soon! Maybe this weekend. Or next. We’ll see.',
  };
  const PLACES = { L: { name: 'Mama Put in Yaba', short: 'Mama Put' }, R: { name: 'a rooftop in VI', short: 'VI Rooftop' } };

  function arcCard(s, m) {
    const p = m.profile, n = p.name, o = (t, fx, ex) => ({ t, fx: fx || {}, ex: ex || {}, ic: ex && ex.ic });
    const reveal = m.type === 'catfish' && m.step >= 3;
    const base = { kind: 'arc', dom: 'love', pkey: p.id, who: { type: 'profile', name: n, sub: LS.jobLabel(p.job), profile: reveal ? Object.assign({}, p, { genome: p.realGenome || p.genome }) : p },
      time: 0.25, arc: m.mid, id: 'arc:' + m.mid + ':' + m.step, place: m.place === 'L' ? 'mamaput' : m.place === 'R' ? 'rooftop' : null };
    switch (m.step) {
      case 0:
        return Object.assign(base, { mood: m.type === 'clingy' ? 'embarrassed' : m.type === 'scammer' ? 'smug' : 'flirty', text: `${n} texts: “${ARC_LINES[m.type] || ARC_LINES.sweet}”`, place: 'phone',
          L: o('Play it cool', { heart: 1 }, { aff: m.type === 'baller' ? 1 : 0, ic: 'phone' }), R: o('Be warm', { heart: 3 }, { aff: 1, ic: 'heart' }) });
      case 1:
        return Object.assign(base, { mood: 'happy', text: `${n} wants to meet. “Where should we go?”`, place: null,
          L: o(PLACES.L.short, { wallet: -3, heart: 3 }, { aff: m.type === 'baller' ? -1 : m.type === 'broke' ? 2 : 1, ic: 'food', loc: 'L', r: 'Cheap, loud, delicious.' }),
          R: o(PLACES.R.short, { wallet: -13, hustle: 3 }, { aff: m.type === 'baller' ? 2 : m.type === 'broke' ? -1 : 1, ic: 'rooftop', loc: 'R', r: 'The view is nice. The prices are not.' }) });
      case 2: {
        const T2 = { sweet: [2, 1], baller: [0, 2], broke: [2, 0], catfish: [1, 0], scammer: [0, 1], clingy: [1, 0], flaky: [1, 0], real: [1, 1] }[m.type] || [1, 1];
        const there = m.place === 'R' ? 'The city glitters below. ' : 'The speakers are loud and the pepper soup is hot. ';
        return Object.assign(base, { mood: 'happy', text: `${there}${n} leans in. “So… tell me about you. What do you really want from life?”`,
          L: o('Be honest', { heart: 4, hustle: -1 }, { aff: T2[0], ic: 'heart', rel: 4, mem: ['honest', 'You were honest about who you really are.'] }),
          R: o('Impress them', { hustle: 4, heart: -1 }, { aff: T2[1], ic: 'work', mem: ['impressed', 'You tried hard to impress them.'] }) });
      }
      case 3: return dateCard(m, base, o);
      default: return verdictCard(s, m, base, o);
    }
  }

  function dateCard(m, base, o) {
    const n = m.profile.name;
    const D = {
      sweet: { mood: 'laughing', text: `You laugh until your cheeks hurt. ${n} asks when they can see you again.`, L: o('Keep it casual', { heart: 2 }, { aff: 0, ic: 'chat' }), R: o('Say yes!', { heart: 8, peace: 3 }, { aff: 2, ic: 'heart' }) },
      baller: { mood: 'smug', text: 'They order three bottles and “forget” their card at home. The bill arrives.', L: o('Split the bill', { wallet: -7, hustle: 2 }, { aff: -1, ic: 'cash' }), R: o('Cover it all', { wallet: -18, hustle: 6, heart: 3 }, { aff: 2, ic: 'cash' }) },
      broke: { mood: 'embarrassed', text: 'Their card declines. They look mortified.', L: o('Pay quietly', { wallet: -8, heart: 4 }, { aff: 2, ic: 'cash', rel: 6, mem: ['paid', 'You paid the bill without making it awkward.'] }), R: o('Make a joke of it', { heart: -2, hustle: 2 }, { aff: -2, ic: 'party', rel: -8, mem: ['joked', 'You laughed when their card declined.'] }) },
      catfish: { mood: 'surprised', text: 'Wait. That’s not who was in the photos…', L: o('Walk out', { peace: 5, heart: -2 }, { end: true, ic: 'no', r: 'You leave before the food arrives.' }), R: o('Stay and chat', { heart: 4, peace: -2 }, { aff: 1, ic: 'chat' }) },
      scammer: { mood: 'smug', text: '“Dear, my account is frozen. Just ₦50,000 to unlock my inheritance. I’ll pay you back triple.”', L: o('Block them', { peace: 6, hustle: 2 }, { end: true, ic: 'no', r: 'Blocked, reported, wiser.' }), R: o('Send the money', { wallet: -30, heart: -14, peace: -6 }, { end: true, ic: 'cash', set: { scammed: true }, r: 'The account is deleted within the hour.' }) },
      clingy: { mood: 'embarrassed', text: 'Forty-two missed calls. You were at a funeral.', L: o('Set a boundary', { peace: 6, heart: -2 }, { aff: -1, ic: 'no' }), R: o('Indulge them', { peace: -8, heart: 5 }, { aff: 1, ic: 'phone' }) },
      flaky: { mood: 'sleepy', text: 'They cancel the third time. Then show up an hour late with a story.', L: o('Give up', { peace: 3, heart: -3 }, { end: true, ic: 'no' }), R: o('One more chance', { peace: -3, heart: 2 }, { aff: 1, ic: 'heart' }) },
      real: { mood: 'happy', text: `${n} is up for a proper hangout.`, L: o('Maybe later', {}, { end: true, ic: 'bed' }), R: o('Plan it', { heart: 4 }, { aff: 2, ic: 'party' }) },
    };
    const x = D[m.type] || D.sweet;
    return Object.assign(base, { mood: x.mood, text: x.text, L: x.L, R: x.R });
  }

  function verdictCard(s, m, base, o) {
    const n = m.profile.name, pe = E.person(s, m.profile.id);
    const recall = Object.values(pe.mem).filter(x => x.t && x.m >= m.since && x.m <= s.month).sort((a, b) => b.m - a.m)[0];
    if (m.aff >= 3) return Object.assign(base, { mood: 'smitten', text: `${n}: “So… what are we? Because I really like you.”${recall ? ' They haven’t forgotten: ' + recall.t.toLowerCase() : ''}`,
      L: o('Keep it casual', { heart: -1, peace: 1 }, { end: true, friends: 1, ic: 'chat', r: 'Friends, for now.' }), R: o('Make it official', { heart: 12, peace: 2 }, { official: true, ic: 'heart', r: `${n} is your partner now.` }) });
    return Object.assign(base, { mood: 'sad', text: `Seen ✓✓ three days ago. ${n} has stopped replying.`,
      L: o('Move on', { heart: -5 }, { end: true, ic: 'bed' }), R: o('Send “?”', { heart: -7, peace: -2 }, { end: true, ic: 'phone' }) });
  }

  function arcResult(s, card, opt, res) {
    const m = s.matches.find(x => x.mid === card.arc);
    if (!m) return;
    const pe = E.person(s, m.profile.id);
    if (opt.ex.aff) { m.aff += opt.ex.aff; pe.rel = clamp(pe.rel + opt.ex.aff * 5, 0, 100); }
    if (opt.ex.loc) { m.place = opt.ex.loc; pe.mem.date = { m: s.month, t: `You took them to ${PLACES[opt.ex.loc].name}.` }; }
    if (opt.ex.official) {
      s.partner = { id: m.profile.id, name: m.profile.name, genome: m.profile.genome, kind: m.profile.kind, type: m.type, since: s.month };
      s.status = 'dating'; s.loves++;
      pe.mem.together = { m: s.month, t: 'You made it official.' };
      s.matches = s.matches.filter(x => x !== m);
      return;
    }
    if (opt.ex.end) { s.matches = s.matches.filter(x => x !== m); pe.mem.ended = { m: s.month, t: 'It didn’t go anywhere.' }; return; }
    m.step++;
    // texting is spread over days; once you've agreed to meet, the date plays out as one scene
    const nxt = { arc: m.mid, at: s.month + (m.step >= 2 ? 0 : 0.6) };
    if (m.step >= 2) s.queue.unshift(nxt); else s.queue.push(nxt);
    void res;
  }

  function cheatCard(s, other) {
    const n = s.partner ? s.partner.name : 'They';
    return { id: 'cheat', kind: 'cheat', dom: 'partner', who: who(s, 'PARTNER'), pkey: s.partner && s.partner.id, mood: 'angry', time: 0.25, place: 'phone',
      text: `${n} heard how you were with ${typeof other === 'string' ? other : 'that person'}. “Is there something you want to tell me?”`,
      L: { t: 'Come clean', fx: { heart: -3 }, ex: { ic: 'heart' } }, R: { t: 'Deny it', fx: { heart: -9, peace: -3 }, ex: { ic: 'no' } } };
  }
  function cheatResult(s, side, res, merge) {
    const p = s.partner; if (!p) return;
    const pe = E.person(s, p.id);
    if (side === 'L') { pe.rel = clamp(pe.rel - 10, 0, 100); pe.mem.forgave = { m: s.month, t: 'You owned up. They haven’t forgotten.' }; merge(applyFx(s, { peace: -2 })); }
    else { pe.rel = clamp(pe.rel - 25, 0, 100); pe.mem.lied = { m: s.month, t: 'They know you lied to their face.' }; }
    if ((side === 'R' && Math.random() < 0.5) || pe.rel < 15) { s.partner = null; s.status = 'single'; res.note = `${p.name} left. It stings.`; pe.mem.left = { m: s.month, t: 'They walked out.' }; }
  }

  function endingCard(s, key) {
    const e = LS.ENDINGS[key] || LS.ENDINGS.victory;
    return { id: 'end:' + key, kind: 'ending', ending: key, lose: key !== 'victory' && key !== 'japa', stamp: e.stamp || null, dom: 'end', who: { type: 'cast', key: e.who, name: LS.CAST && LS.CAST[e.who] ? LS.CAST[e.who].name : '', sub: e.title }, mood: e.mood,
      title: e.title, text: e.text, time: 0, L: { t: 'New life', fx: {}, ex: { ic: 'bed' } }, R: { t: 'New life', fx: {}, ex: { ic: 'heart' } } };
  }
  E.endingCard = endingCard;

  // ------------------------------------------------------------------ score & summary
  E.score = function (s) {
    return Math.round(s.month * 3 + s.loves * 40 + s.job * 60 + s.home * 50 + s.friends * 8 + (s.status === 'married' ? 120 : s.status === 'engaged' ? 60 : s.status === 'dating' ? 25 : 0)
      + (s.over === 'victory' ? 400 : s.over === 'japa' ? 150 : 0) + E.stories(s).filter(x => x.state === 'done').length * 30);
  };

  /** A short description of where you are in life, for the status sheet and for other players. */
  E.life = s => ({ job: LS.JOBS[s.job].id, home: LS.HOMES[s.home].id, status: s.status, age: s.age, friends: s.friends });

  E.stat = (s, k) => Math.round(s.stats[k]);
  E.moneyText = s => LS.naira(s.stats.wallet * 3500);
  E.isDanger = (s, k) => s.stats[k] < 22 || s.stats[k] > 80;
})(window.LS = window.LS || {});
