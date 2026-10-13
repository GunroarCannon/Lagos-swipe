/* Tiny key-value layer with two backends behind one interface:
 *   - Upstash Redis over REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_* names the
 *     Vercel marketplace integration sets). Plain fetch, no packages, works on serverless.
 *   - an in-memory fallback, so `npm start` works with no keys at all (data is lost on restart).
 * Every method is async. Values are strings; use getJSON/setJSON for objects. */
'use strict';

/** The REST address is https://<name>.upstash.io. People often paste the redis-cli line instead
 *  ("redis-cli --tls -u redis://default:…@<name>.upstash.io:6379"); the host in it is the same one, so use that
 *  rather than failing every request. The password in such a line is never used or logged. */
function restUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '');
  const m = /@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.upstash\.io)/.exec(s) || /([A-Za-z0-9-]+\.upstash\.io)/.exec(s);
  if (!m) return '';
  console.warn('[store] The Redis REST URL setting is not an https:// address; using https://' + m[1] + ' from it. Set it to that address.');
  return 'https://' + m[1];
}

const REST_URL = restUrl(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

function redisBackend() {
  async function call(path, body) {
    const r = await fetch(REST_URL + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + REST_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('store: ' + (j.error || r.status));
    return j;
  }
  const run = async args => (await call('', args)).result;
  const pairs = flat => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };
  return {
    kind: 'redis',
    get: k => run(['GET', k]),
    async set(k, v, o = {}) {
      const a = ['SET', k, v];
      if (o.ex) a.push('EX', String(o.ex));
      if (o.nx) a.push('NX');
      return (await run(a)) === 'OK';
    },
    del: k => run(['DEL', k]),
    async sadd(k, ...m) { return m.length ? run(['SADD', k, ...m]) : 0; },
    srem: (k, ...m) => run(['SREM', k, ...m]),
    async sismember(k, m) { return (await run(['SISMEMBER', k, m])) === 1; },
    smembers: async k => (await run(['SMEMBERS', k])) || [],
    scard: k => run(['SCARD', k]),
    zadd: (k, score, m) => run(['ZADD', k, String(score), m]),
    zrem: (k, m) => run(['ZREM', k, m]),
    zrevrange: async (k, a, b) => (await run(['ZREVRANGE', k, String(a), String(b)])) || [],
    zscore: async (k, m) => { const s = await run(['ZSCORE', k, m]); return s == null ? null : Number(s); },
    zcard: k => run(['ZCARD', k]),
    lpush: (k, v) => run(['LPUSH', k, v]),
    lrange: async (k, a, b) => (await run(['LRANGE', k, String(a), String(b)])) || [],
    ltrim: (k, a, b) => run(['LTRIM', k, String(a), String(b)]),
    hincrby: (k, f, n) => run(['HINCRBY', k, f, String(n)]),
    hget: (k, f) => run(['HGET', k, f]),
    hset: (k, f, v) => run(['HSET', k, f, String(v)]),
    hgetall: async k => pairs(await run(['HGETALL', k])),
    incr: k => run(['INCR', k]),
    expire: (k, s) => run(['EXPIRE', k, String(s)]),
  };
}

function memoryBackend() {
  const kv = new Map(), exp = new Map();
  const alive = k => { const t = exp.get(k); if (t && t < Date.now()) { kv.delete(k); exp.delete(k); } return kv.has(k); };
  const coll = (k, mk) => { if (!alive(k)) kv.set(k, mk()); return kv.get(k); };
  const slice = (arr, a, b) => { const n = arr.length; a = a < 0 ? Math.max(0, n + a) : a; b = b < 0 ? n + b : b; return arr.slice(a, b + 1); };
  return {
    kind: 'memory',
    async get(k) { return alive(k) ? kv.get(k) : null; },
    async set(k, v, o = {}) {
      if (o.nx && alive(k)) return false;
      kv.set(k, String(v));
      if (o.ex) exp.set(k, Date.now() + o.ex * 1000); else exp.delete(k);
      return true;
    },
    async del(k) { const had = alive(k); kv.delete(k); exp.delete(k); return had ? 1 : 0; },
    async sadd(k, ...m) { const s = coll(k, () => new Set()); let n = 0; for (const x of m) if (!s.has(x)) { s.add(x); n++; } return n; },
    async srem(k, ...m) { if (!alive(k)) return 0; const s = kv.get(k); let n = 0; for (const x of m) if (s.delete(x)) n++; return n; },
    async sismember(k, m) { return alive(k) && kv.get(k).has(m); },
    async smembers(k) { return alive(k) ? [...kv.get(k)] : []; },
    async scard(k) { return alive(k) ? kv.get(k).size : 0; },
    async zadd(k, score, m) { const z = coll(k, () => new Map()); const had = z.has(m); z.set(m, Number(score)); return had ? 0 : 1; },
    async zrem(k, m) { return alive(k) && kv.get(k).delete(m) ? 1 : 0; },
    async zrevrange(k, a, b) { if (!alive(k)) return []; return slice([...kv.get(k).entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]), a, b); },
    async zscore(k, m) { return alive(k) && kv.get(k).has(m) ? kv.get(k).get(m) : null; },
    async zcard(k) { return alive(k) ? kv.get(k).size : 0; },
    async lpush(k, v) { const l = coll(k, () => []); l.unshift(String(v)); return l.length; },
    async lrange(k, a, b) { return alive(k) ? slice(kv.get(k), a, b) : []; },
    async ltrim(k, a, b) { if (alive(k)) kv.set(k, slice(kv.get(k), a, b)); return 'OK'; },
    async hincrby(k, f, n) { const h = coll(k, () => ({})); h[f] = (Number(h[f]) || 0) + n; return h[f]; },
    async hset(k, f, v) { coll(k, () => ({}))[f] = String(v); return 1; },
    async hget(k, f) { return alive(k) && kv.get(k)[f] != null ? String(kv.get(k)[f]) : null; },
    async hgetall(k) { const o = {}; if (alive(k)) for (const [f, v] of Object.entries(kv.get(k))) o[f] = String(v); return o; },
    async incr(k) { const n = (Number(alive(k) ? kv.get(k) : 0) || 0) + 1; kv.set(k, String(n)); return n; },
    async expire(k, s) { if (alive(k)) exp.set(k, Date.now() + s * 1000); return 1; },
  };
}

let db = null;
function getStore() {
  if (!db) db = REST_URL && REST_TOKEN ? redisBackend() : memoryBackend();
  return db;
}
/** For tests: swap in a fresh in-memory store. */
function resetMemoryStore() { db = memoryBackend(); return db; }

const getJSON = async (s, k) => { const v = await s.get(k); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } };
const setJSON = (s, k, v, o) => s.set(k, JSON.stringify(v), o);

module.exports = { getStore, resetMemoryStore, getJSON, setJSON, restUrl };
