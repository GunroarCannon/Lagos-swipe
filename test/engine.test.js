/* Headless engine test: loads the pure-logic scripts and simulates many random playthroughs. */
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const win = { console, Math, JSON, Object, Array, Set, Map, Date, setTimeout, clearTimeout };
win.window = win; win.localStorage = { getItem: () => null, setItem() {} };
vm.createContext(win);
for (const f of ['util', 'data', 'people', 'cards', 'stories', 'engine']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', f + '.js'), 'utf8'), win, { filename: f });
const LS = win.LS;
LS.lifeLine = () => '';
// no portrait engine here: stub what the engine asks for
LS.makeProfile = seed => { const r = LS.rng('p' + seed); const type = r.weighted({ sweet: 40, baller: 11, broke: 11, catfish: 8, scammer: 5, clingy: 11, flaky: 12 });
  return { id: 'n' + seed, kind: 'npc', name: 'P' + seed, age: 25, genome: { archetype: 'yoruba' }, realGenome: { archetype: 'yoruba' }, job: 'banker', type, line: 'hi', pick: 0 }; };

LS.makeNpc = (seed, spec) => ({ name: 'N' + seed, genome: { archetype: 'yoruba', gender: spec.g || 'fem' }, gender: spec.g || 'fem', arch: 'yoruba', age: 30 });

// every card is well-formed
const ids = new Set(), roles = new Set(), reached = new Set();
for (const c of LS.CARDS) for (const side of [c.L, c.R]) for (const i of [].concat(side.ex.intro || [])) roles.add(i.role);
for (const c of LS.CARDS) {
  assert.ok(!ids.has(c.id), 'duplicate card id ' + c.id); ids.add(c.id);
  assert.ok(c.text && c.L.t && c.R.t, 'card incomplete ' + c.id);
  for (const k of Object.keys(Object.assign({}, c.L.fx, c.R.fx))) assert.ok(LS.STAT_KEYS.includes(k), c.id + ' bad stat ' + k);
  if (c.who && c.who[0] === '@') assert.ok(roles.has(c.who.slice(1)), c.id + ' nobody introduces ' + c.who);
  else if (c.who && c.who !== 'PARTNER') assert.ok(LS.CAST[c.who], c.id + ' unknown cast ' + c.who);
  if (c.story) assert.ok(LS.STORIES[c.story], c.id + ' unknown story ' + c.story);
  for (const side of [c.L, c.R]) {
    const ex = side.ex;
    if (ex.push && typeof ex.push !== 'function') for (const p of ex.push) { assert.ok(LS.CARDS.find(x => x.id === p.id), c.id + ' pushes unknown ' + p.id); reached.add(p.id); }
    if (typeof ex.go === 'string') { assert.ok(LS.CARDS.find(x => x.id === ex.go), c.id + ' goes to unknown ' + ex.go); reached.add(ex.go); }
    if (ex.who && ex.who !== 'PARTNER' && ex.who[0] !== '@') assert.ok(LS.CAST[ex.who], c.id + ' unknown who ' + ex.who);
    if (ex.who && ex.who[0] === '@') assert.ok(roles.has(ex.who.slice(1)), c.id + ' unknown role ' + ex.who);
    if (ex.story) assert.ok(LS.STORIES[ex.story[0]], c.id + ' unknown story ' + ex.story[0]);
    if (ex.ending) assert.ok(LS.ENDINGS[ex.ending], c.id + ' unknown ending ' + ex.ending);
  }
}
for (const e of Object.values(LS.ENDINGS)) assert.ok(LS.CAST[e.who]);
// a story chapter nobody leads to is a dead card (function-valued push/go are checked by the sim below)
for (const c of LS.CARDS) if (c.story && c.w === 0 && !c.id.includes('/') && !reached.has(c.id)) console.log('note: reached only through a function push:', c.id);

const E = LS.Engine;
const runs = 600, endings = {}, lengths = [], kinds = {}, byStrat = [{}, {}, {}], storyStats = {}, seenCards = {};
for (let i = 0; i < runs; i++) {
  const s = E.newRun('T');
  let guard = 0, strategy = i % 3; // 0 random, 1 always right, 2 cautious (pick the option that helps the lowest bar)
  while (!s.over && guard++ < 1500) {
    const card = E.draw(s, {});
    kinds[card.kind] = (kinds[card.kind] || 0) + 1;
    assert.ok(card.text, 'no text for ' + card.id);
    let side = Math.random() < 0.5 ? 'L' : 'R';
    if (strategy === 1) side = 'R';
    if (strategy === 2) {
      const low = LS.STAT_KEYS.reduce((a, k) => (Math.abs(s.stats[k] - 50) > Math.abs(s.stats[a] - 50) ? k : a), 'wallet');
      const sc = o => (s.stats[low] > 50 ? -1 : 1) * (o.fx[low] || 0);
      side = sc(card.L) > sc(card.R) ? 'L' : 'R';
    }
    seenCards[card.id] = (seenCards[card.id] || 0) + 1;
    E.choose(s, card, side);
    for (const k of LS.STAT_KEYS) assert.ok(s.stats[k] >= 0 && s.stats[k] <= 100);
  }
  assert.ok(s.over, 'run did not end');
  for (const st of E.stories(s)) { const k = st.id + ':' + st.state; storyStats[k] = (storyStats[k] || 0) + 1; }
  endings[s.over] = (endings[s.over] || 0) + 1;
  byStrat[strategy][s.over] = (byStrat[strategy][s.over] || 0) + 1;
  lengths[strategy] = (lengths[strategy] || []).concat(s.cards);
}
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
console.log('endings by strategy [random, always-right, cautious]', JSON.stringify(byStrat));
console.log('avg cards per run [random, right, cautious]:', lengths.map(avg));
console.log('card kinds', kinds);
console.log('stories (per', runs, 'runs)', JSON.stringify(storyStats));
const unseen = LS.CARDS.filter(c => c.story && !seenCards[c.id]).map(c => c.id);
console.log('story cards never reached in the sim:', unseen.join(', ') || 'none');
console.log('engine: ok');
