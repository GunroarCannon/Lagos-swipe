/* The whole JSON API as one dispatcher, used by both Vercel (api/[...path].js) and server.js.
 *
 *   GET  /api/health
 *   GET  /api/me                      my profile, inventory, unread count
 *   POST /api/profile                 save my portrait genome + preset bio
 *   GET  /api/discover?n=6&show=all   real players to swipe on
 *   POST /api/swipe                   { target, dir: 'like' | 'pass'  (say hello / walk past) } → { match? }
 *   GET  /api/inbox                   notifications + matches
 *   POST /api/inbox/read              mark notifications read
 *   GET  /api/chat?with=<id>          messages with a match
 *   POST /api/chat                    { to, k: <preset id> }
 *   POST /api/score                   { score, days }
 *   GET  /api/leaderboard
 *   POST /api/claim                   { purchaseId } deliver a Vatar purchase (charms or naira)
 *   POST /api/spend                   { n } use a purchased lucky charm
 *   GET  /api/bank                    my naira, my charms, and what money can buy
 *   POST /api/exchange                { points } turn Wallet stat points into bank naira
 *   POST /api/charms/buy              { n } spend bank naira on lucky charms
 *   POST /api/avatar-look             { avatar?, skins?, hairs? } read a photo into a portrait default
 *   POST /api/block | /api/report     { target, reason? }
 *
 * Free text is never accepted from players: bios and chat are built from preset ids, so there is nothing to
 * moderate. The client owns the text for each id. */
'use strict';

const crypto = require('node:crypto');
const { getStore, getJSON, setJSON } = require('./store');
const { authenticate, vatar, HttpError, DEV_OK, SECRET } = require('./auth');
const vision = require('./vision');

/* Products. naira is what the world charges (it must match the price in the developer dashboard); charms and
 * bank are what we credit. The dashboard is the source of truth for the price shown to the player. */
const PRODUCTS = {
  lucky_charms_5: { charms: 3, naira: 100, name: '3 lucky charms' },
  lucky_charms_20: { charms: 15, naira: 300, name: '15 lucky charms' },
  naira_100: { bank: 50000, naira: 200, name: '₦50,000 naira' },
  naira_500: { bank: 275000, naira: 500, name: '₦275,000 naira' },
  naira_200: { bank: 1200000, naira: 2000, name: '₦1,200,000 naira' },
};

/* Bank naira is a spendable in-game balance, bought two ways: out of the player's own Wallet stat, or with
 * real money through the world's pay sheet. Both are priced to the same value, so real money is a shortcut
 * and never a trap: ₦200 real buys ₦50,000 of bank, and a charm costs ₦10,000 of bank. Change these four numbers to retune the whole economy. */
const RATE_WALLET = 3500;      // naira per Wallet point — the rate the HUD already shows (engine.js moneyText)
const EXCHANGE_MAX = 40;       // Wallet points in one exchange
const EXCHANGE_DAY = 120;      // Wallet points per player per day
const CHARM_NGN = 10000;       // bank naira per lucky charm

const MAX_BODY = 128 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const SLUG_RE = /^[a-z0-9_-]{1,28}$/;

const keys = (mode, id) => ({
  profile: `ls:${mode}:p:${id}`,
  pool: `ls:${mode}:pool`,
  seen: `ls:${mode}:seen:${id}`,
  liked: `ls:${mode}:liked:${id}`,       // people I liked
  likes: `ls:${mode}:likes:${id}`,       // people who liked me
  matches: `ls:${mode}:matches:${id}`,   // zset: match id → last activity
  notif: `ls:${mode}:notif:${id}`,
  meta: `ls:${mode}:meta:${id}`,         // hash: readAt, …
  inv: `ls:${mode}:inv:${id}`,           // hash: charms
  bank: `ls:${mode}:bank:${id}`,         // hash: ngn — the spendable in-game balance
  look: `ls:${mode}:look:${id}`,         // the last photo we read and what we made of it
  xday: `ls:${mode}:xday:${id}`,         // hash: date → Wallet points turned over that day
  block: `ls:${mode}:block:${id}`,
  lb: `ls:${mode}:lb`,
});
const chatKey = (mode, a, b) => `ls:${mode}:chat:${[a, b].sort().join('|')}`;

