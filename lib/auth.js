/* Who is asking? Every API call carries the Vatar session token the game got from Vatar.session():
 *   Authorization: Bearer vtr1.…
 * We check it with Vatar's server (session/verify) using VATAR_SECRET, and cache the answer until it expires.
 * The name and player id always come from Vatar, never from the request body.
 *
 * Without VATAR_SECRET the server runs in open dev mode and accepts `dev.<base64url json {id,name}>` tokens, so
 * you can play and test locally. In production with a secret set, dev tokens are refused unless ALLOW_DEV=1. */
'use strict';

const VATAR_API = (process.env.VATAR_API || 'https://lagoslife.app/api/games/v1').replace(/\/$/, '');
const SECRET = process.env.VATAR_SECRET || '';
const DEV_OK = !SECRET || process.env.ALLOW_DEV === '1';

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

/** Call Vatar's server API with our secret. */
async function vatar(path, body) {
  const r = await fetch(VATAR_API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return Object.assign({ http: r.status }, j);
}

const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
const cache = new Map();

async function authenticate(req) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'no_session', 'Missing session token.');

  if (token.startsWith('dev.')) {
    if (!DEV_OK) throw new HttpError(401, 'dev_disabled', 'Dev sessions are off on this server.');
    let p;
    try { p = JSON.parse(Buffer.from(token.slice(4), 'base64url').toString('utf8')); } catch (e) { throw new HttpError(400, 'bad_dev_token'); }
    const id = String(p.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    if (id.length < 3) throw new HttpError(400, 'bad_dev_token');
    return { id: 'd_' + id, name: cleanName(p.name) || 'Guest', mode: 'dev', token };
  }

  if (!SECRET) throw new HttpError(503, 'vatar_not_configured', 'VATAR_SECRET is not set on the server.');
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.player;

  const r = await vatar('/session/verify', { session: token });
  if (r.http !== 200) {
    if (r.http === 401) throw new HttpError(401, r.error || 'invalid_token', r.message);
    if (r.http === 403) throw new HttpError(403, r.error || 'forbidden', r.message);
    throw new HttpError(502, 'vatar_unreachable', 'Could not check the session with Vatar.');
  }
  const player = { id: String(r.playerId), name: cleanName(r.name) || 'Player', mode: r.mode === 'test' ? 'test' : 'live', token };
  cache.set(token, { player, until: Math.min(Number(r.exp) || Infinity, Date.now() + 10 * 60 * 1000) });
  if (cache.size > 500) for (const k of cache.keys()) { cache.delete(k); if (cache.size < 300) break; }
  return player;
}

module.exports = { authenticate, vatar, HttpError, DEV_OK, SECRET, VATAR_API, cleanName };
