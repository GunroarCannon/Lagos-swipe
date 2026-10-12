/* API tests against the real server with the in-memory store (no keys needed). node test/api.test.js */
'use strict';
const assert = require('node:assert/strict');
const server = require('../server');
const vision = require('../lib/vision');

const dev = (id, name) => 'dev.' + Buffer.from(JSON.stringify({ id, name })).toString('base64url');
let base;
async function call(method, path, token, body) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
const genome = (g = 'fem') => ({ seed: 5, archetype: 'yoruba', gender: g, age: 0.3, skin: '#573421', hairStyle: 'box-braids', marks: ['dimples'] });
const bio = { job: 'banker', area: 'lekki', vibes: ['suya', 'gym'], looking: 'all', age: 27, love: 'acts', flag: 'late' };

(async () => {
  await new Promise(r => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
  const A = dev('amaka001', 'Amaka'), B = dev('tunde002', 'Tunde'), C = dev('chidi003', 'Chidi');

  assert.equal((await call('GET', '/api/health')).ok, true);
  assert.equal((await call('GET', '/api/me')).status, 401);

  // profiles
  assert.equal((await call('POST', '/api/profile', A, { genome: genome('fem'), bio })).profile.name, 'Amaka');
  await call('POST', '/api/profile', B, { genome: genome('masc'), bio });
  await call('POST', '/api/profile', C, { genome: genome('masc'), bio });
  assert.equal((await call('POST', '/api/profile', A, { genome: {} })).status, 400);

  // discover excludes me, respects the gender filter
  const d1 = await call('GET', '/api/discover?show=masc', A);
  assert.deepEqual(d1.profiles.map(p => p.name).sort(), ['Chidi', 'Tunde']);
  assert.equal((await call('GET', '/api/discover?show=fem', A)).profiles.length, 0);

  // one-sided like → notification for B, no match
  const s1 = await call('POST', '/api/swipe', A, { target: 'd_tunde002', dir: 'like' });
  assert.equal(s1.match, false);
  const inbB = await call('GET', '/api/inbox', B);
  assert.equal(inbB.notifs[0].t, 'like');
  assert.equal(inbB.unread, 1);
  assert.equal(inbB.likedYou, 1);
  // B sees A first (she liked him) and the swipe back is a match
  const d2 = await call('GET', '/api/discover', B);
  assert.equal(d2.profiles[0].name, 'Amaka');
  assert.equal(d2.profiles[0].likesYou, true);
  const s2 = await call('POST', '/api/swipe', B, { target: 'd_amaka001', dir: 'like' });
  assert.equal(s2.match, true);
  assert.equal(s2.profile.name, 'Amaka');
  assert.equal((await call('GET', '/api/inbox', A)).matches.length, 1);
  assert.equal((await call('GET', '/api/inbox', A)).notifs[0].t, 'match');

  // a swiped person does not come back
  assert.equal((await call('GET', '/api/discover', A)).profiles.map(p => p.name).includes('Tunde'), false);

  // chat needs a match, uses presets only
  assert.equal((await call('POST', '/api/chat', A, { to: 'd_chidi003', k: 'hi' })).status, 403);
  assert.equal((await call('POST', '/api/chat', A, { to: 'd_tunde002', k: 'hi' })).ok, true);
  assert.equal((await call('POST', '/api/chat', A, { to: 'd_tunde002', k: '<script>' })).status, 400);
  const chat = await call('GET', '/api/chat?with=d_amaka001', B);
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].k, 'hi');
  const inb2 = await call('GET', '/api/inbox', B);
  assert.equal(inb2.matches[0].last.k, 'hi');
  assert.equal(inb2.matches[0].unread, false); // read by opening the chat

  // lucky charms: spending needs inventory; dev claim credits and is idempotent
  assert.equal((await call('POST', '/api/spend', A, { n: 1 })).status, 402);
  const claim = await call('POST', '/api/claim', A, { purchaseId: 'dev_abc123', productId: 'lucky_charms_5' });
  assert.equal(claim.charms, 3);
  assert.equal((await call('POST', '/api/claim', A, { purchaseId: 'dev_abc123', productId: 'lucky_charms_5' })).charms, 3);
  assert.equal((await call('POST', '/api/spend', A, { n: 1 })).charms, 2);

  // scores, leaderboard, block
  await call('POST', '/api/score', A, { score: 900, days: 40, loves: 2 });
  await call('POST', '/api/score', A, { score: 100, days: 5 });
  await call('POST', '/api/score', B, { score: 1200, days: 60 });
  const lb = await call('GET', '/api/leaderboard', A);
  assert.deepEqual(lb.top.map(t => [t.name, t.best]), [['Tunde', 1200], ['Amaka', 900]]);
  assert.equal((await call('POST', '/api/block', A, { target: 'd_tunde002' })).ok, true);
  assert.equal((await call('GET', '/api/inbox', A)).matches.length, 0);
  assert.equal((await call('POST', '/api/report', A, { target: 'd_chidi003', reason: 'spam' })).ok, true);
  assert.equal((await call('GET', '/api/me', A)).profile.best, 900);

  // ---- the bank: naira is bought with Wallet stat points, or with real money through a Vatar pack
  const shop = await call('GET', '/api/bank', A);
  assert.equal(shop.bank, 0);
  assert.equal(shop.charms, 2);
  assert.deepEqual(shop.packs.map(p => p.id), ['naira_100', 'naira_500', 'naira_200']);
  assert.equal(shop.rate, 3500);
  assert.equal(shop.charmNgn, 10000);

  // a charm you cannot afford changes nothing
  assert.equal((await call('POST', '/api/charms/buy', A, { n: 1 })).status, 402);
  assert.equal((await call('GET', '/api/bank', A)).bank, 0);
  assert.equal((await call('GET', '/api/bank', A)).charms, 2);

  // Wallet points in. 10 points at 3,500 is 35,000; nonsense is refused and costs nothing
  assert.equal((await call('POST', '/api/exchange', A, { points: 0 })).status, 400);
  assert.equal((await call('POST', '/api/exchange', A, { points: 41 })).status, 400);
  assert.equal((await call('POST', '/api/exchange', A, { points: 'ten' })).status, 400);
  const x1 = await call('POST', '/api/exchange', A, { points: 10 });
  assert.equal(x1.bank, 35000);
  assert.equal(x1.gained, 35000);
  assert.equal((await call('GET', '/api/me', A)).bank, 35000);

  // naira buys charms, and the balance is what is left
  const buy = await call('POST', '/api/charms/buy', A, { n: 1 });
  assert.equal(buy.bank, 25000);
  assert.equal(buy.charms, 3);
  assert.equal((await call('POST', '/api/charms/buy', A, { n: 3 })).status, 402);   // 30,000 > 25,000
  assert.equal((await call('GET', '/api/bank', A)).charms, 3);

  // the daily ceiling on turning Wallet money over
  await call('POST', '/api/exchange', A, { points: 40 });
  await call('POST', '/api/exchange', A, { points: 40 });
  assert.equal((await call('GET', '/api/bank', A)).exchangedToday, 90);
  assert.equal((await call('POST', '/api/exchange', A, { points: 40 })).status, 429);
  assert.equal((await call('POST', '/api/exchange', A, { points: 30 })).status, 200);   // 120 exactly is allowed
  assert.equal((await call('GET', '/api/bank', A)).exchangedToday, 120);
  // 35,000 − 10,000 for the charm, plus 140,000 + 140,000 + 105,000 turned over
  assert.equal((await call('GET', '/api/bank', A)).bank, 410000);

  // real money: a pack credits naira once, and a repeat is not paid twice
  const before = (await call('GET', '/api/bank', A)).bank;
  assert.equal((await call('POST', '/api/claim', A, { purchaseId: 'dev_naira001', productId: 'naira_500' })).bank, before + 275000);
  assert.equal((await call('POST', '/api/claim', A, { purchaseId: 'dev_naira001', productId: 'naira_500' })).bank, before + 275000);
  assert.equal((await call('POST', '/api/claim', A, { purchaseId: 'dev_naira002', productId: 'naira_9999' })).status, 400);

  // ---- reading a photo into a portrait default
  assert.equal((await call('POST', '/api/avatar-look', A, {})).status, 400);                    // nothing to read
  assert.equal((await call('POST', '/api/avatar-look', A, { avatar: 'http://x/a.png' })).status, 400);
  if (!vision.enabled) {
    const png = 'data:image/png;base64,' + Buffer.from('not really a png').toString('base64');
    assert.equal((await call('POST', '/api/avatar-look', A, { avatar: png })).status, 503);      // no key on this server
  }

  console.log('api: all tests passed');
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