// ---------------------------------------------------------------- validation
const slug = (v, n = 28) => (typeof v === 'string' && SLUG_RE.test(v) ? v.slice(0, n) : '');

function cleanGenome(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) throw new HttpError(400, 'bad_genome');
  const out = {}, ks = Object.keys(g);
  if (ks.length > 160) throw new HttpError(400, 'bad_genome', 'Too many fields.');
  for (const k of ks) {
    if (!/^[A-Za-z0-9_]{1,28}$/.test(k)) continue;
    const v = g[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 10000) / 10000;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.replace(/[^\w#.\- ]/g, '').slice(0, 40);
    else if (Array.isArray(v)) out[k] = v.filter(x => typeof x === 'string').slice(0, 8).map(x => x.replace(/[^\w#.\- ]/g, '').slice(0, 32));
  }
  if (typeof out.archetype !== 'string' || !out.archetype) throw new HttpError(400, 'bad_genome', 'No heritage.');
  return out;
}

function cleanBio(b) {
  b = b && typeof b === 'object' ? b : {};
  return {
    job: slug(b.job), area: slug(b.area), love: slug(b.love), flag: slug(b.flag),
    vibes: Array.isArray(b.vibes) ? b.vibes.map(v => slug(v)).filter(Boolean).slice(0, 3) : [],
    looking: ['fem', 'masc', 'all'].includes(b.looking) ? b.looking : 'all',
    age: Math.min(60, Math.max(18, Math.round(Number(b.age) || 24))),
    life: cleanLife(b.life),
  };
}

function cleanLife(l) {
  if (!l || typeof l !== 'object') return null;
  const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return { job: slug(l.job), home: slug(l.home), status: slug(l.status), age: n(l.age, 99), friends: n(l.friends, 999), score: n(l.score, 1e6) };
}

function cleanAvatar(a) {
  if (typeof a !== 'string') return null;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a) || a.length > 60000) return null;
  return a;
}

/** The colour lists the client offers: hex only, and at most as many as we'd ever ask the model about. */
const cleanSwatches = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x)).slice(0, 24) : undefined);

const pub = p => p && ({ id: p.id, name: p.name, genome: p.genome, bio: p.bio, avatar: p.avatar || null, best: p.best || 0, days: p.days || 0, loves: p.loves || 0, seenAt: p.seenAt || 0 });

const naira = n => '₦' + Math.round(n).toLocaleString('en-NG');
const bankOf = async (db, K) => Number(await db.hget(K.bank, 'ngn')) || 0;
const today = () => new Date().toISOString().slice(0, 10);
/** Only ever a hash of the photo: it decides whether we already read this exact picture. */
const photoId = avatar => crypto.createHash('sha256').update(String(avatar)).digest('hex').slice(0, 16);

async function limit(db, mode, id, bucket, max, windowSec) {
  const k = `ls:${mode}:rl:${bucket}:${id}`;
  const n = await db.incr(k);
  if (n === 1) await db.expire(k, windowSec);
  if (n > max) throw new HttpError(429, 'rate_limited', 'Slow down a little.');
}

// ---------------------------------------------------------------- routes
const routes = {};

routes['GET /health'] = async () => ({ ok: true, store: getStore().kind, vatar: !!SECRET, dev: DEV_OK });

routes['GET /me'] = async ({ db, me, K }) => {
  const [profile, inv, meta, bank] = await Promise.all([getJSON(db, K.profile), db.hgetall(K.inv), db.hgetall(K.meta), bankOf(db, K)]);
  const readAt = Number(meta.readAt) || 0;
  const notifs = (await db.lrange(K.notif, 0, 39)).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  return { me: { id: me.id, name: me.name, mode: me.mode }, profile: pub(profile), charms: Number(inv.charms) || 0, bank, unread: notifs.filter(n => n.at > readAt).length };
};

