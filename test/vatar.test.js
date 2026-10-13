/* A pretend Vatar server: proves /claim checks a purchase, credits it once and marks it delivered (the dashboard's
 * "one marked delivered" tick), with the secret and the paths the developer docs give. node test/vatar.test.js */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');

const SECRET = 'vtr_test_secret';
const purchases = {
  pay_charms01: { id: 'pay_charms01', productId: 'lucky_charms_5', playerId: 'p_tolu', amount: 100, currency: 'NGN', status: 'paid', mode: 'test' },
  pay_naira002: { id: 'pay_naira002', productId: 'naira_100', playerId: 'p_tolu', amount: 200, currency: 'NGN', status: 'paid', mode: 'test' },
  pay_other003: { id: 'pay_other003', productId: 'lucky_charms_5', playerId: 'p_someone', amount: 100, currency: 'NGN', status: 'paid', mode: 'test' },
  pay_refund04: { id: 'pay_refund04', productId: 'lucky_charms_5', playerId: 'p_tolu', amount: 100, currency: 'NGN', status: 'refunded', mode: 'test' },
  pay_unknown5: { id: 'pay_unknown5', productId: 'not_in_game', playerId: 'p_tolu', amount: 100, currency: 'NGN', status: 'paid', mode: 'test' },
};
const delivers = [];

const vatar = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + SECRET) return send(401, { error: 'bad_secret' });
    const url = req.url.replace(/^\/api\/games\/v1/, '');
    let m;
    if (req.method === 'POST' && url === '/session/verify') return send(200, { playerId: 'p_tolu', name: 'Tolu', gameId: 'g1', exp: Date.now() + 600000, mode: 'test' });
    if (req.method === 'GET' && (m = /^\/purchases\/([\w-]+)$/.exec(url))) { const p = purchases[m[1]]; return p ? send(200, p) : send(404, { error: 'not_found' }); }
    if (req.method === 'POST' && (m = /^\/purchases\/([\w-]+)\/deliver$/.exec(url))) {
      const p = purchases[m[1]];
      if (!p) return send(404, { error: 'not_found' });
      if (p.status === 'refunded') return send(409, { error: 'refunded' });
      p.status = 'delivered'; delivers.push(p.id);
      return send(200, { id: p.id, status: 'delivered', deliveredAt: Date.now() });
    }
    send(404, { error: 'not_found' });
  });
});

(async () => {
  await new Promise(r => vatar.listen(0, '127.0.0.1', r));
  process.env.VATAR_API = `http://127.0.0.1:${vatar.address().port}/api/games/v1`;
  process.env.VATAR_SECRET = SECRET;
  const server = require('../server');
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vtr1.sessiontoken' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, ...(await r.json()) };
  };

  // a real charm purchase: credited, then marked delivered on Vatar
  const a = await call('POST', '/api/claim', { purchaseId: 'pay_charms01', productId: 'lucky_charms_5' });
  assert.equal(a.status, 200);
  assert.equal(a.charms, 3);
  assert.equal(a.delivered, true);
  assert.deepEqual(delivers, ['pay_charms01']);

  // claiming it again never credits twice, and the deliver is safe to repeat
  const again = await call('POST', '/api/claim', { purchaseId: 'pay_charms01' });
  assert.equal(again.charms, 3);
  assert.equal(again.delivered, true);

  // the product comes from Vatar's record, not from what the game says it bought
  const n = await call('POST', '/api/claim', { purchaseId: 'pay_naira002', productId: 'lucky_charms_20' });
  assert.equal(n.status, 200);
  assert.equal(n.bank, 50000);
  assert.equal(n.charms, 3);
  assert.ok(delivers.includes('pay_naira002'));

  // someone else's purchase, a refund and a product we don't sell are never delivered
  assert.equal((await call('POST', '/api/claim', { purchaseId: 'pay_other003' })).status, 403);
  assert.equal((await call('POST', '/api/claim', { purchaseId: 'pay_refund04' })).status, 409);
  assert.equal((await call('POST', '/api/claim', { purchaseId: 'pay_unknown5' })).status, 400);
  assert.equal((await call('POST', '/api/claim', { purchaseId: 'pay_missing0' })).status, 404);
  assert.equal(purchases.pay_other003.status, 'paid');
  assert.equal(purchases.pay_unknown5.status, 'paid');

  // the shop lists both kinds of pack, priced by us
  const shop = await call('GET', '/api/bank');
  assert.deepEqual(shop.charmPacks.map(p => p.id), ['lucky_charms_5', 'lucky_charms_20']);
  assert.deepEqual(shop.packs.map(p => p.id), ['naira_100', 'naira_500', 'naira_200']);

  console.log('vatar ok');
  server.close(); vatar.close();
})().catch(e => { console.error(e); process.exit(1); });
