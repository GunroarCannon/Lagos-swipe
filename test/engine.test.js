/* Headless engine test: loads the pure-logic scripts and simulates many random playthroughs. */
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const win = { console, Math, JSON, Object, Array, Set, Map, Date, setTimeout, clearTimeout };
win.window = win; win.localStorage = { getItem: () => null, setItem() {} };
vm.createContext(win);
for (const f of ['util', 'data', 'people', 'cards', 'engine']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', f + '.js'), 'utf8'), win, { filename: f });
const LS = win.LS;
// no portrait engine here: stub what the engine asks for
LS.makeProfile = seed => { const r = LS.rng('p' + seed); const type = r.weighted({ sweet: 40, baller: 11, broke: 11, catfish: 8, scammer: 5, clingy: 11, flaky: 12 });
  return { id: 'n' + seed, kind: 'npc', name: 'P' + seed, age: 25, genome: { archetype: 'yoruba' }, realGenome: { archetype: 'yoruba' }, job: 'banker', type, line: 'hi', pick: 0 }; };

// every card is well-formed
const ids = new Set();
for (const c of LS.CARDS) {
  assert.ok(!ids.has(c.id), 'duplicate card id ' + c.id); ids.add(c.id);
  assert.ok(c.text && c.L.t && c.R.t, 'card incomplete ' + c.id);
  for (const k of Object.keys(Object.assign({}, c.L.fx, c.R.fx))) assert.ok(LS.STAT_KEYS.includes(k), c.id + ' bad stat ' + k);
  if (c.who && c.who !== 'PARTNER') assert.ok(LS.CAST[c.who], c.id + ' unknown cast ' + c.who);
  for (const side of [c.L, c.R]) for (const p of side.ex.push || []) assert.ok(LS.CARDS.find(x => x.id === p.id), c.id + ' pushes unknown ' + p.id);
}
for (const e of Object.values(LS.ENDINGS)) assert.ok(LS.CAST[e.who]);

const E = LS.Engine;
const runs = 600, endings = {}, lengths = [], kinds = {}, byStrat = [{}, {}, {}];
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
    E.choose(s, card, side);
    for (const k of LS.STAT_KEYS) assert.ok(s.stats[k] >= 0 && s.stats[k] <= 100);
  }
  assert.ok(s.over, 'run did not end');
  endings[s.over] = (endings[s.over] || 0) + 1;
  byStrat[strategy][s.over] = (byStrat[strategy][s.over] || 0) + 1;
  lengths[strategy] = (lengths[strategy] || []).concat(s.cards);
}
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
console.log('endings by strategy [random, always-right, cautious]', JSON.stringify(byStrat));
console.log('avg cards per run [random, right, cautious]:', lengths.map(avg));
console.log('card kinds', kinds);
console.log('engine: ok');