routes['POST /profile'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'profile', 30, 60);
  const old = (await getJSON(db, K.profile)) || {};
  const p = Object.assign({}, old, {
    id: me.id, name: me.name, genome: cleanGenome(body.genome), bio: cleanBio(body.bio),
    avatar: body.avatar === undefined ? old.avatar || null : cleanAvatar(body.avatar),
    seenAt: Date.now(), createdAt: old.createdAt || Date.now(),
  });
  await setJSON(db, K.profile, p);
  await db.zadd(K.pool, p.seenAt, me.id);
  return { profile: pub(p) };
};

routes['GET /discover'] = async ({ db, me, K, query }) => {
  const n = Math.min(12, Math.max(1, Number(query.n) || 6));
  const show = ['fem', 'masc', 'all'].includes(query.show) ? query.show : 'all';
  const [ids, seen, blocked, likedMe] = await Promise.all([db.zrevrange(K.pool, 0, 199), db.smembers(K.seen), db.smembers(K.block), db.smembers(K.likes)]);
  const skip = new Set([me.id, ...seen, ...blocked]);
  const fresh = ids.filter(id => !skip.has(id));
  // people who already liked me go first, so a swipe right is a likely match
  const liked = new Set(likedMe);
  fresh.sort((a, b) => (liked.has(b) ? 1 : 0) - (liked.has(a) ? 1 : 0));
  const out = [];
  const mine = await getJSON(db, `ls:${me.mode}:p:${me.id}`);
  const myG = mine && mine.genome && mine.genome.gender;
  for (const id of fresh) {
    if (out.length >= n) break;
    const p = await getJSON(db, `ls:${me.mode}:p:${id}`);
    if (!p || !p.genome) continue;
    if (show !== 'all' && p.genome.gender !== show) continue;
    // both ways: they are only shown to someone they would look for
    const lk = p.bio && p.bio.looking;
    if (myG && (lk === 'fem' || lk === 'masc') && lk !== myG) continue;
    if (await db.sismember(`ls:${me.mode}:block:${id}`, me.id)) continue;
    out.push(Object.assign(pub(p), { likesYou: liked.has(id) }));
  }
  return { profiles: out };
};

routes['POST /swipe'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'swipe', 180, 60);
  const target = String(body.target || '');
  const dir = body.dir === 'like' ? 'like' : 'pass';
  if (!ID_RE.test(target) || target === me.id) throw new HttpError(400, 'bad_target');
  const tp = await getJSON(db, `ls:${me.mode}:p:${target}`);
  if (!tp) throw new HttpError(404, 'not_found');
  await db.sadd(K.seen, target);
  if (dir === 'pass') return { ok: true };

  const T = keys(me.mode, target), now = Date.now();
  const first = await db.sadd(K.liked, target);
  await db.sadd(T.likes, me.id);
  const mutual = await db.sismember(T.liked, me.id);
  const notif = (to, o) => db.lpush(to, JSON.stringify(Object.assign({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now() }, o)))
    .then(() => db.ltrim(to, 0, 59));
  const self = (await getJSON(db, K.profile)) || { id: me.id, name: me.name };

  if (mutual) {
    await db.zadd(K.matches, now, target);
    await db.zadd(T.matches, now, me.id);
    await notif(T.notif, { t: 'match', from: { id: me.id, name: me.name } });
    await notif(K.notif, { t: 'match', from: { id: target, name: tp.name } });
    return { match: true, profile: pub(tp), charms: Number(await db.hget(K.inv, 'charms')) || 0 };
  }
  if (first) await notif(T.notif, { t: 'like', from: { id: me.id, name: self.name || me.name } });
  return { match: false, charms: Number(await db.hget(K.inv, 'charms')) || 0 };
};

routes['GET /inbox'] = async ({ db, me, K }) => {
  const meta = await db.hgetall(K.meta);
  const readAt = Number(meta.readAt) || 0;
  const notifs = (await db.lrange(K.notif, 0, 39)).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  const ids = await db.zrevrange(K.matches, 0, 49);
  const matches = [];
  for (const id of ids) {
    const p = await getJSON(db, `ls:${me.mode}:p:${id}`);
    if (!p) continue;
    const last = await db.lrange(chatKey(me.mode, me.id, id), 0, 0);
    let lastMsg = null; try { lastMsg = last[0] ? JSON.parse(last[0]) : null; } catch (e) { /* ignore */ }
    matches.push({ profile: pub(p), last: lastMsg, unread: !!(lastMsg && lastMsg.from !== me.id && lastMsg.at > (Number(meta['r:' + id]) || 0)) });
  }
  const likedYou = (await db.smembers(K.likes)).length;
  return { notifs: notifs.map(n => Object.assign(n, { unread: n.at > readAt })), matches, likedYou, unread: notifs.filter(n => n.at > readAt).length };
};

routes['POST /inbox/read'] = async ({ db, K }) => { await db.hset(K.meta, 'readAt', Date.now()); return { ok: true }; };

routes['GET /chat'] = async ({ db, me, K, query }) => {
  const other = String(query.with || '');
  if (!ID_RE.test(other)) throw new HttpError(400, 'bad_target');
  if ((await db.zscore(K.matches, other)) == null) throw new HttpError(403, 'not_matched');
  const msgs = (await db.lrange(chatKey(me.mode, me.id, other), 0, 59)).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean).reverse();
  await db.hset(K.meta, 'r:' + other, Date.now());
  return { messages: msgs };
};

routes['POST /chat'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'chat', 40, 60);
  const to = String(body.to || ''), k = slug(body.k);
  if (!ID_RE.test(to) || !k) throw new HttpError(400, 'bad_request');
  if ((await db.zscore(K.matches, to)) == null) throw new HttpError(403, 'not_matched');
  const now = Date.now(), T = keys(me.mode, to);
  await db.lpush(chatKey(me.mode, me.id, to), JSON.stringify({ from: me.id, k, at: now }));
  await db.ltrim(chatKey(me.mode, me.id, to), 0, 99);
  await db.zadd(K.matches, now, to);
  await db.zadd(T.matches, now, me.id);
  await db.lpush(T.notif, JSON.stringify({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), t: 'msg', k, at: now, from: { id: me.id, name: me.name } }));
  await db.ltrim(T.notif, 0, 59);
  return { ok: true, at: now };
};

routes['POST /score'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'score', 20, 60);
  const score = Math.max(0, Math.min(1e6, Math.floor(Number(body.score) || 0)));
  const days = Math.max(0, Math.min(1e5, Math.floor(Number(body.days) || 0)));
  const loves = Math.max(0, Math.min(1e4, Math.floor(Number(body.loves) || 0)));
  const prev = await db.zscore(K.lb, me.id);
  if (prev == null || score > prev) await db.zadd(K.lb, score, me.id);
  const p = await getJSON(db, K.profile);
  if (p) { p.best = Math.max(p.best || 0, score); p.days = Math.max(p.days || 0, days); p.loves = Math.max(p.loves || 0, loves); await setJSON(db, K.profile, p); }
  return { best: Math.max(prev || 0, score) };
};

routes['GET /leaderboard'] = async ({ db, me, K }) => {
  const ids = await db.zrevrange(K.lb, 0, 19);
  const top = [];
  for (const id of ids) {
    const p = await getJSON(db, `ls:${me.mode}:p:${id}`);
    if (p) top.push({ rank: top.length + 1, id, name: p.name, genome: p.genome, best: p.best || 0, days: p.days || 0, you: id === me.id });
  }
  return { top };
};

routes['POST /claim'] = async ({ db, me, K, body }) => {
  const id = String(body.purchaseId || '');
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new HttpError(400, 'bad_request');
  let productId, owner;
  if (me.mode === 'dev') {
    if (!id.startsWith('dev_')) throw new HttpError(404, 'not_found');
    productId = String(body.productId || 'lucky_charms_5'); owner = me.id;
  } else {
    const p = await vatar('/purchases/' + encodeURIComponent(id));
    if (p.http !== 200) throw new HttpError(404, 'not_found', 'No such paid purchase.');
    if (p.status === 'refunded') throw new HttpError(409, 'refunded');
    productId = p.productId; owner = p.playerId;
  }
  if (owner !== me.id) throw new HttpError(403, 'not_yours');
  const prod = PRODUCTS[productId];
  if (!prod) throw new HttpError(400, 'unknown_product');
  const marker = `ls:${me.mode}:claimed:${id}`;
  if (await db.set(marker, me.id, { nx: true })) {
    try {
      if (prod.charms) await db.hincrby(K.inv, 'charms', prod.charms);
      if (prod.bank) await db.hincrby(K.bank, 'ngn', prod.bank);
    } catch (e) { await db.del(marker); throw e; }
  }
  // Tell Vatar the goods are in the player's hands (this is the "marked delivered" tick on the integration
  // checklist). Repeating it is harmless, so a failed attempt is retried on the next claim of the same purchase.
  let delivered = true, deliverError;
  if (me.mode !== 'dev') {
    const path = `/purchases/${encodeURIComponent(id)}/deliver`;
    let d = await vatar(path, {}).catch(e => ({ http: 0, error: String(e.message || e) }));
    if (d.http === 0 || d.http >= 500) d = await vatar(path, {}).catch(e => ({ http: 0, error: String(e.message || e) }));
    delivered = d.http >= 200 && d.http < 300;
    if (!delivered) {
      deliverError = `${d.http} ${d.error || d.message || ''}`.trim();
      console.error('[claim] deliver failed for', id, deliverError, JSON.stringify(d));
    }
  }
  return { ok: true, delivered, ...(deliverError ? { deliverError } : {}), charms: Number(await db.hget(K.inv, 'charms')) || 0, bank: await bankOf(db, K) };
};

// ---------------------------------------------------------------- the bank
/** What money can buy, priced by us and never by the game. */
routes['GET /bank'] = async ({ db, me, K }) => {
  const [bank, inv, spent] = await Promise.all([bankOf(db, K), db.hgetall(K.inv), db.hget(K.xday, today())]);
  return {
    bank, charms: Number(inv.charms) || 0,
    rate: RATE_WALLET, charmNgn: CHARM_NGN, exchangeMax: EXCHANGE_MAX, exchangeDay: EXCHANGE_DAY,
    exchangedToday: Number(spent) || 0,
    packs: Object.entries(PRODUCTS).filter(([, p]) => p.bank).map(([id, p]) => ({ id, naira: p.naira, bank: p.bank, name: p.name })),
    charmPacks: Object.entries(PRODUCTS).filter(([, p]) => p.charms).map(([id, p]) => ({ id, naira: p.naira, charms: p.charms, name: p.name })),
  };
};

/** Turn Wallet stat points into bank naira. The run lives in the client, so we take its word for the points
 *  and cap how much can be turned over instead — see the note in README. */
routes['POST /exchange'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'exchange', 20, 60);
  const points = Math.floor(Number(body.points));
  if (!Number.isFinite(points) || points < 1 || points > EXCHANGE_MAX) throw new HttpError(400, 'bad_amount', `Turn over between 1 and ${EXCHANGE_MAX} Wallet points.`);
  const used = Number(await db.hget(K.xday, today())) || 0;
  if (used + points > EXCHANGE_DAY) throw new HttpError(429, 'daily_limit', `That is the most of your own naira you can spend today. Come back tomorrow.`);
  const bank = await db.hincrby(K.bank, 'ngn', points * RATE_WALLET);
  await db.hincrby(K.xday, today(), points);
  await db.expire(K.xday, 60 * 60 * 24 * 3);
  return { bank, gained: points * RATE_WALLET, points, exchangedToday: used + points };
};

/** Spend bank naira on lucky charms. Never lets the balance go below zero (same shape as /spend). */
routes['POST /charms/buy'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'charmbuy', 20, 60);
  const n = Math.max(1, Math.min(20, Math.floor(Number(body.n) || 1)));
  const cost = n * CHARM_NGN;
  const left = await db.hincrby(K.bank, 'ngn', -cost);
  if (left < 0) { await db.hincrby(K.bank, 'ngn', cost); throw new HttpError(402, 'no_naira', `That costs ${naira(cost)} and you have less than that.`); }
  const charms = await db.hincrby(K.inv, 'charms', n);
  return { bank: left, charms, spent: cost };
};

// ---------------------------------------------------------------- reading a photo
/**
 * Default a player's portrait from their Lagos Life photo: how they present, and the closest skin and hair
 * colour. The answer is cached against the photo itself, so a player costs one paid call per photo at most.
 */
routes['POST /avatar-look'] = async ({ db, me, K, body }) => {
  await limit(db, me.mode, me.id, 'look', 12, 3600);
  const profile = await getJSON(db, K.profile);
  const avatar = cleanAvatar(body.avatar) || (profile && profile.avatar) || null;
  if (!avatar) throw new HttpError(400, 'no_avatar', 'There is no photo to read.');
  // Keyed by the photo itself, and on a key of its own rather than the profile: a player reads a photo on
  // the way into the game, before there is any profile to hang it on, and the answer must not differ
  // between the first screen and the button they press a minute later.
  const v = photoId(avatar);
  const cached = await getJSON(db, K.look);
  if (cached && cached.v === v) return { look: cached, cached: true };
  if (!vision.enabled) throw new HttpError(503, 'vision_off', 'Reading photos is not switched on for this server.');
  const read = await vision.analyse(avatar, cleanSwatches(body.skins), cleanSwatches(body.hairs));
  if (!read) throw new HttpError(502, 'unreadable', 'We could not make out a face in that photo.');
  const look = { v, gender: read.gender, skin: read.skin, hair: read.hair, at: Date.now() };
  await setJSON(db, K.look, look);
  return { look, cached: false };
};

routes['POST /spend'] = async ({ db, K, body }) => {
  const n = Math.max(1, Math.min(5, Math.floor(Number(body.n) || 1)));
  const left = await db.hincrby(K.inv, 'charms', -n);
  if (left < 0) { await db.hincrby(K.inv, 'charms', n); throw new HttpError(402, 'no_charms'); }
  return { charms: left };
};

routes['POST /block'] = async ({ db, me, K, body }) => {
  const t = String(body.target || '');
  if (!ID_RE.test(t) || t === me.id) throw new HttpError(400, 'bad_target');
  await db.sadd(K.block, t);
  await db.zrem(K.matches, t);
  await db.zrem(keys(me.mode, t).matches, me.id);
  return { ok: true };
};

routes['POST /report'] = async ({ db, me, body }) => {
  await limit(db, me.mode, me.id, 'report', 10, 3600);
  const t = String(body.target || '');
  if (!ID_RE.test(t)) throw new HttpError(400, 'bad_target');
  await db.lpush(`ls:${me.mode}:reports`, JSON.stringify({ by: me.id, target: t, reason: slug(body.reason) || 'other', at: Date.now() }));
  return { ok: true };
};

// ---------------------------------------------------------------- dispatcher
function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    try { return Promise.resolve(JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '{}'))); }
    catch (e) { return Promise.reject(new HttpError(400, 'bad_json')); }
  }
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { reject(new HttpError(413, 'too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new HttpError(400, 'bad_json')); } });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function handle(req, res) {
  try {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const route = routes[`${req.method} ${path}`];
    if (!route) throw new HttpError(404, 'not_found', 'No such endpoint.');
    const db = getStore();
    const ctx = { db, query: Object.fromEntries(u.searchParams) };
    if (path !== '/health') {
      ctx.me = await authenticate(req);
      ctx.K = keys(ctx.me.mode, ctx.me.id);
    }
    ctx.body = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, await route(ctx));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
    console.error('[api]', e);
    send(res, 500, { error: 'error', message: 'Something went wrong on our side.' });
  }
}

module.exports = { handle, routes, PRODUCTS, RATE_WALLET, CHARM_NGN };
